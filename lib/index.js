/**
 * Host half of `@jbdesarrollo/dsh-client-ui-mutdiff`: the "open in editor" bridge.
 *
 * A browser cannot launch a process, and DSH's own opener is not enough for this
 * feature: `host.openPath` (what the file link in every tool row calls) hands a
 * path to the operating system's **default application** — `xdg-open` on Linux,
 * `Invoke-Item` on Windows, `wslpath -w` + `Invoke-Item` on WSL — with no way to
 * name an editor and no way to ask for a line. The text-editor intent that does
 * exist (`openNativeTextFile`, `open -t`) is host-internal: it is reachable only
 * from pathless `settings.openDocument` / `agentPreset.openDocument`, never from
 * a client payload, and it still means "the default editor".
 *
 * So this half registers one HTTP route on the composed web server and spawns
 * the chosen editor's own CLI in the host process — `code -r -g <file>:<line>`
 * and its siblings. That is the same kind of host-side action DSH already
 * performs when `dsh web` hands its URL to the default browser, and it is the
 * only mechanism a third-party plugin may open without codegen: the `/api` RPC
 * bridge is a fixed, generated capability set whose one interceptor seat belongs
 * to the API gateway.
 *
 * Three fail-soft edges, because this package supports more than one DSH build
 * and must never take a client boot down:
 *
 * - **No `webServer` service** (a profile without the browser surface, or a
 *   future rename). The dependency is requested with the scoped-inject form, so
 *   the row still activates and simply never registers a route; the browser half
 *   then hides its action and DSH's own file link keeps working.
 * - **No editor CLI on the PATH.** The route answers `no-editor`, and the
 *   browser half falls back to DSH's own default-application opener.
 * - **Malformed plugin config.** Every field is read defensively with plain
 *   JavaScript, so a typo in a patch layer degrades to the defaults instead of
 *   failing the load. (The package keeps its no-new-dependencies promise: no
 *   schema library is pulled in for four optional fields.)
 *
 * ## Security posture
 *
 * The route spawns a process, so it is fenced the way DSH fences its own
 * privileged methods, and for the same two reasons: a DNS-rebinding page (Host
 * names the attacker's domain while the socket reaches this server) and a
 * cross-site request fired from a malicious page. The fence reads the same
 * headers the shipped `/api` fence reads — loopback `Host`, no
 * `sec-fetch-site: cross-site`, and an `Origin` that is same-origin when the
 * browser attaches one — and additionally requires JSON, which keeps a
 * cross-origin form post (the one request shape a browser sends without a
 * preflight) out. A request that fails any check gets 403 before a path is even
 * parsed.
 *
 * The payload cannot name an arbitrary program either: the browser sends a path
 * and an optional line hint, and the *host* decides which executable to run from
 * its own editor table. The resolved file must exist, must be a regular file,
 * and — whenever any root is known — must live under a registered workspace or a
 * configured root.
 */

import { spawn } from 'node:child_process'
import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, isAbsolute, join, resolve, sep } from 'node:path'

/** Route prefix owned by this plugin. Distinct from `/api` and `/plugins`. */
const ROUTE_PREFIX = '/mutdiff'
const STATE_PATH = `${ROUTE_PREFIX}/state`
const OPEN_PATH = `${ROUTE_PREFIX}/open`
/** Largest request body accepted, in bytes. The payload is one path plus a hint. */
const MAX_BODY_BYTES = 16 * 1024
/** Longest line hint accepted, in characters. Mirrors the browser half's cap. */
const MAX_HINT_LENGTH = 240
/** Files larger than this are never scanned for a line hint. */
const MAX_SCAN_BYTES = 8 * 1024 * 1024
/** Window in which an identical open request is treated as a duplicate. */
const DEDUPE_MS = 700
/** How long one PATH scan is reused. Keeps a click from re-stating the whole PATH. */
const DETECT_TTL_MS = 10_000

/**
 * Editors this bridge can drive, in auto-detection preference order.
 *
 * `family` selects the argument shape, because "open this file at this line" is
 * spelled differently per editor:
 * - `code` — VS Code and every fork of it (Cursor, Windsurf, Antigravity, Trae,
 *   VSCodium, Insiders). `-r` reuses the last active window, so repeated edits
 *   land as new tabs in one window instead of opening window after window, and
 *   `-g <file>:<line>` opens the file and puts the cursor on that line. Under
 *   WSL the `code` shim translates the path and attaches to the WSL remote.
 * - `zed` — accepts `file:line`.
 * - `subl` — Sublime Text accepts `file:line`; `-a` reuses the running window.
 * - `args` — a plain path, the shape a generic editor is most likely to accept.
 */
const EDITOR_CANDIDATES = [
  { id: 'code', label: 'VS Code', command: 'code', family: 'code' },
  { id: 'code-insiders', label: 'VS Code Insiders', command: 'code-insiders', family: 'code' },
  { id: 'cursor', label: 'Cursor', command: 'cursor', family: 'code' },
  { id: 'windsurf', label: 'Windsurf', command: 'windsurf', family: 'code' },
  { id: 'antigravity', label: 'Antigravity', command: 'antigravity', family: 'code' },
  { id: 'trae', label: 'Trae', command: 'trae', family: 'code' },
  { id: 'codium', label: 'VSCodium', command: 'codium', family: 'code' },
  { id: 'zed', label: 'Zed', command: 'zed', family: 'zed' },
  { id: 'subl', label: 'Sublime Text', command: 'subl', family: 'subl' },
]

/**
 * Environment variables this row reads. They are the invocation-scoped way to
 * ask for the behaviour (`MUTDIFF_AUTO_OPEN=1 dsh web`), need no file, and
 * the plugin never writes one: it has no filesystem write call at all.
 *
 * The names carry the plugin's own prefix, not the harness's, and that is
 * deliberate: `DSH_` is bootstrap-reserved — a `.env` that declares a `DSH_`
 * name makes the launcher refuse to start at all ("only the launching
 * environment may set it") — so a plugin squatting that prefix would turn a
 * reader's per-project `.env` into a boot failure. `MUTDIFF_*` works from the
 * launching environment, from a `.env`, or from an alias.
 *
 * A variable present for this process wins over the row's config, because
 * naming it *is* the deliberate act, while a config file may have been written
 * months ago.
 */
export const ENV_EDITOR = 'MUTDIFF_EDITOR'
export const ENV_AUTO_OPEN = 'MUTDIFF_AUTO_OPEN'
export const ENV_GOTO_LINE = 'MUTDIFF_GOTO_LINE'
/** Values that turn a boolean variable off; anything else present means on. */
const FALSEY = /^(0|false|no|off|none|)$/i

/**
 * Read the plugin's config defensively, from the two surfaces it has.
 *
 * 1. The environment — `MUTDIFF_AUTO_OPEN=1`, `MUTDIFF_EDITOR=code`,
 *    `MUTDIFF_GOTO_LINE=0` — which applies to one invocation and touches no
 *    file.
 * 2. The loader row's config, for anyone who wants a durable default in their
 *    *own* patch layer (`~/.dsh/profiles/<profile>/cordis.patch.yml`):
 *
 * ```yaml
 * - id: client-ui-mutdiff
 *   config: { autoOpen: true, editor: code }
 * ```
 *
 * Either surface is optional and the plugin writes neither. The `sources` field
 * tells the browser which surface decided each value, so the picker can say so
 * instead of silently disagreeing with a switch.
 *
 * @param raw - the loader's config for this row, of unknown shape.
 * @param env - environment carrying the invocation variables.
 * @returns normalized settings with every default filled in.
 */
export function normalizeConfig(raw, env = process.env) {
  const source = typeof raw === 'object' && raw !== null ? raw : {}
  const strings = (value) => (Array.isArray(value) ? value.filter((entry) => typeof entry === 'string' && entry.trim() !== '') : [])
  const variable = (name) => {
    const value = env?.[name]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
  }
  const flag = (name) => {
    const value = variable(name)
    return value === undefined ? undefined : !FALSEY.test(value)
  }
  const rowEditor = typeof source.editor === 'string' && source.editor.trim() !== '' ? source.editor.trim() : undefined
  const envEditor = variable(ENV_EDITOR)
  const envAutoOpen = flag(ENV_AUTO_OPEN)
  const envGotoLine = flag(ENV_GOTO_LINE)
  const rowAutoOpen = source.autoOpen === true ? true : undefined
  const rowGotoLine = typeof source.gotoLine === 'boolean' ? source.gotoLine : undefined
  return {
    /** `auto` (the first detected editor), an id from the editor table, or a command resolved on the PATH. */
    editor: envEditor ?? rowEditor ?? 'auto',
    /** Open every successful edit/write without a click. Off by default: it raises the editor window. */
    autoOpen: envAutoOpen ?? rowAutoOpen ?? false,
    /** Jump to the first changed line instead of the top of the file. */
    gotoLine: envGotoLine ?? rowGotoLine ?? true,
    /** Extra roots an openable file may live under, on top of the registered workspaces. */
    roots: strings(source.roots),
    /** Explicit argument template (`{file}` / `{line}`) for an editor absent from the table. */
    openArgs: Array.isArray(source.openArgs) ? source.openArgs.filter((entry) => typeof entry === 'string') : [],
    /** Which surface decided each value: the environment, the row's config, or nothing. */
    sources: {
      editor: envEditor !== undefined ? 'env' : rowEditor !== undefined ? 'config' : 'default',
      autoOpen: envAutoOpen !== undefined ? 'env' : rowAutoOpen !== undefined ? 'config' : 'default',
      gotoLine: envGotoLine !== undefined ? 'env' : rowGotoLine !== undefined ? 'config' : 'default',
    },
  }
}

/** Whether one path is an executable regular file. */
function isExecutable(file) {
  try {
    accessSync(file, constants.X_OK)
    return statSync(file).isFile()
  } catch {
    return false
  }
}

/**
 * Resolve a command the way a POSIX shell would, without a shell.
 * @param command - a bare name resolved on the PATH, or a path used verbatim.
 * @param env - environment carrying the PATH.
 * @returns the executable's path, or `undefined` when nothing matches.
 */
function which(command, env = process.env) {
  if (command.includes('/') || command.includes('\\')) return isExecutable(command) ? command : undefined
  for (const directory of String(env.PATH ?? '').split(delimiter)) {
    if (directory === '') continue
    const candidate = join(directory, command)
    if (isExecutable(candidate)) return candidate
  }
  return undefined
}

/**
 * The editors this host can actually launch, in preference order.
 * @param config - normalized settings.
 * @param env - environment carrying the PATH.
 * @returns available entries (`{id, label, command, family, path}`).
 */
export function detectEditors(config, env = process.env) {
  const found = []
  const seen = new Set()
  const consider = (entry) => {
    if (seen.has(entry.id)) return
    const path = which(entry.command, env)
    if (path === undefined) return
    seen.add(entry.id)
    found.push({ ...entry, path })
  }
  // A configured editor is offered first: it is the user's own choice, and the
  // browser picker lists it at the top, where the click already is.
  if (config.editor !== 'auto') {
    const known = EDITOR_CANDIDATES.find((entry) => entry.id === config.editor)
    if (known !== undefined) consider(known)
    else consider({ id: config.editor, label: basename(config.editor), command: config.editor, family: 'code' })
  }
  for (const entry of EDITOR_CANDIDATES) consider(entry)
  return found
}

/** Argument vector for one editor, honoring an explicit `openArgs` template first. */
function editorArgs(editor, config, file, line) {
  if (config.openArgs.length > 0) {
    return config.openArgs
      .filter((argument) => argument !== '{line}' || config.gotoLine)
      .map((argument) => argument.replaceAll('{file}', file).replaceAll('{line}', String(line)))
  }
  if (!config.gotoLine) return editor.family === 'subl' ? ['-a', file] : editor.family === 'code' ? ['-r', file] : [file]
  const target = `${file}:${line}`
  switch (editor.family) {
    case 'code': return ['-r', '-g', target]
    case 'zed': return [target]
    case 'subl': return ['-a', target]
    default: return [file]
  }
}

/** WHATWG authority of one `Host`/`Origin` header value, or `undefined` when unparseable. */
function authorityOf(value) {
  if (typeof value !== 'string' || value === '') return undefined
  try {
    return new URL(`http://${value}`)
  } catch {
    return undefined
  }
}

/**
 * Whether a hostname names the local loopback authority. Mirrors the shipped
 * browser-trust fence: `localhost`, the IPv6 loopback literal, or any 127/8
 * address — and nothing else, so a LAN name never passes.
 */
function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * The browser-trust fence for this route, reading the same request facts the
 * shipped `/api` fence reads.
 * @param req - the incoming request.
 * @returns true when the request may reach the opener.
 */
export function isTrustedRequest(req) {
  const headers = req?.headers ?? {}
  const authority = authorityOf(headers.host)
  if (authority === undefined) return false
  if (!isLoopbackHostname(authority.hostname)) return false
  if (headers['sec-fetch-site'] === 'cross-site') return false
  const origin = headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === authority.host
  } catch {
    return false
  }
}

/** Whether a resolved path sits at or under one root. */
function isWithin(target, root) {
  if (target === root) return true
  return target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)
}

/**
 * Validate one browser-supplied path.
 *
 * The browser never names a program, but it does name a file, so the file is
 * constrained: absolute (with `~` expanded), free of control characters, an
 * existing regular file after symlink resolution, and — whenever at least one
 * root is known — inside a registered workspace or a configured root. A `write`
 * that created a brand-new file resolves normally; a path the agent deleted
 * between the render and the click answers `not-found` rather than opening
 * something stale.
 *
 * @param rawPath - the payload's `path`.
 * @param roots - canonical directories an openable file may live under.
 * @returns `{file}` on success, `{reason}` otherwise.
 */
export function resolveTargetPath(rawPath, roots) {
  if (typeof rawPath !== 'string') return { reason: 'bad-request' }
  const trimmed = rawPath.trim()
  if (trimmed === '' || trimmed.length > 4096) return { reason: 'bad-request' }
  if (/[\u0000\r\n]/.test(trimmed)) return { reason: 'bad-request' }
  const expanded = trimmed === '~' ? homedir() : trimmed.startsWith('~/') ? join(homedir(), trimmed.slice(2)) : trimmed
  const absolute = isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded)
  let real
  try {
    real = realpathSync(absolute)
  } catch {
    return { reason: 'not-found' }
  }
  try {
    if (!statSync(real).isFile()) return { reason: 'not-a-file' }
  } catch {
    return { reason: 'not-found' }
  }
  if (roots.length > 0 && !roots.some((root) => isWithin(real, root))) return { reason: 'outside-workspace' }
  return { file: real }
}

/**
 * Resolve the line hint the browser computed into a real line number.
 *
 * The diff DSH records carries no line numbers (`FileDiff` is a path plus the
 * before and after text), so the browser sends the first line the mutation
 * *added* — the line a reader actually wants to see — and the host finds it in
 * the file on disk. The first trimmed-equal line wins; a long added line is
 * matched by containment instead. No match, or a file too large to scan,
 * degrades to line 1 rather than failing the open.
 *
 * @param file - the resolved file path.
 * @param hint - the first-added-line hint, or `undefined`.
 * @returns a 1-based line number.
 */
export function lineForHint(file, hint) {
  if (typeof hint !== 'string' || hint.trim() === '') return 1
  const needle = hint.trim().slice(0, MAX_HINT_LENGTH)
  let text
  try {
    if (statSync(file).size > MAX_SCAN_BYTES) return 1
    text = readFileSync(file, 'utf8')
  } catch {
    return 1
  }
  const lines = text.split('\n')
  const exact = lines.findIndex((line) => line.trim() === needle)
  if (exact >= 0) return exact + 1
  const loose = lines.findIndex((line) => line.includes(needle))
  return loose >= 0 ? loose + 1 : 1
}

/** Send one JSON response and end it. */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Read a JSON body under the size cap, or `undefined` for anything else. */
function readJsonBody(req) {
  return new Promise((settle) => {
    const type = String(req?.headers?.['content-type'] ?? '').toLowerCase()
    // JSON is required on purpose: a cross-origin `<form>` is the one request
    // shape a browser sends without a preflight, and it cannot produce this type.
    if (!type.startsWith('application/json')) {
      if (typeof req?.resume === 'function') req.resume()
      settle(undefined)
      return
    }
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        settle(undefined)
        if (typeof req.destroy === 'function') req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        settle(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        settle(undefined)
      }
    })
    req.on('error', () => { settle(undefined) })
  })
}

/** Parent directory of one path, for the spawned editor's cwd. */
function parentOf(file) {
  const index = file.lastIndexOf(sep)
  return index > 0 ? file.slice(0, index) : undefined
}

/**
 * Launch one editor process and forget about it.
 *
 * `detached` + `unref` is deliberate: the editor's shim can outlive the request
 * (under WSL the `code` shim hands off to the Windows CLI, which itself waits
 * for the window), nothing is streamed back to the browser, and the harness must
 * not hold a handle that keeps the process alive or delays a shutdown.
 */
function defaultLaunch({ command, args, file }) {
  const child = spawn(command, args, { cwd: parentOf(file), detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
  return child
}

/**
 * Build the bridge: the route handler, the state it answers from, and the open
 * path itself.
 *
 * The seams (`detect`, `launch`, `roots`) exist so the test suite can drive the
 * whole contract — fence, validation, hint resolution, argument construction —
 * with no editor installed and without spawning anything. This mirrors the
 * injectable runner seam the shipped native path opener uses, for the same
 * reason.
 *
 * @param options - config, context (for workspace roots), and test seams.
 * @returns `{handler, state, open, config}`.
 */
export function createBridge(options = {}) {
  const config = options.config ?? normalizeConfig(undefined)
  const ctx = options.ctx
  const detect = options.detect ?? (() => detectEditors(config))
  const launch = options.launch ?? defaultLaunch
  const recent = new Map()
  let detectCache = { at: 0, value: null }

  /**
   * Detected editors, memoized for {@link DETECT_TTL_MS}. Every candidate costs
   * one `access`+`stat` per PATH entry, so an uncached scan on each click would
   * re-stat hundreds of directories; the short TTL still notices an editor
   * installed while the harness is running.
   */
  const editors = () => {
    const now = Date.now()
    if (detectCache.value === null || now - detectCache.at > DETECT_TTL_MS) detectCache = { at: now, value: detect() }
    return detectCache.value
  }

  /** Registered workspace roots, read lazily: the registry may activate after this row. */
  const workspaceRoots = () => {
    if (typeof options.roots === 'function') return options.roots()
    if (Array.isArray(options.roots)) return options.roots
    try {
      const registry = typeof ctx?.get === 'function' ? ctx.get('workspaceRegistry') : undefined
      const list = typeof registry?.list === 'function' ? registry.list() : []
      return Array.isArray(list) ? list.map((workspace) => workspace?.path).filter((path) => typeof path === 'string') : []
    } catch {
      return []
    }
  }

  const allowedRoots = () => {
    const canonical = []
    for (const root of [...config.roots, ...workspaceRoots()]) {
      if (typeof root !== 'string' || root === '') continue
      try {
        canonical.push(realpathSync(root))
      } catch {
        // A configured root that no longer exists contributes nothing rather
        // than refusing every open.
      }
    }
    return [...new Set(canonical)]
  }

  const state = () => {
    const available = editors()
    const effective = available.find((editor) => editor.id === config.editor) ?? available[0] ?? null
    return {
      ok: true,
      autoOpen: config.autoOpen,
      gotoLine: config.gotoLine,
      configured: config.editor,
      effective: effective === null ? null : effective.id,
      // Which surface pinned auto-open, so the picker can name it instead of
      // offering a switch that silently loses to the invocation.
      autoOpenPinnedBy: config.sources?.autoOpen === 'env' ? ENV_AUTO_OPEN : null,
      editors: available.map((editor) => ({ id: editor.id, label: editor.label })),
    }
  }

  const open = (payload) => {
    const available = editors()
    if (available.length === 0) return { ok: false, reason: 'no-editor' }
    const requested = typeof payload?.editor === 'string' && payload.editor !== '' ? payload.editor : undefined
    const editor = available.find((entry) => entry.id === requested) ?? available.find((entry) => entry.id === config.editor) ?? available[0]
    const target = resolveTargetPath(payload?.path, allowedRoots())
    if (target.file === undefined) return { ok: false, reason: target.reason, editor: editor.id }
    const line = config.gotoLine ? lineForHint(target.file, payload?.hint) : 1
    const args = editorArgs(editor, config, target.file, line)
    const now = Date.now()
    for (const [stampKey, stamp] of recent) if (now - stamp > DEDUPE_MS) recent.delete(stampKey)
    const key = `${editor.id}\u0000${target.file}\u0000${String(line)}`
    if (recent.has(key)) return { ok: true, editor: editor.id, line, args, deduped: true }
    recent.set(key, now)
    try {
      launch({ command: editor.path, args, file: target.file })
    } catch (error) {
      return { ok: false, reason: 'spawn-failed', editor: editor.id, message: String(error?.message ?? error) }
    }
    return { ok: true, editor: editor.id, line, args }
  }

  const handler = (req, res) => {
    let pathname
    try {
      pathname = new URL(req?.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '')
    } catch {
      sendJson(res, 400, { ok: false, reason: 'bad-request' })
      return
    }
    if (!isTrustedRequest(req)) {
      sendJson(res, 403, { ok: false, reason: 'untrusted' })
      return
    }
    if (pathname === STATE_PATH && req.method === 'GET') {
      sendJson(res, 200, state())
      return
    }
    if (pathname === OPEN_PATH && req.method === 'POST') {
      readJsonBody(req).then((payload) => {
        if (typeof payload !== 'object' || payload === null) {
          sendJson(res, 400, { ok: false, reason: 'bad-request' })
          return
        }
        sendJson(res, 200, open(payload))
      }, () => { sendJson(res, 400, { ok: false, reason: 'bad-request' }) })
      return
    }
    sendJson(res, 404, { ok: false, reason: 'not-found' })
  }

  return { handler, state, open, config }
}

/** Cordis plugin name, shown in loader diagnostics. */
export const name = 'client-ui-mutdiff'

/**
 * Host entry: register the editor bridge once a web server exists.
 *
 * The dependency is requested through the scoped-inject form rather than a
 * declared `inject: ['webServer']`, and that difference matters: a declared
 * service that never appears parks this row as `pending` forever. Here the row
 * activates immediately and the callback runs only if (and whenever) a web
 * server is composed — so a headless profile, or a future DSH build that renames
 * the service, leaves the browser half's own fail-soft path in charge instead of
 * breaking the tree.
 *
 * @param ctx - the plugin context.
 * @param rawConfig - the row's config, of unknown shape.
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const bridge = createBridge({ config, ctx })
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: bridge.handler,
    }), 'client-ui-mutdiff: editor bridge route')
    const available = detectEditors(config)
    if (available.length === 0) {
      webCtx.logger?.warn?.(`[dsh-client-ui-mutdiff] no editor CLI found on the PATH (${EDITOR_CANDIDATES.map((editor) => editor.command).join(', ')}); the browser half falls back to DSH's own opener`)
      return
    }
    webCtx.logger?.info?.(`[dsh-client-ui-mutdiff] open-in-editor bridge ready: ${available.map((editor) => `${editor.id} (${editor.path})`).join(', ')}`)
  })
}

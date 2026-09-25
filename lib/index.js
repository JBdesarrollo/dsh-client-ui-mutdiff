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
 * ## Live follow
 *
 * The route above is click-driven, and the browser half drives it once per
 * settled mutation from a row it happens to be rendering. That is the right
 * shape for a click and the wrong shape for a second screen: the line is
 * resolved from a *text hint* the browser computes, it only fires once a call
 * has settled, and it needs the conversation to exist on the page at all.
 *
 * This half therefore also drives the editor itself when
 * {@link ENV_FOLLOW} asks for it. The host is the one place every mutation
 * passes through, already carries line-accurate metadata, and needs no browser:
 * `session/event` is a per-append firehose, and two of its events describe a
 * file change outright —
 *
 * - `tool/call` carries the raw arguments the model produced. For `edit` the
 *   `old_string` is in the file *before* the mutation applies, so locating it
 *   reports the line the agent is working on as it commits to the change,
 *   rather than after the fact.
 * - `tool/result` carries the tool's private `meta` payload, which for
 *   `write`/`edit` is the applied contextual diff (`{diffs: [{path, oldText,
 *   newText}]}`, three context lines per hunk). Locating that hunk in the file
 *   on disk yields the first line the mutation actually added — no hint, no
 *   guessing, and `write` is covered too, because a full overwrite has no
 *   `old_string` to locate.
 *
 * Both triggers funnel into one reveal, and the reveal is what the route's
 * `open` does: the editor's own CLI, at a line. A burst of mutations to one
 * file coalesces into a single spawn, and a file already sitting on that line
 * is not re-opened, which is what keeps a long edit loop from raising the
 * window once per hunk.
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
 * - **No `session/event` feed** (a profile without the session service, or a
 *   future rename). The bus seat is feature-detected, so live follow simply
 *   never sees an event, and the click path is untouched.
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
 * A reveal for one file under live follow waits this long before spawning, so a
 * burst of mutations to the same file becomes one editor call carrying the last
 * line the burst reached. The wait is not extended by later events, so a long
 * edit loop is followed rather than starved.
 */
export const FOLLOW_COALESCE_MS = 150
/** A file already sitting on this line is not re-opened within this window. */
export const FOLLOW_STICKY_MS = 1500
/** Longest block of lines matched against a file when locating a change. */
const MAX_BLOCK_LINES = 400

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
export const ENV_SHORT = 'MUTDIFF'
export const ENV_EDITOR = 'MUTDIFF_EDITOR'
export const ENV_AUTO_OPEN = 'MUTDIFF_AUTO_OPEN'
export const ENV_GOTO_LINE = 'MUTDIFF_GOTO_LINE'
export const ENV_FOLLOW = 'MUTDIFF_FOLLOW'
/** Values that turn a boolean variable off; anything else present means on. */
const FALSEY = /^(0|false|no|off|none|)$/i

/**
 * Read the plugin's config defensively, from the two surfaces it has.
 *
 * 1. The environment, which applies to one invocation and touches no file.
 *    The one-word form is the short path:
 *
 * ```bash
 * MUTDIFF=code dsh web     # open every edit in VS Code
 * MUTDIFF=1 dsh web        # same, with the auto-detected editor
 * MUTDIFF=0 dsh web        # explicitly off
 * ```
 *
 *    and the precise form spells each field out: `MUTDIFF_AUTO_OPEN=1`,
 *    `MUTDIFF_EDITOR=code`, `MUTDIFF_GOTO_LINE=0`, `MUTDIFF_FOLLOW=1` (any of
 *    them overrides the word form).
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
  const envFollow = flag(ENV_FOLLOW)
  const rowAutoOpen = source.autoOpen === true ? true : undefined
  const rowGotoLine = typeof source.gotoLine === 'boolean' ? source.gotoLine : undefined
  const rowFollow = source.follow === true ? true : undefined
  /*
   * The one-word form. Naming `MUTDIFF` at all is the request, so a bare switch
   * word turns the automatic mode on with whatever editor is detected, and any
   * other word is read as the editor — `MUTDIFF=code` is the whole command. The
   * spelled-out variables above still win, so the short form is a convenience
   * and never a trap.
   */
  const shortValue = variable(ENV_SHORT)
  let shortEditor
  let shortAutoOpen
  if (shortValue !== undefined) {
    if (FALSEY.test(shortValue)) shortAutoOpen = false
    else if (/^(1|true|on|yes|auto)$/i.test(shortValue)) shortAutoOpen = true
    else {
      shortEditor = shortValue
      shortAutoOpen = true
    }
  }
  const editor = envEditor ?? shortEditor ?? rowEditor ?? 'auto'
  const autoOpen = envAutoOpen ?? shortAutoOpen ?? rowAutoOpen ?? false
  return {
    /** `auto` (the first detected editor), an id from the editor table, or a command resolved on the PATH. */
    editor,
    /** Open every successful edit/write without a click. Off by default: it raises the editor window. */
    autoOpen,
    /**
     * Follow the agent's edits from the host, in real time, without the browser
     * asking. Off by default; when on it is the only thing that opens an editor
     * for a mutation, because the browser half stands its own auto-open down to
     * keep one change from opening two windows.
     */
    follow: envFollow ?? rowFollow ?? false,
    /** Jump to the first changed line instead of the top of the file. */
    gotoLine: envGotoLine ?? rowGotoLine ?? true,
    /** Extra roots an openable file may live under, on top of the registered workspaces. */
    roots: strings(source.roots),
    /** Explicit argument template (`{file}` / `{line}`) for an editor absent from the table. */
    openArgs: Array.isArray(source.openArgs) ? source.openArgs.filter((entry) => typeof entry === 'string') : [],
    /** Which surface decided each value: the environment, the row's config, or nothing. */
    sources: {
      editor: envEditor !== undefined ? 'env' : shortEditor !== undefined ? 'env' : rowEditor !== undefined ? 'config' : 'default',
      autoOpen: envAutoOpen !== undefined ? 'env' : shortAutoOpen !== undefined ? 'env' : rowAutoOpen !== undefined ? 'config' : 'default',
      follow: envFollow !== undefined ? 'env' : rowFollow !== undefined ? 'config' : 'default',
      gotoLine: envGotoLine !== undefined ? 'env' : rowGotoLine !== undefined ? 'config' : 'default',
    },
    /** The variable that pinned auto-open, so the picker names the word the reader should type. */
    autoOpenVariable: envAutoOpen !== undefined ? ENV_AUTO_OPEN : shortAutoOpen !== undefined ? ENV_SHORT : null,
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

/* -------------------------------------------------------------------------- */
/* Live follow: the host drives the editor from the session's own event feed   */
/* -------------------------------------------------------------------------- */

/** Split text into lines on LF, tolerating CRLF, without trimming anything. */
function splitLines(text) {
  return (text.includes('\r\n') ? text.replaceAll('\r\n', '\n') : text).split('\n')
}

/** Read a file's text for scanning, or `undefined` when it cannot be scanned. */
function readText(file) {
  if (typeof file !== 'string' || file === '') return undefined
  try {
    if (statSync(file).size > MAX_SCAN_BYTES) return undefined
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

/** Index of the first line of `block` inside `lines`, or `-1`. Exactly consecutive. */
export function findBlock(lines, block) {
  if (block.length === 0 || block.length > lines.length) return -1
  const head = block[0]
  const limit = lines.length - block.length
  for (let start = 0; start <= limit; start++) {
    if (lines[start] !== head) continue
    let matched = true
    for (let offset = 1; offset < block.length; offset++) {
      if (lines[start + offset] !== block[offset]) {
        matched = false
        break
      }
    }
    if (matched) return start
  }
  return -1
}

/**
 * Locate a hunk's block in a file, exactly when the file still contains it
 * verbatim.
 *
 * A contextual diff is a block of consecutive lines (three context lines, the
 * change, three more), so matching the whole block is far more specific than
 * matching one line — which is what makes this worth doing instead of reusing
 * the single-line hint path. A file that has moved on since the mutation
 * (a formatter, a later edit, a rewrite) will not contain it verbatim, so the
 * match falls back to progressively shorter prefixes of the block and then to
 * the block's first non-blank line, and the caller treats those as
 * approximations rather than the hunk's true start.
 *
 * @param lines - the file's lines.
 * @param block - the hunk's lines, in file order.
 * @returns `{index, exact}`, with `index === -1` when nothing matched.
 */
export function findChangeAnchor(lines, block) {
  if (block.length === 0) return { index: -1, exact: false }
  const direct = findBlock(lines, block)
  if (direct >= 0) return { index: direct, exact: true }
  for (let size = Math.min(block.length - 1, 3); size >= 1; size--) {
    const hit = findBlock(lines, block.slice(0, size))
    if (hit >= 0) return { index: hit, exact: false }
  }
  const firstContent = block.findIndex((line) => line.trim() !== '')
  if (firstContent < 0) return { index: -1, exact: false }
  const needle = block[firstContent].trim()
  const hit = lines.findIndex((line) => line.trim() === needle)
  return { index: hit, exact: false }
}

/** Index of the first line with content, or `0` when the block is all blank. */
function firstContentIndex(block) {
  const index = block.findIndex((line) => line.trim() !== '')
  return index < 0 ? 0 : index
}

/**
 * Index of the first line a mutation *added*, within the hunk's own new block.
 *
 * The metadata DSH attaches is before/after text and carries no line numbers,
 * so the added lines are recovered by aligning the two blocks: a tiny LCS over
 * a block that is a few context lines plus the change (capped at
 * {@link MAX_BLOCK_LINES} a side). Walking that alignment from the top, the
 * first step that consumes a new line without consuming an old one is exactly
 * the first line the mutation added — the line a reader wants the caret on.
 *
 * A pure insertion (`oldText: null`, a new file or an overwrite) has nothing to
 * align against, so its first line with content stands in, which is the same
 * choice the browser half makes for `write`.
 *
 * @param oldLines - the hunk's before lines.
 * @param newLines - the hunk's after lines.
 * @returns a 0-based index into `newLines`.
 */
export function firstAddedIndex(oldLines, newLines) {
  const rows = oldLines.length
  const cols = newLines.length
  if (cols === 0) return 0
  if (rows === 0) return firstContentIndex(newLines)
  const width = cols + 1
  const table = new Uint16Array((rows + 1) * width)
  const length = (row, column) => table[row * width + column]
  for (let row = rows - 1; row >= 0; row--) {
    for (let column = cols - 1; column >= 0; column--) {
      table[row * width + column] = oldLines[row] === newLines[column]
        ? length(row + 1, column + 1) + 1
        : Math.max(length(row + 1, column), length(row, column + 1))
    }
  }
  let row = 0
  let column = 0
  while (row < rows && column < cols) {
    if (oldLines[row] === newLines[column]) {
      row += 1
      column += 1
      continue
    }
    if (length(row + 1, column) >= length(row, column + 1)) {
      row += 1
      continue
    }
    // An insertion: this new line has no counterpart in the old block, so it is
    // the first line the mutation added.
    return column
  }
  // A removal-only hunk adds nothing; point at the hunk itself.
  return column < cols ? column : firstContentIndex(newLines)
}

/**
 * The 1-based line of the first line one applied hunk added, in the file on
 * disk.
 *
 * @param text - the file's text, read after the mutation applied.
 * @param diff - one `{path, oldText, newText}` hunk from the tool's metadata.
 * @returns a 1-based line number, or `undefined` when the change cannot be
 * found in the file at all — nothing is a better answer than the top of a file
 * the editor should not be moved to.
 */
export function lineForDiff(text, diff) {
  const fileLines = splitLines(text)
  const block = splitLines(typeof diff?.newText === 'string' ? diff.newText : '').slice(0, MAX_BLOCK_LINES)
  if (block.length === 1 && block[0] === '') return undefined
  const anchor = findChangeAnchor(fileLines, block)
  if (anchor.index < 0) return undefined
  // An approximate anchor only proves where the block starts, so the hunk's
  // first line is reported rather than a guessed offset inside it.
  if (!anchor.exact) return anchor.index + 1
  const oldLines = typeof diff?.oldText === 'string' ? splitLines(diff.oldText).slice(0, MAX_BLOCK_LINES) : null
  const offset = oldLines === null ? firstContentIndex(block) : firstAddedIndex(oldLines, block)
  return anchor.index + offset + 1
}

/**
 * The 1-based line where a probe string sits in the file on disk.
 *
 * This is the pre-apply half of live follow: an `edit` call's `old_string` is
 * in the file *before* the mutation runs (that is the tool's own precondition),
 * so locating it reports the line the agent is working on at the moment it
 * commits to the change, and the caret is already in place when the write
 * lands a moment later.
 *
 * A probe that is nowhere in the file resolves to `undefined` rather than to
 * line 1. That case is not hypothetical — the agent may have written an
 * `old_string` the file no longer matches, or the file may have moved under it
 * — and the applied diff arrives a moment later with the authoritative line, so
 * revealing nothing is strictly better than flinging the caret to the top of the
 * file and back.
 *
 * @param text - the file's text, read before the mutation applies.
 * @param probe - the `old_string` block.
 * @returns a 1-based line number, or `undefined` when the probe is not there.
 */
export function lineForProbe(text, probe) {
  if (typeof probe !== 'string' || probe.trim() === '') return undefined
  const anchor = findChangeAnchor(splitLines(text), splitLines(probe).slice(0, MAX_BLOCK_LINES))
  return anchor.index < 0 ? undefined : anchor.index + 1
}

/**
 * Narrow opaque `tool/result` metadata to the applied file diffs it may carry.
 *
 * The shape belongs to `@deepseek-ai/dsh-tool-fs` (`FsDiffMeta`) and this
 * package is not allowed to import it — a third-party plugin may not depend on
 * a tool package, and the loader would not resolve it anyway. So the shape is
 * mirrored here defensively, exactly as the shipped narrowing does: a malformed
 * payload (another tool's meta, an older build, a replayed log) yields
 * `undefined` and follow simply does nothing.
 *
 * @param meta - the event's `meta`, of unknown shape.
 * @returns validated hunks, or `undefined`.
 */
export function diffsFromMeta(meta) {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const diffs = meta.diffs
  if (!Array.isArray(diffs) || diffs.length === 0) return undefined
  const valid = diffs.filter((entry) => (
    typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    && typeof entry.path === 'string' && entry.path !== ''
    && (entry.oldText === null || typeof entry.oldText === 'string')
    && typeof entry.newText === 'string'
  ))
  return valid.length === 0 ? undefined : valid
}

/** Parse the raw argument JSON of one `tool/call`, or `undefined`. */
function parseCallArguments(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : undefined
  } catch {
    // A streamed call whose arguments are still arriving is not an error here:
    // the result event carries the applied diff, and that is the authoritative
    // trigger.
    return undefined
  }
}

/** The `file_path`/`path` argument of a mutation call, or `undefined`. */
function callPath(args) {
  const value = args?.file_path ?? args?.path
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Build the live-follow engine.
 *
 * It is a pure consumer of the session event feed: give it events, it decides
 * where the agent is working and asks the bridge to reveal that line. Every
 * dependency is a seam (`open`, `read`, `timer`, `now`) so the whole decision
 * surface — which events count, where the line lands, how a burst coalesces —
 * is driven in tests with no editor installed, no process spawned, and no
 * clock to wait on.
 *
 * @param options - config, the reveal (`open`) seam, and test seams.
 * @returns `{handle, schedule, dispose}`.
 */
export function createFollower(options = {}) {
  const config = options.config ?? normalizeConfig(undefined)
  const open = typeof options.open === 'function' ? options.open : () => ({ ok: false, reason: 'no-bridge' })
  const read = typeof options.read === 'function' ? options.read : readText
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  const coalesceMs = options.coalesceMs ?? FOLLOW_COALESCE_MS
  const stickyMs = options.stickyMs ?? FOLLOW_STICKY_MS
  const timer = options.timer ?? {
    set: (callback, ms) => setTimeout(callback, ms),
    clear: (handle) => { clearTimeout(handle) },
  }
  /** Per file: the burst waiting to be revealed. */
  const pending = new Map()
  /** Per file: the line the editor was last placed on, and when. */
  const revealed = new Map()

  const reveal = (file, line) => {
    const last = revealed.get(file)
    if (last !== undefined && last.line === line && now() - last.at < stickyMs) return
    let result
    try {
      result = open({ path: file, line })
    } catch {
      // The bridge reports its own failures; a throw here must not reach the
      // session's event dispatch, which contains listener failures only by
      // logging them.
      return
    }
    if (result?.ok === true) revealed.set(file, { line: typeof result.line === 'number' ? result.line : line, at: now() })
  }

  const schedule = (file, line) => {
    if (typeof file !== 'string' || file === '') return
    if (!Number.isSafeInteger(line) || line < 1) return
    const waiting = pending.get(file)
    if (waiting !== undefined) {
      // The burst is already scheduled: carry the newest line instead of
      // spawning again, and do not push the deadline out, so a long edit loop
      // stays followed rather than starved.
      waiting.line = line
      return
    }
    const entry = { line, handle: null }
    entry.handle = timer.set(() => {
      pending.delete(file)
      reveal(file, entry.line)
    }, coalesceMs)
    pending.set(file, entry)
  }

  const onCall = (data) => {
    const probe = probeForCall(data, read)
    if (probe !== undefined) schedule(probe.path, probe.line)
  }

  const onResult = (data) => {
    const diffs = diffsFromMeta(data?.meta)
    if (diffs === undefined) return
    const seen = new Set()
    for (const diff of diffs) {
      if (seen.has(diff.path)) continue
      seen.add(diff.path)
      const text = read(diff.path)
      if (typeof text !== 'string') continue
      schedule(diff.path, lineForDiff(text, diff))
    }
  }

  return {
    /**
     * One committed session event.
     * @param session - the session that grew (unused; the feed is process-wide).
     * @param event - the appended event.
     */
    handle(session, event) {
      if (config.follow !== true) return
      const type = event?.type
      if (type === 'tool/call') onCall(event.data)
      else if (type === 'tool/result') onResult(event.data)
    },
    /** Reveal a line directly, through the same coalescing path (tests, and any future caller). */
    schedule,
    /** Drop every waiting burst. Registered as an effect cleanup. */
    dispose() {
      for (const entry of pending.values()) timer.clear(entry.handle)
      pending.clear()
    },
  }
}

/**
 * Resolve the line one `tool/call` is about to change, or `undefined` when the
 * call carries no probe this can trust.
 *
 * Only `edit` qualifies: its `old_string` is on disk before the mutation runs,
 * which is exactly the window that makes the reveal feel live. `write` has no
 * probe — its content is not in the file yet — so it is left to the result
 * event's applied diff. A file that cannot be read, a probe the file no longer
 * contains, or a call whose arguments are still streaming (unparseable JSON)
 * all resolve to `undefined` rather than to a guess, so follow reports nothing
 * instead of moving the editor to the wrong place.
 *
 * @param call - one `tool/call` payload: `{name, arguments}`.
 * @param read - file reader seam.
 * @returns the resolved `{path, line}`, or `undefined`.
 */
export function probeForCall(call, read = readText) {
  if (call?.name !== 'edit') return undefined
  const args = parseCallArguments(call.arguments)
  const file = callPath(args)
  const probe = args?.old_string
  if (file === undefined || typeof probe !== 'string' || probe.trim() === '') return undefined
  const text = read(file)
  if (typeof text !== 'string') return undefined
  const line = lineForProbe(text, probe)
  return line === undefined ? undefined : { path: file, line }
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
      // Live follow owns the automatic mode: the browser half stands its own
      // auto-open down while this is true, so one change never opens two windows.
      autoOpen: config.follow ? false : config.autoOpen,
      follow: config.follow,
      gotoLine: config.gotoLine,
      configured: config.editor,
      effective: effective === null ? null : effective.id,
      // Which surface pinned auto-open, so the picker can name it instead of
      // offering a switch that silently loses to the invocation.
      autoOpenPinnedBy: config.autoOpenVariable ?? null,
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
    // An explicit line wins over the hint: live follow resolved it against the
    // applied diff, which knows more than a text the browser picked out.
    const explicit = Number.isSafeInteger(payload?.line) && payload.line >= 1 ? payload.line : undefined
    const line = config.gotoLine ? explicit ?? lineForHint(target.file, payload?.hint) : 1
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
 * Host entry: register the editor bridge once a web server exists, and — when
 * asked — follow the agent's edits from the session's own event feed.
 *
 * The web-server dependency is requested through the scoped-inject form rather
 * than a declared `inject: ['webServer']`, and that difference matters: a
 * declared service that never appears parks this row as `pending` forever. Here
 * the row activates immediately and the callback runs only if (and whenever) a
 * web server is composed — so a headless profile, or a future DSH build that
 * renames the service, leaves the browser half's own fail-soft path in charge
 * instead of breaking the tree.
 *
 * Follow is a separate seat on purpose. It needs no web server, no route and no
 * browser, so tying it to that inject would make the feature disappear exactly
 * where it is most useful (a second screen watching a headless run). The
 * listener is registered through `ctx.on`, which is fiber-owned and disposed
 * with the row, and feature-detected, so a context with no event bus — or a
 * DSH build without the session service — leaves follow idle rather than
 * failing the load.
 *
 * @param ctx - the plugin context.
 * @param rawConfig - the row's config, of unknown shape.
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const bridge = createBridge({ config, ctx })
  if (config.follow && typeof ctx.on === 'function') {
    const follower = createFollower({ config, open: bridge.open })
    const listener = (session, event) => {
      try {
        follower.handle(session, event)
      } catch (error) {
        // A presentation extra must never disturb the session's append path,
        // which contains observer failures only by logging them.
        ctx.logger?.warn?.(`[dsh-client-ui-mutdiff] live follow skipped an event: ${String(error?.message ?? error)}`)
      }
    }
    if (typeof ctx.effect === 'function') {
      // The listener itself is row-owned (`ctx.on` disposes it with the fiber);
      // the effect exists for the waiting bursts, which a timer would otherwise
      // keep alive past the row's unload.
      ctx.effect(() => () => { follower.dispose() }, 'client-ui-mutdiff: live follow timers')
    }
    ctx.on('session/event', listener)
    ctx.logger?.info?.(`[dsh-client-ui-mutdiff] live follow on (${ENV_FOLLOW}): every applied edit/write reveals its own line as it lands`)
  }
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

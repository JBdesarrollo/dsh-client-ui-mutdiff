# dsh-client-ui-mutdiff

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) client plugin that makes file `write` / `edit` tool diffs render **already expanded** and **not truncated** in the agent chat — and can open the file being edited in **your own editor**, at the line that changed, so the code is on another screen while the agent works. That last part comes in two flavours: a button per row, and **live follow**, where the host follows the agent's edits from the session's own event feed and moves the editor to the changed line in real time — with a real line number, not a guess.

## What it does

By default the Harness collapses every tool row and caps the diff shown in the conversation at 8 lines, so a big edit shows a `…` and you have to click the row (and then hit **Inspect**) to read the real change.

This plugin replaces the `edit` and `write` tool rows with a diff row that:

- **Opens by default** — you don't have to click the row to see the code that changed.
- **Colours the code** — the changed lines are syntax-highlighted with the same grammar as the file's language, instead of being flat monochrome text.
- **Shows the full diff** — `maxLines: Infinity`, so long before/after hunks are never collapsed mid-file.
- **Opens in your editor** — one click, or a switch, sends the file to VS Code, Cursor, Windsurf, Zed, Sublime or anything else with a CLI, with the caret on the first line that changed. See [Open in editor](#open-in-editor).
- Keeps everything else intact: the file path link, the `+A -R` badge, the running / failed / stopped states, a copy action, and the **Inspect** button in the details panel.

It is a small, focused plugin: it only touches the `edit`/`write` toolview. Terminal, read, search, and web rows keep their stock behavior.

## Open in editor

DSH can already hand a file to the operating system — clicking a path in any tool row calls `host.openPath`, which resolves to `xdg-open`, `open`, or, under WSL, `wslpath -w` + `Invoke-Item`. That opens **the default application for that file type**, with no say in which editor it is and no way to ask for a line. This plugin adds the missing half: a button that opens the file in *your* editor, at the line the mutation changed.

Every `edit` / `write` row now carries an action beside **Inspect**:

- **Open in editor** — launches your editor's CLI on that file, caret on the first added line.
- **▾** — a picker with the editors this host can actually launch, and an **Open every edited file automatically** switch.
- **Live follow** — one variable makes the *host* follow edits in real time, with a real line number instead of a hint, whether or not the page is showing the row. See [Live follow](#live-follow).

Nothing is on by default and nothing is configured in a file: the button is there, auto-open is off, and one environment variable on the invocation turns the automatic mode on — see [Turning it on for one run](#turning-it-on-for-one-run).

Clicking runs `code -r -g <file>:<line>` (or the equivalent for your editor). `-r` reuses the last active window, so a session's edits collect as **tabs in one window** instead of spawning window after window, and `-g` puts the caret on the change. Under WSL the `code` shim attaches to the WSL remote, so the file opens as a WSL file rather than a `\\wsl.localhost\` UNC path. The editor picks up later writes on its own — that is the "live on the other screen" part — and auto-open re-focuses the file for each new mutation.

### Editors

Detection is a PATH scan over this table, in order; the configured editor is offered first, and the first match wins:

| id | editor | arguments |
| --- | --- | --- |
| `code` | VS Code | `-r -g <file>:<line>` |
| `code-insiders`, `cursor`, `windsurf`, `antigravity`, `trae`, `codium` | the VS Code family | same |
| `zed` | Zed | `<file>:<line>` |
| `subl` | Sublime Text | `-a <file>:<line>` |
| anything else | a command you configure | `<file>`, or your own `openArgs` |

### Turning it on for one run

Naming one word on the invocation **is** the opt-in. It touches no file, applies to that process only, and the next plain `dsh web` is back to the manual button:

```bash
MUTDIFF=code dsh web      # open every successful edit/write in VS Code
MUTDIFF=1 dsh web         # same, with whichever editor is detected
MUTDIFF=windsurf dsh web  # or that one
MUTDIFF=0 dsh web         # explicitly off, whatever else is configured
```

The spelled-out form is there when a field needs to be precise, and any of it overrides the word:

```bash
MUTDIFF_EDITOR=zed dsh web          # the editor for this run
MUTDIFF_AUTO_OPEN=1 dsh web         # the automatic mode on its own
MUTDIFF_GOTO_LINE=0 dsh web         # open the file without jumping to the change
```

An alias gives you a flag of your own:

```bash
alias dsh-code='MUTDIFF_AUTO_OPEN=1 MUTDIFF_EDITOR=code dsh web'
alias dsh-live='MUTDIFF_FOLLOW=1 MUTDIFF_EDITOR=code dsh web'   # the host follows, in real time
```

| variable | values | effect |
| --- | --- | --- |
| `MUTDIFF` | an editor id or command → that editor, automatic mode on; `1`/`true`/`on`/`auto` → detected editor, automatic mode on; `0`/`false`/`no`/`off` → off | the one-word form |
| `MUTDIFF_AUTO_OPEN` | `1`/`true`/anything present → on; `0`, `false`, `no`, `off`, empty → off | open every settled, successful mutation without a click |
| `MUTDIFF_FOLLOW` | as above | the **host** follows every applied edit in real time, from the session's own event feed, with the exact line — see [Live follow](#live-follow). It owns the automatic mode while it is on |
| `MUTDIFF_EDITOR` | an id from the table above, or a command on the PATH | the editor this run prefers |
| `MUTDIFF_GOTO_LINE` | as above | whether to jump to the first changed line |

The names carry the plugin's own prefix because the harness reserves `DSH_`: a `.env` that declares a `DSH_` name makes the launcher refuse to start ("only the launching environment may set it"), so a plugin squatting that prefix would turn a reader's per-project `.env` into a boot failure. `MUTDIFF_*` therefore works from the launching environment, from a `.env`, or from an alias — and the plugin reads nothing from the `DSH_` namespace.

Naming a variable is the deliberate act for that process, so it **outranks a preference stored in the browser**: while a variable pins auto-open, the picker shows the pinned value, says which variable did it, and refuses to toggle — rather than offering a switch that silently loses. The editor picker keeps working regardless, because a chosen editor rides each open request.

### A durable default (optional, and yours to write)

If you would rather not type the variable every time, put it in **your** patch layer — `~/.dsh/profiles/web/cordis.patch.yml`, the same file you already use for other overrides:

```yaml
- id: client-ui-mutdiff
  name: '@jbdesarrollo/dsh-client-ui-mutdiff'   # optional assertion: a mismatched id is skipped, not misconfigured
  config:
    follow: false        # default: false — the host follows every applied edit in real time
    autoOpen: true       # default: false
    editor: code         # auto | an id above | a command resolved on the PATH
    gotoLine: true       # default: true
    roots: []            # extra directories an openable file may live under
    openArgs: []         # e.g. ['--line', '{line}', '{file}'] for an editor not in the table
```

**The plugin reads that config and never writes it.** In fact the whole package contains no filesystem write call: the host half scans the PATH, reads the file (to resolve the line hint), registers one HTTP route, and spawns the editor — nothing else, in any directory. Its only durable state is the browser preference the picker keeps in `localStorage`, which belongs to the reader's browser, not to your checkout.

An id that is not installed is a warning, not a failure: DSH reports `patch: entry ... not found` and boots without it, so this block can be added before or after the plugin itself.

### Why not `dsh web --code`

A plugin cannot add a flag to `dsh web`, and that is a deliberate contract rather than an omission: the launcher hands everything after its own flags to the profile's tree verbatim so the app owns its flag family, and the app's parser (`dsh-web-app/startup`) declares exactly `--host`, `--port`, `--trusted-host` and `--no-open`. An undeclared `--code` is an `unknown option` grammar error before any plugin loads, so no plugin can claim it. An environment variable is the same "only this invocation" intent in the one place a plugin may put it — and unlike a flag it needs no change to any shipped package.

## Live follow

The action above is a click, and the automatic mode is driven by the page: it fires when a mutation row it is rendering settles, and it resolves the line from a **text hint** — the first line the mutation added, matched against the file on disk. That is a fine shape for a click. It is a poor fit for a second screen, where the whole point is that the editor is already showing the line the agent is on:

- Only mutations the chat happens to be rendering are followed.
- The hint can land on an earlier copy of the same line, and any mismatch degrades to the top of the file.
- The reveal waits for the whole call to settle, so a long `edit` moves the caret only once it is over.

Live follow moves the decision to the host, where it belongs, and hands the editor a **real line number** instead of a hint. One variable turns it on for one run:

```bash
MUTDIFF_FOLLOW=1 dsh web                 # follow every edit, with the detected editor
MUTDIFF=code MUTDIFF_FOLLOW=1 dsh web    # and name the editor at the same time
MUTDIFF_FOLLOW=0 dsh web                 # explicitly off, whatever else is configured
```

The host subscribes to the session's own event feed (`session/event`), so it sees what the agent is doing with no browser, no click, and no need for the conversation to be on screen at all. Two of those events describe a file change outright:

| event | what it carries | what it reveals |
| --- | --- | --- |
| `tool/call` | the raw arguments the model produced | an `edit`'s `old_string` is in the file *before* the mutation applies, so the caret is already in place when the change lands |
| `tool/result` | the tool's private `meta`: `{diffs: [{path, oldText, newText}]}`, one applied hunk per entry with three context lines | the first line the mutation **added**, located in the file on disk — authoritative, and `write` is covered too |

**Why the line is exact.** A contextual diff is a block of consecutive lines, and matching a block is far more discriminating than matching a single line: a hunk whose first line also appears elsewhere in the file still lands on the right copy. The added line is then recovered by aligning `oldText` against `newText` — a small LCS over a block that is a few context lines plus the change — which is what makes the number exact rather than approximate.

**And why it is never a guess.** When the file has genuinely moved on since the mutation (a formatter, a later edit, a rewrite), the reveal reports the hunk's first line — what the anchor can actually prove — rather than an offset inside a block it could not match. And when it can find nothing at all — a file it cannot read, a hunk that is nowhere in the file, an `edit` whose `old_string` no longer matches — it **reveals nothing**. The applied diff is a moment behind with the authoritative line, so staying put beats flinging the caret to the top of the file and back. The same rule covers the pre-apply probe: an unmatched `old_string` is a `write`-like wait, not a jump to line 1.

`write` has no probe on disk before it runs, so it is left to the applied diff, where its block *is* the file content and its first line with content is the line a reader wants.

**Bursts and repeats are absorbed.** Mutations in flight for one file coalesce into a single editor call carrying the last line the burst reached, and a file already sitting on that line is not re-opened for a while afterwards — so a long edit loop is followed rather than turned into a window-raising storm.

With follow on, the browser half **stands its own automatic mode down** (the `/mutdiff/state` answer reports `follow: true` and `autoOpen: false`), so one change can never open two windows; the picker shows the switch disabled with a note saying why. Everything else — the click, the picker, the diff row — behaves exactly as before.

### What follow does not do

- **It does not highlight a range.** The editor's CLI takes a file and a line and nothing more — no range, no decoration, no `preserveFocus` — so a reveal pauses on the line, and **every reveal raises the editor window**, the same caveat the automatic mode carries, now once per mutation. A VS Code extension could do better (highlight the changed range without stealing focus) at the cost of a second artifact the reader has to install; this plugin stays one package.
- **It follows this harness process, not one conversation.** Every session in the process reveals its edits, subagents included, so a subagent editing another file will move the window there.
- **It follows tools, not the disk.** A `bash` command, a formatter, or an external process rewriting a file is invisible to it: the feed describes tool calls, not `inotify`. `edit` and `write` are what it covers.
- **Reads are not followed.** The `read` tool's own metadata does carry an exact numbered window (`{path, offset, lines, totalLines}`), but following reads is a different feature with a different pacing — a window per read rather than a line per mutation — and it is deliberately not in this one.

## How it works

### The diff row

The Harness's `tool.call.toolview` slot is `kind: 'keyed'`, and a keyed slot allows a second registration for the same key at a **different priority** — the lowest priority renders. The shipped file-mutation rows register `edit` and `write` at the default priority `0`, so this plugin registers the same keys at `priority: -1` and takes over those rows without modifying any shipped package.

It reuses the primitives already provided by the Harness shell (`@deepseek-ai/dsh-client-ui-primitives` — `CodeBlock`, `DiffBlock`, `DisclosureRow`, icons) and does **not** pull in new dependencies. The editor action is the one part that cannot live in the browser, and it is the host entry's job.

### The editor bridge

The browser cannot launch a process, and no shipped client-reachable host capability can name an editor: `host.openPath` means "the default application", and the text-editor intent that does exist (`open -t`) is host-internal, reachable only from pathless `settings.openDocument` / `agentPreset.openDocument`. So `lib/index.js` — a no-op host entry until 0.3.0 — registers one HTTP route on the composed web server and spawns the editor's shim in the host process. That is the same kind of host-side action `dsh web` performs when it hands its URL to your browser, and it is the only mechanism open to a third-party plugin here: the `/api` RPC bridge is a fixed, generated capability set whose single interceptor seat belongs to the API gateway.

| route | body | answer |
| --- | --- | --- |
| `GET /mutdiff/state` | — | `{ok, editors: [{id, label}], effective, autoOpen, gotoLine}` |
| `POST /mutdiff/open` | `{path, hint?, line?, editor?}` | `{ok: true, editor, line}` or `{ok: false, reason}` |

The browser never names a program: the host picks the executable from its own table, so the payload cannot become an arbitrary command runner. The file itself is constrained too — absolute (with `~` expanded), free of control characters, an existing regular file after `realpath`, and, whenever any root is known, inside a registered workspace or a configured `roots` entry.

**The line.** DSH's recorded diff carries no line numbers (`FileDiff` is a path plus before/after text), so the browser sends the first line the mutation *added* and the host finds it in the file on disk; with no match, or for a file too large to scan, the file opens at the top. A `write` has nothing to compare against, so it uses its first non-empty line. If the same line appears earlier in the file, the caret lands on that earlier copy — the file is still the right one.

**Why a hint instead of a line number.** A tool row must render the moment its block arrives, and for a running call the change is not on disk yet; resolving the hint host-side at click (or settle) time is what makes the line correct even when the file was rewritten in between.

**A line, when one is known.** The payload may also carry `line` — a positive integer the host resolved itself — and it outranks the hint, because a line computed from the applied diff knows more than a text the browser picked out. Under [live follow](#live-follow) that is the only field the host sends: it drives the same `open` path as a click, so both triggers share the dedupe window, the root check and the editor table, and neither can spawn a different program.

### The follow engine

Follow is a pure consumer of the event feed, and everything it depends on is a seam (`open`, `read`, `timer`, `now`), which is what lets the decision surface be driven in tests with no editor installed, no process spawned and no clock to wait on. Its one timer is the coalescing window: a burst in flight for one file becomes one editor call, and the row's unload drops whatever is still waiting rather than letting a timer outlive it.

The line arithmetic is the part worth knowing about, because it is where the accuracy lives. `lineForProbe` locates an `edit`'s `old_string` before the mutation applies. `lineForDiff` locates the applied hunk's block — exactly, then by progressively shorter prefixes, then by its first non-blank line — and offsets into it by the index of the first line the hunk added, which comes from aligning `oldText` against `newText`. A block too large to align is capped, an unreadable or oversized file yields nothing, a change that cannot be found yields nothing, and a reveal the bridge refuses (outside the workspace, no editor) is not remembered as done, so the next event still tries.

That last pair of rules is the whole safety story: follow would rather do nothing than move the editor somewhere it cannot justify. Both were checked against real recorded sessions — every intact hunk in this plugin's own history resolved to the exact line whose text is the first line the hunk added.

### Security

The route spawns a process, so it is fenced the way DSH fences its own privileged methods, for the same two reasons — a DNS-rebinding page whose `Host` names the attacker's domain while the socket reaches this server, and a cross-site request fired from a malicious page. The fence requires a loopback `Host`, no `sec-fetch-site: cross-site`, a same-origin `Origin` when the browser attaches one, and `content-type: application/json` (the one request shape a browser sends without a preflight is a form post, and a form cannot produce that type). Anything else gets a 403 before a path is even parsed.

Consequently the action is **loopback-only**: a browser reaching this harness over the LAN sees no button, exactly as it cannot use `host.openPath`. A file-open request is also deduplicated within 700 ms, so a double click opens one window.

Live follow needs none of that fence, because nothing crosses a web boundary: the paths come from the session's own event log, which is the same trust level as the agent that wrote them, and a payload the browser cannot build cannot be forged. It does still pass the *same* validation on the way out — the file must exist, be a regular file, and live inside a registered workspace whenever any root is known — so a mutation outside the session's workspace reveals nothing rather than opening an editor for it.

### When the bridge is absent

Everything above is additive. If there is no web server (a headless profile), the service was renamed, or the host half is simply older than the browser half, the state read fails once, a single diagnostic is logged to the browser console, the action is not rendered, and DSH's own file link (the default-application opener) keeps working. The diff row itself renders exactly as before.

Live follow has its own edge of the same kind: it rides the `session/event` feed, so on a build where that feed is missing or renamed, the listener is never seated and follow stays idle — the load does not fail, and the click path is untouched.

### Caveats

- **Auto-open raises the editor window.** Launching an editor from a CLI focuses it, so with auto-open on, every edit brings VS Code to the front — which is the point when that window is on your second screen, and an interruption when it is not. That is why it is off by default. Live follow has the same habit, once per mutation (see [What follow does not do](#what-follow-does-not-do)), which is why it too is opt-in.
- **Auto-open fires on settled mutations only**, once per call and only on success: a failed or interrupted mutation opens nothing, and a `write` that is still running has no file on disk yet. Follow reveals an `edit` slightly earlier — at the moment the model commits to the change and the `old_string` is still findable — and everything else when it lands.
- **`-r` is a preference, not a lock.** If VS Code's own window settings route the file elsewhere, its CLI honors them; `openArgs` overrides the whole argument vector when you need something else.

## Syntax highlighting

No highlighter is bundled and none is needed: **the Harness shell already ships one**. It contains [shiki](https://shiki.style) with VS Code's TextMate grammars, its own light/dark token palette, and on-demand grammar loading:

- `typescript`, `shellscript` and `json` are preloaded; ~22 more (python, go, rust, java, c, cpp, csharp, kotlin, swift, php, yaml, toml, ini, markdown, html, css, scss, less, sql, xml, lua) load on demand.
- The palette is the `--shiki-token-*` custom properties that `@deepseek-ai/dsh-client-ui-theme` defines for both themes, so highlighted diffs follow the active DSH theme automatically.
- A file's language is derived from the hunk path extension; an unknown or absent extension falls back to plain text.

The shell's `ReadBlock` (read rows) and `CodeBlock` (markdown fences, `run_code`) already tokenize through shiki — **`DiffBlock` is the one code surface that does not**, so it renders plain text. This plugin therefore builds the diff card itself, out of the exported `CodeBlock` primitive, one highlighted block per side, keeping the shipped layout: a path header, every removed line, then every added line. The `+`/`-` prefixes are drawn by CSS on the highlighted lines, so they survive tokenization, and each side also carries a tint and a coloured left border — which keeps the direction readable when a file has no grammar at all.

If the shell ever stops exposing `CodeBlock`, the plugin falls back to the shipped `DiffBlock` (plain, still expanded and untruncated) rather than failing.

See `docs/upstream-diffblock-lang.md` for why the durable fix belongs upstream in `DiffBlock`.

## Compatibility

The Harness client API is still pre-1.0 and **renames things between releases**. This plugin renders through the shipped `tool.call.toolview` slot and the shipped primitives, so it has to track those changes. It is currently verified against both ends of that range:

| DSH version | Status |
| --- | --- |
| `0.1.1-rc.2` | supported |
| `0.1.5-rc.2` (`latest`) | supported |
| anything else | untested — run `npm test`; the plugin skips itself with a console diagnostic when the primitives no longer match |

`0.1.2` – `0.1.4` are untested: their client packages are no longer published, so that surface could not be inspected.

The editor bridge rides the host side, so it has its own compatibility edge: it needs the `webServer` service, which it requests with the scoped-inject form rather than a declared dependency. On a build where that service is missing or renamed, the route is never registered and the browser half hides the action — neither half fails a boot. Only `0.1.1-rc.2` has been exercised live.

Live follow has a third edge, and it is the narrowest: it needs the **`session/event` feed** and the two event shapes above (`tool/call`'s raw `arguments`, `tool/result`'s `meta`, and specifically `@deepseek-ai/dsh-tool-fs`'s `{diffs: [{path, oldText, newText}]}` payload). None of that is imported — a third-party plugin cannot depend on a tool package, so the shape is mirrored defensively, exactly as the shipped narrowing does, and anything that does not match is ignored rather than trusted. The listener seat is feature-detected, so a build without the feed leaves follow idle. Verified live on `0.1.1-rc.2`.

### What broke in 0.1.5 (fixed in 0.1.2)

Version `0.1.1` of this plugin only worked on `dsh <= 0.1.1-rc.2`. Installing it on a newer Harness produced a browser boot failure (`Failed to load plugins` / `N entries did not activate`) — three independent API changes, each fatal on its own:

| Change in 0.1.2+ | What 0.1.1 did | Symptom |
| --- | --- | --- |
| `@deepseek-ai/dsh-client-runtime` was **deleted** (`0.1.1-rc.2` was its last release) | `require("@deepseek-ai/dsh-client-runtime/client")` at factory scope | the client entry cannot materialize: `client-modules: cannot resolve "@deepseek-ai/dsh-client-runtime/client"` |
| the client cordis service `connection` was renamed to `remote` | declared `inject: ["slots", "connection"]` | the entry parks as `pending` forever, failing the whole boot |
| `DiffBlock` began **requiring** a `labels` prop and dereferences it unconditionally (`labels.copied`, `labels.files(...)`) | passed only `diffs`/`maxLines`/`className` | `TypeError: Cannot read properties of undefined (reading 'copied')` on every mutation row |
| the diff card moved off `callView`/`resultView` onto the call args plus `block.meta` | read the lifecycle views | no diff rendered at all (silent regression) |

Version `0.1.2` of this plugin is dual-compatible: it prefers the shipped helper when one exists and falls back to a local equivalent, passes `labels` unconditionally (0.1.1 ignores unknown props), derives the diff from whichever block shape the host provides, declares only the `slots` service, and — most importantly — **skips itself with a console diagnostic instead of failing the client entry** when the primitives no longer match.

## Requirements

- DeepSeek Harness (`dsh`) — this is a plugin for the `web` profile. The diff row needs the browser surface; the editor bridge additionally needs the composed web server (`ctx.webServer`, shipped by `@deepseek-ai/dsh-host-webserver` in the `web` bundle); live follow needs no web server at all, only the session event feed that the `base` bundle composes.
- `pnpm` on the PATH (the `dsh plugin` command forwards to pnpm in the profile directory).
- An editor with a CLI on the PATH (`code`, `cursor`, `windsurf`, `zed`, `subl`, …) for the editor action. Without one the action does not render and the file link still opens with the system default application.

## Installation

From your Harness home, add the package with a single command:

```bash
dsh plugin --profile web add github:JBdesarrollo/dsh-client-ui-mutdiff
```

If you shared it as a tarball or a local folder, use the path instead:

```bash
dsh plugin --profile web add ./dsh-client-ui-mutdiff-0.3.3.tgz
# or
dsh plugin --profile web add ../your-copy-of/dsh-client-ui-mutdiff
```

Because the package declares `dsh.bundle`, `dsh plugin add` installs it, appends it to `dsh.profile.bundles`, and applies its `cordis.patch.yml` — which mounts the plugin as a client entry. No manual editing of your profile is needed.

Then **restart** the Harness web process so the client plugin roster re-scans:

```bash
# stop your running dsh web (Ctrl+C), then:
dsh web
```

Finally, hard-refresh the browser (the bundle is served with `cache-control: no-cache`, so a normal refresh picks it up).

## Verify

After restarting, the plugin bundle should be served:

```bash
curl -s "http://127.0.0.1:3080/plugins/@jbdesarrollo/dsh-client-ui-mutdiff/client.js" | head -c 80
```

It should start with `window.__ModuleLoader__.load({`. Its entry should also appear in the page's `__DSH_BOOT__` manifest.

Then open a session and have the agent `write` or `edit` a file — the diff appears **open** and **complete**.

For the editor bridge, the host route should answer, and the host log should name the editors it found:

```bash
curl -s http://127.0.0.1:3080/mutdiff/state
# {"ok":true,"autoOpen":false,"follow":false,"gotoLine":true,"configured":"auto","effective":"code","autoOpenPinnedBy":null,"editors":[{"id":"code","label":"VS Code"}]}

curl -s -X POST http://127.0.0.1:3080/mutdiff/open \
  -H 'content-type: application/json' \
  -d "{\"path\":\"$PWD/README.md\",\"hint\":\"## Verify\"}"
# {"ok":true,"editor":"code","line":182,"args":["-r","-g",".../README.md:182"]}
```

`dsh web` also logs `[dsh-client-ui-mutdiff] open-in-editor bridge ready: code (/path/to/code)` once the route is up, and warns when no editor CLI was found. A `no-editor` or `outside-workspace` answer names its own reason in the row's action bar.

For live follow, start the run with the variable and watch the boot log:

```bash
MUTDIFF=code MUTDIFF_FOLLOW=1 dsh web
# [dsh-client-ui-mutdiff] live follow on (MUTDIFF_FOLLOW): every applied edit/write reveals its own line as it lands
```

`/mutdiff/state` then answers `"follow":true` with `"autoOpen":false`, and having the agent `edit` a file moves the editor to the changed line as the mutation lands — with the row's own switch shown disabled in the picker, because the host is doing the opening.

If the boot fails instead, the browser console names the failing entry. A message mentioning `client-modules:` means the module graph rejected the bundle (a DSH API rename); a message mentioning `did not activate` means the entry itself failed: `import failed` for a module-resolution problem, or `pending (waiting for services: …)` for a service rename.

## Development

```bash
npm install
npm test
```

`test/run.mjs` boots `lib/client.js` inside a stub module loader twice — once against the `0.1.1-rc.2` client surface and once against the `0.1.5-rc.2` one — asserts that the two keys are registered at a shadowing priority, and renders real rows (settled / running / errored, both block shapes) through React. Twelve scenarios cover the two client surfaces, the highlighted diff, the plain `DiffBlock` fallback, the fail-soft skip when no diff renderer is exposed, the integrity of the injected stylesheet, the editor action and the payload it posts (clicked through recorded jsx props, since the harness has no DOM), the auto-open decision and its stand-down under live follow, the host half — route registration, PATH detection, path/hint/line validation, the fence, the body contract and a real HTTP round trip — the follow engine on a manual clock (an applied hunk's exact line, a pre-apply probe, coalescing, the sticky window, non-mutation events, a file that cannot be read, a reveal the bridge refused, and `dispose`), and the precedence between an invocation variable, a stored browser choice and a host default. All of the above rides injectable seams, so no editor is installed and nothing is spawned.

Two scenarios go further. When `@deepseek-ai/cordis` resolves (it does from inside a DSH profile tree), one drives the host row on a real cordis context and asserts the route arrives through scoped injection — including for a web server composed *after* the row — and another drives **live follow end to end**: a real event on the real context, through the real `apply`, reaching a real `spawn`, with a stand-in `code` shim on the PATH recording the argv it was handed. Otherwise both print a skip line. The suite also scrubs `MUTDIFF_*` from its own environment first: the plugin reads those from `process.env`, and a developer running `npm test` from inside the `dsh web` they started with `MUTDIFF=code` would otherwise get different answers than a clean shell. Pass a path to test another build (it must live in a package with `"type": "module"`, since the harness re-imports it per scenario):

```bash
node test/run.mjs /path/to/other/client.js
```

Scenario E deserves a note: the bundle carries its CSS as one long JavaScript string literal. A stray unescaped quote in it ends the literal early — the module still parses, the markup is unchanged, and the browser silently receives a truncated stylesheet, so nothing but a check on the stylesheet itself catches it. It also fails when a rendered row uses a class the stylesheet does not define, which is why every new action class needs a rule.

Two limits are deliberate. The harness renders static markup, so effects never run: the three-line effect that turns an auto-open plan into a request is covered by reading, not by a scenario, and the picker's open/closed markup is covered by its rules and labels rather than by a click — which is why the follow note is asserted against the bundle text rather than against a rendered menu. And the host half's own process boundary is exercised only against a shim on a temporary PATH, never against a real editor.

## Files

```
package.json        # dsh.bundle + dsh.client declaration
cordis.patch.yml    # mounts the plugin as a client entry (both halves ride one row)
lib/index.js        # the host half: editor detection + the fenced /mutdiff route
lib/client.js       # the browser bundle: highlighted diff row and the editor action
test/run.mjs        # compatibility + contract suite (not published)
docs/               # upstream notes (not published)
```

## License

MIT

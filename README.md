# dsh-client-ui-mutdiff

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) client plugin that makes file `write` / `edit` tool diffs render **already expanded** and **not truncated** in the agent chat.

## What it does

By default the Harness collapses every tool row and caps the diff shown in the conversation at 8 lines, so a big edit shows a `…` and you have to click the row (and then hit **Inspect**) to read the real change.

This plugin replaces the `edit` and `write` tool rows with a diff row that:

- **Opens by default** — you don't have to click the row to see the code that changed.
- **Colours the code** — the changed lines are syntax-highlighted with the same grammar as the file's language, instead of being flat monochrome text.
- **Shows the full diff** — `maxLines: Infinity`, so long before/after hunks are never collapsed mid-file.
- Keeps everything else intact: the file path link, the `+A -R` badge, the running / failed / stopped states, a copy action, and the **Inspect** button in the details panel.

It is a small, focused plugin: it only touches the `edit`/`write` toolview. Terminal, read, search, and web rows keep their stock behavior.

## How it works

The Harness's `tool.call.toolview` slot is `kind: 'keyed'`, and a keyed slot allows a second registration for the same key at a **different priority** — the lowest priority renders. The shipped file-mutation rows register `edit` and `write` at the default priority `0`, so this plugin registers the same keys at `priority: -1` and takes over those rows without modifying any shipped package.

It reuses the primitives already provided by the Harness shell (`@deepseek-ai/dsh-client-ui-primitives` — `CodeBlock`, `DiffBlock`, `DisclosureRow`, icons) and does **not** pull in new dependencies.

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

- DeepSeek Harness (`dsh`) — this is a client plugin for the `web` profile.
- `pnpm` on the PATH (the `dsh plugin` command forwards to pnpm in the profile directory).

## Installation

From your Harness home, add the package with a single command:

```bash
dsh plugin --profile web add github:JBdesarrollo/dsh-client-ui-mutdiff
```

If you shared it as a tarball or a local folder, use the path instead:

```bash
dsh plugin --profile web add ./dsh-client-ui-mutdiff-0.2.0.tgz
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

If the boot fails instead, the browser console names the failing entry. A message mentioning `client-modules:` means the module graph rejected the bundle (a DSH API rename); a message mentioning `did not activate` means the entry itself failed: `import failed` for a module-resolution problem, or `pending (waiting for services: …)` for a service rename.

## Development

```bash
npm install
npm test
```

`test/run.mjs` boots `lib/client.js` inside a stub module loader twice — once against the `0.1.1-rc.2` client surface and once against the `0.1.5-rc.2` one — asserts that the two keys are registered at a shadowing priority, and renders real rows (settled / running / errored, both block shapes) through React. Five scenarios cover the two client surfaces, the highlighted diff, the plain `DiffBlock` fallback, the fail-soft skip when no diff renderer is exposed, and the integrity of the injected stylesheet. Pass a path to test another build (it must live in a package with `"type": "module"`, since the harness re-imports it per scenario):

```bash
node test/run.mjs /path/to/other/client.js
```

Scenario E deserves a note: the bundle carries its CSS as one long JavaScript string literal. A stray unescaped quote in it ends the literal early — the module still parses, the markup is unchanged, and the browser silently receives a truncated stylesheet, so nothing but a check on the stylesheet itself catches it.

## Files

```
package.json        # dsh.bundle + dsh.client declaration
cordis.patch.yml    # mounts the plugin as a client entry
lib/index.js        # no-op host loader entry
lib/client.js       # the browser bundle: highlighted diff row, expanded by default
test/run.mjs        # client-API compatibility suite (not published)
docs/               # upstream notes (not published)
```

## License

MIT

# dsh-client-ui-mutdiff

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) client plugin that makes file `write` / `edit` tool diffs render **already expanded** and **not truncated** in the agent chat.

## What it does

By default the Harness collapses every tool row and caps the diff shown in the conversation at 8 lines, so a big edit shows a `…` and you have to click the row (and then hit **Inspect**) to read the real change.

This plugin replaces the `edit` and `write` tool rows with a diff row that:
- **Opens by default** — you don't have to click the row to see the code that changed.
- **Shows the full diff** — `maxLines: Infinity`, so long before/after hunks are never collapsed mid-file.
- Keeps everything else intact: the file path link, the running / failed / stopped states, and the **Inspect** button in the details panel.

It is a small, focused plugin: it only touches the `edit`/`write` toolview. Terminal, read, search, and web rows keep their stock behavior.

## How it works

The Harness's `tool.call.toolview` slot is `kind: 'keyed'`. Per its contract, *"a key the shipped composition already covers is replaced, not shared"* — so this plugin registers its own view under the `edit` and `write` keys and takes over those rows, without modifying any shipped package.

It reuses the primitives already provided by the Harness shell (`@deepseek-ai/dsh-client-ui-primitives` — `DiffBlock`, `DisclosureRow`, icons) and does **not** pull in new dependencies.

## Requirements

- DeepSeek Harness (`dsh`) — it must be installed (this is a client plugin for the `web` profile).
- `pnpm` on the PATH (the `dsh plugin` command forwards to pnpm in the profile directory).

## Installation

From your Harness home, add the package with a single command:

```bash
dsh plugin --profile web add github:YOUR_USERNAME/dsh-client-ui-mutdiff
```

If you shared it as a tarball or a local folder, use the path instead:

```bash
dsh plugin --profile web add ./dsh-client-ui-mutdiff-0.1.0.tgz
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

## Files

```
package.json        # dsh.bundle + dsh.client declaration
cordis.patch.yml    # mounts the plugin as a client entry
lib/index.js        # no-op host loader entry
lib/client.js       # the browser bundle: diff row, expanded by default, maxLines: Infinity
```

## License

MIT

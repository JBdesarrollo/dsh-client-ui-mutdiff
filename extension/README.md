# DSH follow — a VS Code extension

Follows the file and line DeepSeek Harness is editing, **live, without stealing
focus**. The changed line is opened, scrolled into view and highlighted in place;
your window stays exactly where you left it.

It is the counterpart of the harness plugin's live follow: the plugin resolves
the location (`dsh-client-ui-mutdiff`, `follow: true`) and publishes it on a
Server-Sent Events feed, and this extension is what consumes it. Together they
replace the one thing the editor's CLI cannot do — `code -r -g file:line`
brings its window to the front by design, and no flag stops it.

## Install

The extension has to run in the same machine as the harness — usually the WSL
remote extension host — because that is where `127.0.0.1:3080` is the harness.
That is what `extensionKind: ["workspace"]` asks for.

**From this folder, with no tooling:**

```bash
mkdir -p ~/.vscode-server/extensions/jbdesarrollo.dsh-mutdiff-follow-0.1.0
cp -r /path/to/dsh-client-ui-mutdiff/extension/* \
      ~/.vscode-server/extensions/jbdesarrollo.dsh-mutdiff-follow-0.1.0/
```

Then reload the VS Code window (**Developer: Reload Window**). The extension
activates on startup, connects to the feed, and shows a `$(radio-tower) DSH:
following` item in the status bar.

**Or as a package**, if you prefer the CLI:

```bash
npx @vscode/vsce package          # writes dsh-mutdiff-follow-0.1.0.vsix
code --install-extension dsh-mutdiff-follow-0.1.0.vsix
```

## Turn the harness side on

```bash
MUTDIFF_FOLLOW=1 dsh web
```

`follow: true` in the plugin's row config does the same thing durably. With this
extension connected, the harness **never spawns an editor**: the feed is the only
path, so nothing can raise a window. The plugin's CLI fallback
(`MUTDIFF_FOLLOW=cli`) applies only while no editor is connected — and it is the
one mode that does raise the window, which is why it is not the default.

## Settings

| setting | default | what it does |
| --- | --- | --- |
| `dshMutdiff.endpoint` | `http://127.0.0.1:3080/mutdiff/activity` | the feed to follow; the port must be the one `dsh web` listens on |
| `dshMutdiff.reveal` | `true` | reveal and highlight the line. Off keeps the status bar item only |
| `dshMutdiff.highlightMs` | `2500` | how long the highlight lasts; `0` keeps it until the next edit |
| `dshMutdiff.column` | `active` | which editor group the file appears in; `beside` splits off a follow column, often the calmest choice |

## Commands

| command | what it does |
| --- | --- |
| **DSH follow: pause or resume following** | stops revealing while keeping the status bar current. The state is remembered per workspace |
| **DSH follow: open the last edited line** | opens the last location **with** focus — the one case where taking focus is the point, because you asked for it |
| **DSH follow: reconnect to the harness** | drops and re-opens the feed after a `dsh web` restart |

The status bar item is also a shortcut for the first two: it shows
`file:line` while following, and clicking it opens the location.

## What it does not do

- **No focus steal, ever, on its own.** Every automatic reveal passes
  `preserveFocus: true`. The explicit **open the last edited line** command is the
  only path that takes focus.
- **No highlighting of the whole hunk.** The feed carries the line the mutation
  added; that line is what is highlighted.
- **No work while disconnected.** If the harness is not running, the status bar
  says so and the extension retries with a gentle backoff (1.5 s, doubling to
  30 s) until it comes back.
- **No integration with the harness RPC.** One loopback HTTP request, nothing
  else; nothing is sent to the harness, only read.

## Test

```bash
node test.mjs
```

The test drives the extension against a stub `vscode` and a local SSE server, and
asserts the part that matters: that a real activity frame ends in a
`showTextDocument` call carrying `preserveFocus: true`, on the right line, in the
right editor group — plus pause, quiet mode, a malformed frame, an unopenable
file and teardown. Whether your window manager honors `preserveFocus` is a
question only your desktop can answer, so that part is checked by eye once.

## License

MIT

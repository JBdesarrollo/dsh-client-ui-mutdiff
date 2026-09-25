/**
 * The extension's own test: no VS Code, no network beyond one local socket.
 *
 * What it can prove is the part that matters and the part a test *can* prove:
 * that a real activity frame from a real SSE stream ends in a
 * `showTextDocument` call carrying `preserveFocus: true` — the one argument that
 * decides whether the reader gets interrupted — for the right file, line, and
 * editor group; that the highlight lands on that line; that the status bar names
 * it; and that the settings which are supposed to silence it (paused, `reveal:
 * false`) do.
 *
 * What it cannot prove is that VS Code honors `preserveFocus` on the reader's
 * machine. That is a window-manager question, and it is checked by hand once.
 *
 * Usage: node extension/test.mjs
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/* -------------------------------------------------------------------------- */
/* a stub `vscode`, recording what the extension asks for                      */
/* -------------------------------------------------------------------------- */

const calls = { showTextDocument: [], decorations: [], statusBarText: [], messages: [], log: [] };
const commands = new Map();
const disposables = [];
let settings = {};
let visibleEditors = [];

const disposable = (dispose = () => {}) => ({ dispose });

class Range {
	constructor(startLine, startCharacter, endLine, endCharacter) {
		this.start = { line: startLine, character: startCharacter };
		this.end = { line: endLine, character: endCharacter };
	}
}
class Selection extends Range {}

/** A document with just enough shape for the extension's line math. */
const fakeDocument = (path, lineCount) => ({
	uri: { fsPath: path },
	lineCount,
	lineAt: (line) => ({ range: new Range(line, 0, line, 40) }),
});

const fakeEditor = () => ({
	setDecorations: (type, ranges) => { calls.decorations.push(ranges); },
	revealRange: () => {},
	get selection() { return null; },
	set selection(value) { calls.lastSelection = value; },
});

const statusBarItem = () => ({
	text: "",
	tooltip: "",
	command: "",
	show() {},
	dispose() {},
});

const fakeVscode = {
	StatusBarAlignment: { Right: 2 },
	ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 },
	OverviewRulerLane: { Right: 4 },
	TextEditorRevealType: { InCenter: 1, InCenterIfOutsideViewport: 2 },
	ThemeColor: class { constructor(id) { this.id = id; } },
	Range,
	Selection,
	Uri: { file: (path) => ({ fsPath: path, scheme: "file" }) },
	workspace: {
		getConfiguration: () => ({ get: (key) => settings[key] }),
		openTextDocument: async (uri) => {
			if (uri.fsPath.includes("hidden")) throw new Error("cannot open binary file");
			return fakeDocument(uri.fsPath, 40);
		},
		onDidChangeConfiguration: () => disposable(),
	},
	window: {
		get visibleTextEditors() { return visibleEditors; },
		createStatusBarItem: () => {
			const item = statusBarItem();
			const show = () => { calls.statusBarText.push(item.text); };
			item.show = show;
			return item;
		},
		createTextEditorDecorationType: () => disposable(),
		createOutputChannel: () => ({ appendLine: (line) => calls.log.push(line), dispose() {} }),
		setStatusBarMessage: (message) => { calls.messages.push(message); },
		showInformationMessage: (message) => { calls.messages.push(message); },
		showTextDocument: async (document, options) => {
			calls.showTextDocument.push({ path: document.uri.fsPath, options });
			const editor = fakeEditor();
			visibleEditors = [editor];
			return editor;
		},
	},
	commands: {
		registerCommand: (name, handler) => {
			commands.set(name, handler);
			return disposable();
		},
	},
};

// The extension is CommonJS and requires `vscode` at module scope; that name is
// only resolvable inside the editor, so it is intercepted here.
const Module = require("node:module");
const realLoad = Module._load;
Module._load = function load(request, parent, isMain) {
	if (request === "vscode") return fakeVscode;
	return realLoad.call(this, request, parent, isMain);
};
const extension = require(join(here, "extension.js"));

/* -------------------------------------------------------------------------- */
/* a real activity feed: the plugin's SSE contract, locally                    */
/* -------------------------------------------------------------------------- */

const wait = (ms) => new Promise((done) => { setTimeout(done, ms); });

/** Send one frame and let the client read it. */
const frame = (res, event, data) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

const server = createServer((req, res) => {
	res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
	frame(res, "hello", { ok: true, last: null, subscribers: 1 });
	// Nothing else is written by the server: every frame below is pushed by the
	// test through `subscribers`, so the assertions are not racing a script.
	streams.push(res);
});
const streams = [];
await new Promise((done) => { server.listen(0, "127.0.0.1", done); });
const port = server.address().port;

const context = { subscriptions: [], workspaceState: { get: () => undefined, update: () => Promise.resolve() } };
settings = { endpoint: `http://127.0.0.1:${String(port)}/mutdiff/activity`, reveal: true, highlightMs: 0, column: "active" };
extension.activate(context);
await wait(300);
assert.equal(streams.length, 1, "the extension connects to the configured feed");

/* -------------------------------------------------------------------------- */
/* the assertions                                                             */
/* -------------------------------------------------------------------------- */

// A frame becomes a focus-preserving reveal on the exact line.
frame(streams[0], "activity", { path: "/w/src/app.ts", line: 7, time: Date.now() });
await wait(200);
assert.equal(calls.showTextDocument.length, 1, "an activity frame opens the file");
assert.equal(calls.showTextDocument[0].path, "/w/src/app.ts");
assert.equal(calls.showTextDocument[0].options.preserveFocus, true, "and asks for the window to be left alone — the whole reason this is an extension");
assert.equal(calls.showTextDocument[0].options.preview, true, "one reusable tab instead of a tab per edit");
assert.deepEqual(calls.decorations.at(-1)?.length, 1, "the changed line is highlighted");
assert.equal(calls.decorations.at(-1)[0].start.line, 6, "the highlight is on the 0-based form of the reported line");
assert.match(calls.statusBarText.at(-1), /app\.ts:7/, "the status bar names the file and line");

// `column: beside` moves the follow column without touching the layout.
settings = { ...settings, column: "beside" };
frame(streams[0], "activity", { path: "/w/src/other.ts", line: 2 });
await wait(200);
assert.equal(calls.showTextDocument.at(-1).options.viewColumn, -2, "the configured editor group is honored");

// A paused reader is not revealed to, but the status bar still tells the truth.
settings = { ...settings, column: "active" };
await commands.get("dshMutdiff.toggle")();
const before = calls.showTextDocument.length;
frame(streams[0], "activity", { path: "/w/src/paused.ts", line: 3 });
await wait(200);
assert.equal(calls.showTextDocument.length, before, "a paused reader is left alone entirely");
assert.match(calls.statusBarText.at(-1), /paused\.ts:3/, "while still being told where the agent is");
await commands.get("dshMutdiff.toggle")();

// `reveal: false` keeps the information and drops the intrusion.
settings = { ...settings, reveal: false };
frame(streams[0], "activity", { path: "/w/src/quiet.ts", line: 4 });
await wait(200);
assert.equal(calls.showTextDocument.length, before, "the reveal can be turned off without losing the status bar");
settings = { ...settings, reveal: true };

// A file that cannot be opened is reported, not thrown at the reader.
frame(streams[0], "activity", { path: "/w/src/hidden.bin", line: 1 });
await wait(200);
assert.equal(calls.showTextDocument.length, before, "a file that cannot be opened opens nothing");
assert.ok(calls.log.some((line) => line.includes("cannot open")), "and the reason goes to the extension's own log");

// A malformed frame is ignored rather than fatal: the feed keeps working after.
frame(streams[0], "activity", { nope: true });
frame(streams[0], "ping", { at: Date.now() });
frame(streams[0], "activity", { path: "/w/src/after.ts", line: 9 });
await wait(200);
assert.equal(calls.showTextDocument.at(-1).path, "/w/src/after.ts", "a frame the extension does not understand is skipped, not fatal");

// The deliberate open takes focus: that one is the reader asking.
await commands.get("dshMutdiff.openLast")();
assert.equal(calls.showTextDocument.at(-1).options.preserveFocus, undefined, "the explicit open does take focus, because it is not an interruption — it is a request");

// Teardown: the connection and the decoration are released with the extension.
extension.deactivate();
await wait(100);
assert.equal(server.listening, true);
await new Promise((done) => { server.close(done); });
console.log("  ok  extension — preserveFocus reveal, pause, quiet mode, and teardown");
console.log("all extension assertions passed");

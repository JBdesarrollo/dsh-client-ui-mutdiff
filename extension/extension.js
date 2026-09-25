/**
 * DeepSeek Harness — follow the edited line.
 *
 * The harness resolves exactly which file and line its agent is working on and
 * publishes it on a Server-Sent Events feed (`/mutdiff/activity`, registered by
 * the `dsh-client-ui-mutdiff` plugin). This extension subscribes to that feed
 * and reveals the line **in place**.
 *
 * The whole reason this exists as an extension, rather than as a `code -r -g`
 * call from the harness host, is one sentence long: the editor's CLI brings its
 * window to the front, and extensions can ask it not to. `showTextDocument`
 * takes `preserveFocus`, so the file, the caret and the highlight move while the
 * window stays exactly where the reader left it — no raise, no yank, no
 * interruption.
 *
 * It is deliberately small and dependency-free: one HTTP request, a frame
 * parser, and the editor API. Everything it does is reversible from the
 * settings, and nothing happens at all while it is disconnected.
 */
"use strict";

const http = require("node:http");
const path = require("node:path");
const vscode = require("vscode");

/** Reconnect backoff, in milliseconds: gentle at first, capped so a long run still recovers quickly. */
const RECONNECT_MIN_MS = 1_500;
const RECONNECT_MAX_MS = 30_000;

/** @type {vscode.StatusBarItem | undefined} */
let statusBar;
/** @type {vscode.TextEditorDecorationType | undefined} */
let decoration;
/** The live request, so a reconnect or a deactivate can drop the old one. */
let request;
/** Pending reconnect timer. */
let reconnectTimer;
/** Pending highlight-expiry timer. */
let highlightTimer;
/** Exponential backoff state. */
let backoff = RECONNECT_MIN_MS;
/** The last activity the harness published, kept for the status bar and the open-last command. */
let last = null;
/** Whether the reader paused following (persisted per workspace). */
let paused = false;
/** @type {vscode.OutputChannel | undefined} */
let log;
/** @type {vscode.ExtensionContext | undefined} */
let extensionContext;
/** Set while a reveal is being applied, so a burst cannot interleave two editor opens. */
let revealing = false;

/** The extension's settings, read fresh on every event so a change applies immediately. */
function settings() {
	const configuration = vscode.workspace.getConfiguration("dshMutdiff");
	return {
		endpoint: configuration.get("endpoint") || "http://127.0.0.1:3080/mutdiff/activity",
		reveal: configuration.get("reveal") !== false,
		highlightMs: typeof configuration.get("highlightMs") === "number" ? configuration.get("highlightMs") : 2500,
		column: configuration.get("column") || "active",
	};
}

/** The editor group a settings value names. */
function columnFor(name) {
	if (name === "beside") return vscode.ViewColumn.Beside;
	if (name === "one") return vscode.ViewColumn.One;
	if (name === "two") return vscode.ViewColumn.Two;
	if (name === "three") return vscode.ViewColumn.Three;
	return vscode.ViewColumn.Active;
}

/** Write one line to the extension's output channel. */
function note(message) {
	if (log !== undefined) log.appendLine(`[${new Date().toISOString()}] ${message}`);
}

/** Reflect the connection state and the last location in the status bar. */
function refreshStatus(connected) {
	if (statusBar === undefined) return;
	if (last === null) {
		statusBar.text = connected ? "$(radio-tower) DSH: following" : "$(debug-disconnect) DSH: waiting";
		statusBar.tooltip = connected
			? "Following the DeepSeek Harness activity feed. Nothing is revealed until the agent edits a file."
			: `Cannot reach the harness feed at ${settings().endpoint}.\nIs \`dsh web\` running, and is this extension installed in the WSL remote?`;
		statusBar.command = "dshMutdiff.reconnect";
	} else {
		const name = path.basename(last.path);
		statusBar.text = `${paused ? "$(debug-pause)" : "$(file-code)"} ${name}:${String(last.line)}`;
		statusBar.tooltip = `${last.path}:${String(last.line)}\nClick to open it here (this one takes focus — you asked for it).`;
		statusBar.command = "dshMutdiff.openLast";
	}
	statusBar.show();
}

/** Drop the highlight after its configured lifetime. */
function scheduleHighlightExpiry() {
	if (highlightTimer !== undefined) clearTimeout(highlightTimer);
	const { highlightMs } = settings();
	if (highlightMs <= 0) return;
	highlightTimer = setTimeout(() => {
		if (decoration === undefined) return;
		for (const editor of vscode.window.visibleTextEditors) editor.setDecorations(decoration, []);
	}, highlightMs);
}

/**
 * Reveal one activity in place.
 *
 * `preserveFocus` is the point of the whole extension: the document is opened,
 * the caret and the highlight move, and the window is not raised. `preview`
 * keeps it to one reusable tab instead of a tab per edit, and
 * `InCenterIfOutsideViewport` leaves the scroll position alone when the line is
 * already on screen.
 */
async function reveal(activity) {
	if (revealing) return;
	revealing = true;
	try {
		const uri = vscode.Uri.file(activity.path);
		let document;
		try {
			document = await vscode.workspace.openTextDocument(uri);
		} catch (error) {
			note(`cannot open ${activity.path}: ${String(error?.message ?? error)}`);
			return;
		}
		const editor = await vscode.window.showTextDocument(document, {
			preview: true,
			preserveFocus: true,
			viewColumn: columnFor(settings().column),
		});
		if (editor === undefined) return;
		const line = Math.min(Math.max(activity.line - 1, 0), Math.max(document.lineCount - 1, 0));
		const range = document.lineAt(line).range;
		if (decoration !== undefined) {
			editor.setDecorations(decoration, [range]);
			scheduleHighlightExpiry();
		}
		editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
		editor.selection = new vscode.Selection(range.start, range.start);
	} catch (error) {
		note(`reveal failed: ${String(error?.message ?? error)}`);
	} finally {
		revealing = false;
	}
}

/** One published location from the feed. */
function onActivity(activity) {
	if (typeof activity?.path !== "string" || typeof activity?.line !== "number") return;
	last = activity;
	refreshStatus(true);
	if (paused) return;
	if (!settings().reveal) return;
	void reveal(activity);
}

/** Parse the `event:`/`data:` frames of one SSE chunk delimiter. */
function handleFrame(frame) {
	let event = "message";
	const data = [];
	for (const line of frame.split("\n")) {
		if (line.startsWith("event:")) event = line.slice(6).trim();
		else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
	}
	if (event !== "activity" || data.length === 0) return;
	try {
		onActivity(JSON.parse(data.join("\n")));
	} catch {
		note("ignored a malformed activity frame");
	}
}

/** Schedule one reconnect, with a backoff that resets on a good connection. */
function scheduleReconnect() {
	if (reconnectTimer !== undefined) return;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = undefined;
		connect();
	}, backoff);
	backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
}

/** Open the feed and consume it until it ends. */
function connect() {
	if (extensionContext === undefined) return;
	disconnect();
	let url;
	try {
		url = new URL(settings().endpoint);
	} catch {
		note(`not a usable endpoint: ${settings().endpoint}`);
		return;
	}
	request = http.request(
		{
			protocol: url.protocol,
			hostname: url.hostname,
			port: url.port === "" ? (url.protocol === "https:" ? 443 : 80) : url.port,
			path: `${url.pathname}${url.search}`,
			method: "GET",
			headers: { accept: "text/event-stream", "cache-control": "no-store" },
		},
		(response) => {
			if (response.statusCode !== 200) {
				note(`the feed answered HTTP ${String(response.statusCode)}`);
				response.resume();
				refreshStatus(false);
				scheduleReconnect();
				return;
			}
			backoff = RECONNECT_MIN_MS;
			refreshStatus(true);
			let buffer = "";
			response.setEncoding("utf8");
			response.on("data", (chunk) => {
				buffer += chunk;
				let boundary = buffer.indexOf("\n\n");
				while (boundary >= 0) {
					const frame = buffer.slice(0, boundary);
					buffer = buffer.slice(boundary + 2);
					handleFrame(frame);
					boundary = buffer.indexOf("\n\n");
				}
			});
			response.on("end", () => {
				refreshStatus(false);
				scheduleReconnect();
			});
		}
	);
	request.on("error", (error) => {
		note(`the feed is unreachable (${error?.code ?? error?.message ?? "error"})`);
		refreshStatus(false);
		scheduleReconnect();
	});
	request.end();
}

/** Drop the live connection and any pending reconnect. */
function disconnect() {
	if (reconnectTimer !== undefined) {
		clearTimeout(reconnectTimer);
		reconnectTimer = undefined;
	}
	if (request !== undefined) {
		request.destroy();
		request = undefined;
	}
}

/**
 * Extension entry: one status bar item, one feed connection, three commands.
 * @param {vscode.ExtensionContext} context - the extension context.
 */
function activate(context) {
	extensionContext = context;
	log = vscode.window.createOutputChannel("DSH follow");
	paused = context.workspaceState.get("dshMutdiff.paused") === true;
	statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
	decoration = vscode.window.createTextEditorDecorationType({
		isWholeLine: true,
		backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
		overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.findMatchForeground"),
		overviewRulerLane: vscode.OverviewRulerLane.Right,
	});

	context.subscriptions.push(
		statusBar,
		log,
		{ dispose: disconnect },
		{ dispose: () => { if (highlightTimer !== undefined) clearTimeout(highlightTimer) } },
		{ dispose: () => decoration?.dispose() },
		vscode.commands.registerCommand("dshMutdiff.toggle", async () => {
			paused = !paused;
			await context.workspaceState.update("dshMutdiff.paused", paused);
			refreshStatus(true);
			vscode.window.setStatusBarMessage(paused ? "DSH follow paused" : "DSH follow resumed", 2_000);
		}),
		vscode.commands.registerCommand("dshMutdiff.reconnect", () => {
			backoff = RECONNECT_MIN_MS;
			connect();
			vscode.window.setStatusBarMessage("DSH follow: reconnecting", 2_000);
		}),
		vscode.commands.registerCommand("dshMutdiff.openLast", async () => {
			if (last === null) {
				vscode.window.showInformationMessage("DSH follow: nothing has been edited yet in this session.");
				return;
			}
			const document = await vscode.workspace.openTextDocument(vscode.Uri.file(last.path));
			// No `preserveFocus` here on purpose: this one is the reader asking.
			const editor = await vscode.window.showTextDocument(document, { preview: false, viewColumn: columnFor(settings().column) });
			const line = Math.min(Math.max(last.line - 1, 0), Math.max(document.lineCount - 1, 0));
			const range = document.lineAt(line).range;
			editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
			editor.selection = new vscode.Selection(range.start, range.start);
		}),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration("dshMutdiff.endpoint")) connect();
			else if (event.affectsConfiguration("dshMutdiff.column") || event.affectsConfiguration("dshMutdiff.reveal")) refreshStatus(true);
		})
	);

	refreshStatus(false);
	connect();
	note(`following ${settings().endpoint}`);
}

/** Extension teardown: drop the connection, the decoration and the status item. */
function deactivate() {
	disconnect();
	if (highlightTimer !== undefined) clearTimeout(highlightTimer);
	decoration?.dispose();
	statusBar?.dispose();
}

module.exports = { activate, deactivate };

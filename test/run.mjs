/**
 * Compatibility suite for the browser bundle.
 *
 * The plugin hand-mirrors parts of `@deepseek-ai/dsh-client-ui-tool` and renders
 * through `@deepseek-ai/dsh-client-ui-primitives`, so its real failure mode is
 * API drift between DSH releases rather than anything the host can validate at
 * install time. This suite therefore boots `lib/client.js` inside a stub module
 * loader — once against the 0.1.1-rc.2 surface and once against the 0.1.5-rc.2
 * one — and renders real rows through React.
 *
 * The host half (`lib/index.js`) is covered by the last two scenarios, which
 * drive its route — fence, validation, hint resolution, argument construction —
 * through the injectable seams it exposes, so no editor is installed and nothing
 * is ever spawned.
 *
 * Usage: node test/run.mjs [path/to/client.js]
 */
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] === undefined ? resolve(here, "../lib/client.js") : resolve(process.argv[2]);

let importCounter = 0;
/** Text of every stylesheet the bundle injected during the last import. */
let injectedStyles = [];
/** Backing store of the fake `window.localStorage`, reset per import. */
let storage = new Map();

/** Install the browser globals the bundle touches at import time. */
function installBrowserGlobals() {
	const registration = { value: null };
	const styles = [];
	injectedStyles = styles;
	storage = new Map();
	globalThis.window = {
		setTimeout,
		localStorage: {
			getItem: (key) => (storage.has(key) ? storage.get(key) : null),
			setItem: (key, value) => {
				storage.set(key, String(value));
			},
			removeItem: (key) => {
				storage.delete(key);
			}
		},
		__ModuleLoader__: {
			load(value) {
				registration.value = value;
			}
		}
	};
	globalThis.document = {
		querySelector: () => null,
		createElement: () => ({ dataset: {}, style: {}, textContent: "" }),
		head: {
			appendChild: (tag) => {
				if (typeof tag.textContent === "string") styles.push(tag.textContent);
			}
		}
	};
	return registration;
}

/**
 * Import the bundle fresh (cache-busted) and return its factory.
 * @param file - the bundle to import.
 * @param seed - preferences to place in the fake `localStorage` *before* the
 * import, since the bundle reads its stored choices at factory scope.
 */
async function loadFactory(file, seed) {
	const registration = installBrowserGlobals();
	if (seed !== undefined) for (const [key, value] of Object.entries(seed)) storage.set(key, value);
	await import(`${pathToFileURL(file).href}?scenario=${importCounter++}`);
	assert.ok(registration.value !== null, "the bundle never called window.__ModuleLoader__.load");
	assert.equal(registration.value.id, "@jbdesarrollo/dsh-client-ui-mutdiff");
	assert.equal(typeof registration.value.factory, "function");
	return registration.value.factory;
}

/**
 * Primitives stub.
 *
 * `strictLabels` reproduces 0.1.5-rc.2's `DiffBlock`, which dereferences its
 * `labels` prop unconditionally and therefore throws a TypeError when a caller
 * omits it; the lenient flavour reproduces 0.1.1-rc.2, which destructures only
 * `diffs`/`maxLines`/`className` and ignores the rest.
 *
 * `CodeBlock` mirrors the shape both versions emit: a banner as the first child
 * (which the plugin hides through CSS) and shiki-style `span.line` elements
 * inside a `<pre><code>` — the hook the `+`/`-` prefixes are drawn from.
 */
function makePrimitives({ strictLabels, withCodeBlock = true }) {
	const diffBlockCalls = [];
	const codeBlockCalls = [];

	function DiffBlock(props) {
		const copyLabel = strictLabels ? props.labels.copied : "Copied";
		diffBlockCalls.push(props);
		const lines = [];
		for (const hunk of props.diffs) {
			if (hunk.oldText !== null) for (const line of hunk.oldText.split("\n")) lines.push(`-${line}`);
			for (const line of hunk.newText.split("\n")) lines.push(`+${line}`);
		}
		const shown = lines.length > props.maxLines ? lines.slice(0, props.maxLines) : lines;
		return React.createElement(
			"div",
			{
				className: "diffblock",
				"data-max-lines": String(props.maxLines),
				"data-copied-label": copyLabel
			},
			...shown.map((line, index) => React.createElement("div", { key: index }, line))
		);
	}

	function CodeBlock({ code, lang, className, copyLabel, copiedLabel }) {
		codeBlockCalls.push({ code, lang, className, copyLabel, copiedLabel });
		const trimmed = code.endsWith("\n") ? code.slice(0, -1) : code;
		return jsxs("div", {
			className: `md-code-block ${className ?? ""}`,
			children: [
				jsx("div", { className: "banner", children: lang ?? "" }),
				jsx("pre", {
					children: jsx("code", {
						children: trimmed.split("\n").map((line, index) => jsx("span", { className: "line", children: line }, index))
					})
				})
			]
		});
	}

	function DisclosureRow({ title, open, expandable, collapsedContent, children, icon }) {
		return jsxs("div", {
			"data-open": String(open),
			"data-expandable": String(expandable),
			children: [
				icon ?? null,
				jsx("span", { className: "title", children: title }),
				collapsedContent ?? null,
				open === true && expandable === true ? jsx("div", { className: "body", children }) : null
			]
		});
	}

	const primitives = {
		DisclosureRow,
		DiffBlock,
		StateDot: (props) => jsx("i", { "data-state": String(props.state) }),
		IconEditOutline16: () => jsx("i", { className: "icon-edit" }),
		IconInspectOutline12: () => jsx("i", { className: "icon-inspect" })
	};
	if (withCodeBlock) primitives.CodeBlock = CodeBlock;
	return { primitives, diffBlockCalls, codeBlockCalls };
}

/** A module `require` in the shape the client module system hands to factories. */
function makeRequire({ primitives, runtime, failures, elements }) {
	/**
	 * Record every element the bundle creates, then build it for real. This is
	 * how a click is reached without a DOM: `renderToStaticMarkup` drops handlers
	 * from its output, but the captured props still hold the live closures.
	 */
	const record = (build) => (type, props, key) => {
		if (elements !== undefined) elements.push({ type, props: props ?? {} });
		return build(type, props, key);
	};
	return (specifier) => {
		if (specifier === "react") return React;
		if (specifier === "react/jsx-runtime") {
			return elements === undefined ? { jsx, jsxs, Fragment } : { jsx: record(jsx), jsxs: record(jsxs), Fragment };
		}
		if (specifier === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
		if (specifier === "@deepseek-ai/dsh-client-runtime/client") {
			if (runtime === "missing") {
				failures.push(specifier);
				throw new Error(`client-modules: cannot resolve "${specifier}" — not a seed word, not a materialized module, and not a row in the boot graph`);
			}
			return runtime;
		}
		throw new Error(`unexpected require: ${specifier}`);
	};
}

/** Minimal cordis client ctx: drains the generator effect, like the real slots seat. */
function mount(exports) {
	const registrations = [];
	const ctx = {
		plugin(plugin) {
			plugin.apply(ctx);
		},
		slots: {
			inject(_name, callback) {
				const effect = callback();
				if (effect !== null && typeof effect === "object" && typeof effect[Symbol.iterator] === "function") {
					for (const disposer of effect) void disposer;
				}
				return () => {};
			},
			register(options, component) {
				registrations.push({ options, component });
				return () => {};
			}
		}
	};
	exports.apply(ctx);
	return registrations;
}

const HOME = "/home/u";
const CWD = "/home/u/proj";
const EDIT_ARGS = JSON.stringify({ file_path: "/home/u/proj/src/app.ts", old_string: "const a = 1;", new_string: "const a = 2;" });
const WRITE_ARGS = JSON.stringify({ file_path: "/home/u/proj/src/new.ts", content: "line one\nline two" });

/** 0.1.5-rc.2 locale namespace is the source of this vocabulary; `t` returns the key when missing. */
const DICT_015 = {
	copy: "Copy",
	copied: "Copied",
	collapse: "Collapse",
	"diff.collapseAria": "Collapse diff",
	"diff.expandAria": "Expand diff",
	"diff.expandRest": "Show more",
	"diff.files.one": "1 file",
	"diff.files.other": "files",
	"row.running": "Running",
	"row.failed": "Failed",
	"row.stopped": "Stopped",
	"row.input": "IN",
	"row.output": "OUT",
	"tool.title.edit": "Edit",
	"tool.title.write": "Write",
	"tool.title.generic": "Tool call"
};
/** 0.1.1-rc.2 only knew the bash namespace, so row.* and tool.title.* must fall back. */
const DICT_011 = { "bash.running": "Running", "bash.failed": "Failed", "bash.stopped": "Stopped" };

const tOf = (dictionary) => (key, params) => {
	const value = dictionary[key];
	if (value === undefined) return key;
	return params === undefined ? value : `${value}(${JSON.stringify(params)})`;
};

const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

/** Let every promise chain in flight (the bridge's fetch, the route's body read) settle. */
const settle = () => new Promise((done) => { setTimeout(done, 0); });

const HUNK = { path: "/home/u/proj/src/app.ts", oldText: "const a = 1;", newText: "const a = 2;" };
const ROW_PROPS = { cwd: CWD, home: HOME, openFile: () => {}, inspect: () => {} };

/* -------------------------------------------------------------------------- */
/* highlighter wiring — identical on both surfaces                            */
/* -------------------------------------------------------------------------- */

function assertHighlightedRow({ codeBlockCalls, diffBlockCalls, markup, expectSides }) {
	assert.equal(diffBlockCalls.length, 0, "a tokenizing CodeBlock must take precedence over the plain DiffBlock");
	assert.equal(codeBlockCalls.length, expectSides.length, `expected ${String(expectSides.length)} highlighted side(s)`);
	expectSides.forEach((side, index) => {
		assert.equal(codeBlockCalls[index].code, side.code, `side ${String(index)} carries the verbatim ${side.name} text`);
		assert.equal(codeBlockCalls[index].lang, "ts", "the language comes from the hunk path extension");
		assert.match(codeBlockCalls[index].className, new RegExp(side.cssClass), `side ${String(index)} is marked as ${side.name}`);
		assert.equal(codeBlockCalls[index].copyLabel, "Copy", "0.1.1 defaults the copy label to Chinese, so it must be passed");
		assert.equal(codeBlockCalls[index].copiedLabel, "Copied");
	});
	assert.match(markup, /data-diff/, "the card keeps the diff marker");
	assert.match(markup, /class="line"/, "shiki-style line elements carry the +\/- prefixes");
	assert.match(markup, new RegExp(HUNK.path.replace(/[/.]/g, "\\$&")), "the card shows the file path");
}

/* -------------------------------------------------------------------------- */
/* scenario A — DSH 0.1.5-rc.2: runtime package gone, DiffBlock needs `labels` */
/* -------------------------------------------------------------------------- */

async function scenario015() {
	const factory = await loadFactory(target);
	const failures = [];
	const built = makePrimitives({ strictLabels: true });
	const exports = factory(makeRequire({ primitives: built.primitives, runtime: "missing", failures }));

	assert.deepEqual(failures, ["@deepseek-ai/dsh-client-runtime/client"], "the bundle must attempt the legacy require before falling back");
	assert.equal(typeof exports.apply, "function", "module must export the plugin apply");
	assert.deepEqual(exports.inject, ["slots"], "a version-specific service name (connection/remote) must not be declared");

	const registrations = mount(exports);
	assert.deepEqual(
		registrations.map((entry) => entry.options.key),
		["edit", "write"]
	);
	for (const entry of registrations) {
		assert.equal(entry.options.name, "tool.call.toolview");
		assert.equal(entry.options.locale, "conversation");
		assert.equal(entry.options.priority, -1, "must shadow the shipped rows via lower priority");
	}

	const t = tOf(DICT_015);
	const DiffRow = registrations[0].component;

	// settled edit with applied hunks on block.meta
	built.codeBlockCalls.length = 0;
	built.diffBlockCalls.length = 0;
	let markup = render(DiffRow, {
		...ROW_PROPS,
		t,
		toolName: "edit",
		block: {
			kind: "tool-result",
			callId: "c1",
			call: { name: "edit", argsRaw: EDIT_ARGS },
			meta: { diffs: [HUNK] },
			content: [{ type: "text", text: "Applied 1 edit." }],
			isError: false
		}
	});
	assertHighlightedRow({
		codeBlockCalls: built.codeBlockCalls,
		diffBlockCalls: built.diffBlockCalls,
		markup,
		expectSides: [
			{ name: "old", code: HUNK.oldText, cssClass: "mtd_hlDel" },
			{ name: "new", code: HUNK.newText, cssClass: "mtd_hlAdd" }
		]
	});
	assert.match(markup, /data-open="true"/, "the diff row must be expanded by default");
	assert.match(markup, /\+1 -1/, "the badge counts added/removed lines on every version");
	assert.match(markup, />Copy</, "the card carries its own copy action");

	// an edit that applied nothing shows no diff
	built.codeBlockCalls.length = 0;
	markup = render(DiffRow, {
		...ROW_PROPS,
		t,
		toolName: "edit",
		block: { kind: "tool-result", callId: "x", call: { name: "edit", argsRaw: EDIT_ARGS }, meta: { diffs: [] }, content: [], isError: false }
	});
	assert.equal(built.codeBlockCalls.length, 0, "an edit that applied nothing renders no diff sides");
	assert.doesNotMatch(markup, /data-open="true"/);

	// running write: whole-file diff, added side only
	built.codeBlockCalls.length = 0;
	markup = render(DiffRow, { ...ROW_PROPS, t, toolName: "write", block: { callId: "c3", name: "write", argsRaw: WRITE_ARGS } });
	assert.equal(built.codeBlockCalls.length, 1, "a created file has a single (added) side");
	assert.match(built.codeBlockCalls[0].className, /mtd_hlAdd/);
	assert.match(markup, /line one/);
	assert.match(markup, /\+2 -0/, "a create counts only added lines");

	// errored mutation: no diff card, model-facing text surfaces instead
	built.codeBlockCalls.length = 0;
	markup = render(DiffRow, {
		...ROW_PROPS,
		t,
		toolName: "edit",
		block: {
			kind: "tool-result",
			callId: "c4",
			call: { name: "edit", argsRaw: EDIT_ARGS },
			content: [{ type: "text", text: "Edit failed: no match found" }],
			isError: true,
			error: { code: "tool_error" }
		}
	});
	assert.equal(built.codeBlockCalls.length, 0, "an errored mutation must not render a diff card");
	// An errored mutation has no diff, so it stays collapsed (stock behaviour) and
	// surfaces the model-facing error line in the summary.
	assert.match(markup, /data-open="false"/);
	assert.match(markup, /Edit failed: no match found/);
	assert.match(markup, /mtd_visuallyHidden">Failed</, "the row status resolves through the 0.1.5 row.* namespace");
	assert.doesNotMatch(markup, /row\.(running|failed|input|output)/, "no raw locale key may leak into the row");

	// a subagent-nested call owns no card
	built.codeBlockCalls.length = 0;
	render(DiffRow, { ...ROW_PROPS, t, toolName: "edit", block: { callId: "c5", name: "edit", argsRaw: EDIT_ARGS, parentCallId: "p1" } });
	assert.equal(built.codeBlockCalls.length, 0, "a nested call renders no diff card");

	// a path with no known extension still renders, unhighlighted by the shell
	built.codeBlockCalls.length = 0;
	render(DiffRow, {
		...ROW_PROPS,
		t,
		toolName: "edit",
		block: { kind: "tool-result", callId: "c6", call: { name: "edit", argsRaw: EDIT_ARGS }, meta: { diffs: [{ path: "/home/u/proj/Makefile", oldText: "a", newText: "b" }] }, content: [], isError: false }
	});
	assert.equal(built.codeBlockCalls.length, 2, "an extension-less file still renders both sides");
	assert.equal(built.codeBlockCalls[0].lang, undefined, "an unknown extension passes no language");

	console.log("  ok  scenario A — 0.1.5-rc.2 surface, syntax-highlighted diff");
}

/* -------------------------------------------------------------------------- */
/* scenario B — DSH 0.1.1-rc.2: host views, lenient DiffBlock, runtime present */
/* -------------------------------------------------------------------------- */

async function scenario011() {
	const factory = await loadFactory(target);
	const failures = [];
	const homePathCalls = [];
	const homePath = (path, home) => {
		homePathCalls.push([path, home]);
		const root = home.replace(/\/+$/, "");
		if (path === root) return "~";
		return path.startsWith(`${root}/`) ? `~${path.slice(root.length)}` : path;
	};
	const built = makePrimitives({ strictLabels: false });
	const exports = factory(
		makeRequire({ primitives: built.primitives, runtime: { abbreviateHomePath: homePath }, failures })
	);

	assert.deepEqual(failures, [], "the legacy runtime module resolves on this surface");
	assert.deepEqual(exports.inject, ["slots"]);

	const registrations = mount(exports);
	const t = tOf(DICT_011);
	const DiffRow = registrations[0].component;

	built.codeBlockCalls.length = 0;
	built.diffBlockCalls.length = 0;
	let markup = render(DiffRow, {
		...ROW_PROPS,
		t,
		toolName: "edit",
		block: { kind: "tool-result", callId: "c1", call: { name: "edit", argsRaw: EDIT_ARGS }, resultView: { card: "diff", diffs: [HUNK] }, content: [], isError: false }
	});
	assertHighlightedRow({
		codeBlockCalls: built.codeBlockCalls,
		diffBlockCalls: built.diffBlockCalls,
		markup,
		expectSides: [
			{ name: "old", code: HUNK.oldText, cssClass: "mtd_hlDel" },
			{ name: "new", code: HUNK.newText, cssClass: "mtd_hlAdd" }
		]
	});
	assert.match(markup, /data-open="true"/);
	assert.match(markup, /\+1 -1/, "the badge is counted locally, so 0.1.1 shows it too");

	// the host view is authoritative even when it is not a diff card
	built.codeBlockCalls.length = 0;
	render(DiffRow, {
		...ROW_PROPS,
		t,
		toolName: "edit",
		block: { kind: "tool-result", callId: "c2", call: { name: "edit", argsRaw: EDIT_ARGS }, resultView: { card: "terminal" }, content: [], isError: false }
	});
	assert.equal(built.codeBlockCalls.length, 0, "a non-diff host view must not be second-guessed");

	// the shipped home-path helper is preferred over the local copy
	homePathCalls.length = 0;
	markup = render(DiffRow, { ...ROW_PROPS, t, toolName: "edit", block: { callId: "c3", name: "edit", argsRaw: EDIT_ARGS } });
	assert.ok(homePathCalls.length >= 1, "abbreviateHomePath from the client runtime is used when present");
	assert.match(markup, />src\/app\.ts</, "the summary is relativized to the session cwd");
	markup = render(DiffRow, { ...ROW_PROPS, t, cwd: undefined, toolName: "edit", block: { callId: "c4", name: "edit", argsRaw: EDIT_ARGS } });
	assert.match(markup, /~\/proj\/src\/app\.ts/, "an out-of-cwd path is home-abbreviated through the shipped helper");
	assert.doesNotMatch(markup, /row\.(running|failed|stopped)/, "0.1.1 lacks row.* keys, so the bash namespace literal is used");

	console.log("  ok  scenario B — 0.1.1-rc.2 surface, syntax-highlighted diff");
}

/* -------------------------------------------------------------------------- */
/* scenario C — an unrecognizable primitives table must fail soft              */
/* -------------------------------------------------------------------------- */

async function scenarioFailSoft() {
	const factory = await loadFactory(target);
	const failures = [];
	const built = makePrimitives({ strictLabels: true });
	const partial = { ...built.primitives };
	delete partial.DiffBlock;
	delete partial.CodeBlock;
	const exports = factory(makeRequire({ primitives: partial, runtime: "missing", failures }));

	const errors = [];
	const originalError = console.error;
	console.error = (...args) => errors.push(args.join(" "));
	let registrations;
	try {
		registrations = mount(exports);
	} finally {
		console.error = originalError;
	}
	assert.deepEqual(registrations, [], "an incompatible primitives table must leave the shipped rows alone");
	assert.equal(errors.length, 1, "the skip must be reported once");
	assert.match(errors[0], /CodeBlock\|DiffBlock/, "the diagnostic must name the missing diff renderer");

	console.log("  ok  scenario C — fails soft on an unknown primitives table");
}

/* -------------------------------------------------------------------------- */
/* scenario D — no tokenizing primitive: the plain diff path must still work   */
/* -------------------------------------------------------------------------- */

async function scenarioPlainFallback() {
	const factory = await loadFactory(target);
	const failures = [];
	const built = makePrimitives({ strictLabels: true, withCodeBlock: false });
	const exports = factory(makeRequire({ primitives: built.primitives, runtime: "missing", failures }));

	const registrations = mount(exports);
	const t = tOf(DICT_015);
	const DiffRow = registrations[0].component;
	built.diffBlockCalls.length = 0;
	const markup = render(DiffRow, {
		...ROW_PROPS,
		t,
		toolName: "edit",
		block: { kind: "tool-result", callId: "c1", call: { name: "edit", argsRaw: EDIT_ARGS }, meta: { diffs: [HUNK] }, content: [], isError: false }
	});
	assert.equal(built.diffBlockCalls.length, 1, "without CodeBlock the shipped DiffBlock carries the card");
	assert.equal(built.diffBlockCalls[0].maxLines, Infinity, "the fallback is still untruncated");
	assert.equal(built.diffBlockCalls[0].labels.copied, "Copied", "the fallback still satisfies the 0.1.5 labels contract");
	assert.match(markup, /data-open="true"/);
	assert.match(markup, /\+1 -1/);

	console.log("  ok  scenario D — plain DiffBlock fallback when no tokenizer is exposed");
}

/* -------------------------------------------------------------------------- */
/* scenario E — the injected stylesheet must survive the bundle intact         */
/* -------------------------------------------------------------------------- */

/**
 * The bundle carries its CSS as one long JavaScript string literal. A stray
 * unescaped quote in it terminates the literal early: the module still parses
 * (the remainder reads as labels and expressions), the markup is unchanged, and
 * the browser silently receives a truncated stylesheet. Only a check on the
 * stylesheet itself catches that, which is what this scenario is for.
 */
async function scenarioStyleSheet() {
	const factory = await loadFactory(target);
	const built = makePrimitives({ strictLabels: true });
	// The stylesheet is injected by the factory body, so it must run first.
	const exports = factory(makeRequire({ primitives: built.primitives, runtime: "missing", failures: [] }));
	const styles = injectedStyles;
	assert.equal(styles.length, 1, "the bundle must inject exactly one stylesheet");
	const css = styles[0];
	assert.ok(css.length > 4000, `the stylesheet looks truncated: ${String(css.length)} bytes`);
	assert.match(css, /^\.mtd_root/, "the stylesheet must start at the first rule, not mid-declaration");

	const registrations = mount(exports);
	const markup = render(registrations[0].component, {
		...ROW_PROPS,
		t: tOf(DICT_015),
		toolName: "edit",
		block: { kind: "tool-result", callId: "c1", call: { name: "edit", argsRaw: EDIT_ARGS }, meta: { diffs: [HUNK] }, content: [], isError: false }
	});

	// every class the rendered row uses must be defined by the stylesheet
	const used = new Set([...markup.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((name) => name.startsWith("mtd_")));
	assert.ok(used.size >= 6, `expected the row to use several plugin classes, saw ${[...used].join(", ")}`);
	for (const name of used) {
		assert.ok(new RegExp(`\\.${name}[{,:\\s>]`).test(css), `class ${name} is used by the row but has no rule in the stylesheet`);
	}
	// rules the other branches rely on must still be there too
	for (const name of ["mtd_ioCard", "mtd_visuallyHidden", "mtd_diffBody", "mtd_inspectButton", "mtd_fileLink", "mtd_bodyActions", "mtd_editorButton", "mtd_editorCaret", "mtd_editorMenu", "mtd_editorMenuTitle", "mtd_editorMenuItem", "mtd_editorMenuToggle", "mtd_editorMenuNote", "mtd_editorError"]) {
		assert.ok(css.includes(`.${name}`), `the stylesheet lost .${name}`);
	}
	// the highlight hooks the prefix pseudo-elements depend on
	assert.match(css, /\.mtd_hlDel span\.line:before\{content:'- '/, "the removed-side prefix rule must be intact");
	assert.match(css, /\.mtd_hlAdd span\.line:before\{content:'\+ '/, "the added-side prefix rule must be intact");

	console.log("  ok  scenario E — stylesheet intact and complete");
}

/* -------------------------------------------------------------------------- */
/* scenario F — the editor action, its picker, and the payload it posts        */
/* -------------------------------------------------------------------------- */

/**
 * The bridge's whole browser contract: once the host answers with a roster, a
 * real file mutation renders an action, and clicking it posts an absolute path
 * plus the first line the mutation added — never a command, never a line the
 * host would have to guess.
 *
 * The click is reached through the recorded jsx props rather than a DOM; the
 * route itself is covered by scenario H.
 */
async function scenarioEditorAction() {
	const factory = await loadFactory(target);
	const built = makePrimitives({ strictLabels: true });
	const elements = [];
	const exports = factory(makeRequire({ primitives: built.primitives, runtime: "missing", failures: [], elements }));

	const requests = [];
	const originalFetch = globalThis.fetch;
	const answer = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
	globalThis.fetch = (url, options) => {
		requests.push({ url: String(url), options: options ?? {} });
		if (String(url).endsWith("/state")) {
			return answer({
				ok: true,
				autoOpen: false,
				gotoLine: true,
				configured: "auto",
				effective: "code",
				editors: [{ id: "code", label: "VS Code" }, { id: "windsurf", label: "Windsurf" }]
			});
		}
		return answer({ ok: true, editor: "code", line: 3 });
	};

	try {
		const registrations = mount(exports);
		await settle();
		const t = tOf(DICT_015);
		const DiffRow = registrations[0].component;
		const block = { kind: "tool-result", callId: "c1", call: { name: "edit", argsRaw: EDIT_ARGS }, meta: { diffs: [HUNK] }, content: [], isError: false };

		const stateRequest = requests.find((entry) => entry.url.endsWith("/state"));
		assert.ok(stateRequest, "the roster is read once the entry activates");
		assert.equal(stateRequest.options.credentials, undefined, "the route carries no credentials");

		elements.length = 0;
		let markup = render(DiffRow, { ...ROW_PROPS, callId: "c1", t, toolName: "edit", block });
		assert.match(markup, />Open in editor</, "the row offers the editor action once the host answers");
		assert.match(markup, /mtd_editorButton/, "the action uses the plugin's own button class");
		assert.match(markup, /aria-label="Choose the editor"/, "the caret opens a picker with a label of its own");
		assert.match(markup, /title="Open in editor — code"/, "the action names the editor it would use");
		if (process.env.MUTDIFF_DUMP === "1") console.log(markup.replace(/></g, ">\n<"));
		assert.doesNotMatch(markup, /mtd_editorMenu"/, "the picker stays closed until it is asked for");

		const button = elements.find((element) => element.props.className === "mtd_editorButton");
		assert.ok(button !== undefined, "the action must be a real button element");
		assert.equal(typeof button.props.onClick, "function");
		button.props.onClick();
		await settle();

		const open = requests.filter((entry) => entry.url.endsWith("/open")).at(-1);
		assert.ok(open !== undefined, "clicking the action must reach /mutdiff/open");
		assert.equal(open.url, "/mutdiff/open");
		assert.equal(open.options.method, "POST");
		assert.match(open.options.headers["content-type"], /application\/json/);
		const payload = JSON.parse(open.options.body);
		assert.equal(payload.path, HUNK.path, "an absolute mutation path is sent unchanged");
		assert.equal(payload.hint, "const a = 2;", "the hint is the first line the mutation added");
		assert.equal(payload.editor, "code", "the host's effective editor is named explicitly");

		// a workspace-relative path is resolved against the session cwd, like the chat view
		assert.equal(exports.__testing.resolveAgainstCwd("src/app.ts", CWD), "/home/u/proj/src/app.ts");
		assert.equal(exports.__testing.resolveAgainstCwd("/abs/app.ts", CWD), "/abs/app.ts");
		assert.equal(exports.__testing.resolveAgainstCwd("~/notes.md", CWD), "~/notes.md", "a home path is the host's to expand");
		assert.equal(exports.__testing.resolveAgainstCwd("", CWD), null);

		// a relative hunk reaches the host absolute
		elements.length = 0;
		render(DiffRow, {
			...ROW_PROPS,
			callId: "c2",
			t,
			toolName: "edit",
			block: { kind: "tool-result", callId: "c2", call: { name: "edit", argsRaw: EDIT_ARGS }, meta: { diffs: [{ ...HUNK, path: "src/app.ts" }] }, content: [], isError: false }
		});
		const relative = elements.find((element) => element.props.className === "mtd_editorButton");
		relative.props.onClick();
		await settle();
		assert.equal(JSON.parse(requests.filter((entry) => entry.url.endsWith("/open")).at(-1).options.body).path, "/home/u/proj/src/app.ts");

		// the picker's choice is remembered and sent on the next open
		exports.__testing.chooseEditor("windsurf");
		button.props.onClick();
		await settle();
		assert.equal(JSON.parse(requests.filter((entry) => entry.url.endsWith("/open")).at(-1).options.body).editor, "windsurf", "a picker choice overrides the host default");
		assert.equal(exports.__testing.bridgeState().editor, "windsurf");

		// a failing route surfaces as a short reason, and the row keeps rendering
		globalThis.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ ok: false, reason: "no-editor" }) });
		await exports.__testing.requestOpen(HUNK.path, "");
		assert.equal(exports.__testing.bridgeState().error, "no-editor");
		assert.equal(exports.__testing.bridgeState().pending, false, "a settled failure clears the in-flight flag");
		markup = render(DiffRow, { ...ROW_PROPS, callId: "c1", t, toolName: "edit", block });
		assert.match(markup, /No editor command was found/, "the failure is shown as words, not as a code");
		assert.match(markup, />Copy</, "the diff card survives a failed open");

		// an unreachable route hides the action instead of breaking the row
		const bare = await loadFactory(target);
		globalThis.fetch = () => Promise.reject(new Error("offline"));
		const warnings = [];
		const originalWarn = console.warn;
		console.warn = (...args) => warnings.push(args.join(" "));
		let second;
		try {
			second = bare(makeRequire({ primitives: makePrimitives({ strictLabels: true }).primitives, runtime: "missing", failures: [] }));
			mount(second);
			await settle();
		} finally {
			console.warn = originalWarn;
		}
		assert.equal(second.__testing.bridgeState().status, "unavailable");
		assert.equal(warnings.length, 1, "the unavailability is reported exactly once");
		assert.match(warnings[0], /bridge is unavailable/);
		const bareRow = mount(second)[0].component;
		const bareMarkup = render(bareRow, { ...ROW_PROPS, callId: "c9", t, toolName: "edit", block });
		assert.doesNotMatch(bareMarkup, /Open in editor/, "with no route there is no action to offer");
		assert.match(bareMarkup, /data-open="true"/, "the stock diff row still renders");

		console.log("  ok  scenario F — editor action, picker, and posted payload");
	} finally {
		globalThis.fetch = originalFetch;
	}
}

/* -------------------------------------------------------------------------- */
/* scenario G — the auto-open decision                                         */
/* -------------------------------------------------------------------------- */

/**
 * Auto-open is the effect that makes the other screen live, so its decision is
 * a pure function and is pinned here: it fires once per settled successful
 * mutation, never for a failure, never while the host bridge is unknown, and
 * never twice for the same call.
 *
 * The three-line effect that consumes it runs only in a real browser — a
 * static-markup render never executes effects — so that wiring is covered by
 * the live check in the README, not here.
 */
async function scenarioAutoOpen() {
	const factory = await loadFactory(target);
	const exports = factory(makeRequire({ primitives: makePrimitives({ strictLabels: true }).primitives, runtime: "missing", failures: [] }));
	const { openPlanFor, firstChangedLine } = exports.__testing;

	const ready = { status: "ready", autoOpen: true, state: "ok", callId: "call-1", path: "/home/u/proj/src/app.ts", hint: "const a = 2;" };
	assert.deepEqual(openPlanFor(ready), { path: ready.path, hint: ready.hint }, "a settled success opens its file");
	assert.equal(openPlanFor(ready), null, "the same call never opens twice");
	assert.deepEqual(openPlanFor({ ...ready, callId: "call-2" }), { path: ready.path, hint: ready.hint }, "a later call opens on its own");
	assert.equal(openPlanFor({ ...ready, callId: "call-3", autoOpen: false }), null, "auto-open off means no plan");
	assert.equal(openPlanFor({ ...ready, callId: "call-4", status: "unknown" }), null, "an unanswered roster means no plan");
	assert.equal(openPlanFor({ ...ready, callId: "call-5", status: "unavailable" }), null, "a missing route means no plan");
	assert.equal(openPlanFor({ ...ready, callId: "call-6", state: "error" }), null, "a failed mutation opens nothing");
	assert.equal(openPlanFor({ ...ready, callId: "call-7", state: "stopped" }), null, "an interrupted mutation opens nothing");
	assert.equal(openPlanFor({ ...ready, callId: undefined }), null, "a call with no identity cannot be deduplicated");
	assert.equal(openPlanFor({ ...ready, callId: "call-8", path: null }), null, "a row with no file has nothing to open");
	assert.deepEqual(openPlanFor({ ...ready, callId: "call-9", hint: undefined }), { path: ready.path, hint: "" }, "a missing hint degrades to the top of the file");

	// the hint is the first line the mutation added, which is the line a reader wants
	assert.equal(firstChangedLine("const a = 1;", "const a = 2;"), "const a = 2;");
	assert.equal(firstChangedLine("a\nb\nc", "a\nb2\nc\nd"), "b2", "the first genuinely new line wins");
	assert.equal(firstChangedLine(null, "\n  first real line\nsecond"), "first real line", "a created file skips blank lines");
	assert.equal(firstChangedLine("same", "same"), "same", "an unchanged text still yields a usable hint");
	assert.equal(firstChangedLine("a", ""), "", "empty new text yields no hint");
	assert.equal(firstChangedLine("a", "x".repeat(400)).length, 240, "a very long line is capped before it crosses the wire");

	// precedence, end to end through the store: an invocation variable outranks a
	// preference stored in this browser, and the browser preference outranks the
	// host's own default. Each case imports fresh, since the stored choices are
	// read at factory scope.
	const originalFetch = globalThis.fetch;
	const stateFrom = (body) => () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
	const ROSTER = [{ id: "code", label: "VS Code" }, { id: "windsurf", label: "Windsurf" }];
	const loadWith = async (hostState, seed) => {
		const factoryFresh = await loadFactory(target, seed);
		const built = makePrimitives({ strictLabels: true });
		const loaded = factoryFresh(makeRequire({ primitives: built.primitives, runtime: "missing", failures: [] }));
		// the stub must be in place before mount, since activating the entry is
		// what reads the roster
		globalThis.fetch = stateFrom(hostState);
		mount(loaded);
		await settle();
		return loaded.__testing.bridgeState();
	};

	try {
		const plain = await loadWith({ ok: true, autoOpen: true, autoOpenPinnedBy: null, gotoLine: true, effective: "code", editors: ROSTER }, { "dsh-client-ui-mutdiff:auto-open": "0" });
		assert.equal(plain.autoOpen, false, "a browser choice outranks the host default");
		assert.equal(plain.autoOpenPinnedBy, null);

		const pinned = await loadWith({ ok: true, autoOpen: true, autoOpenPinnedBy: "MUTDIFF_AUTO_OPEN", gotoLine: true, effective: "code", editors: ROSTER }, { "dsh-client-ui-mutdiff:auto-open": "0" });
		assert.equal(pinned.autoOpen, true, "naming the variable on the invocation outranks a stored click");
		assert.equal(pinned.autoOpenPinnedBy, "MUTDIFF_AUTO_OPEN", "the picker is told what pinned it");

		const invokedOff = await loadWith({ ok: true, autoOpen: false, autoOpenPinnedBy: "MUTDIFF_AUTO_OPEN", gotoLine: true, effective: "code", editors: ROSTER }, { "dsh-client-ui-mutdiff:auto-open": "1" });
		assert.equal(invokedOff.autoOpen, false, "and it can pin auto-open off just as well");
	} finally {
		globalThis.fetch = originalFetch;
	}

	// the picker writes its choices, so a browser keeps them across reloads
	const persistFactory = await loadFactory(target);
	const persistExports = persistFactory(makeRequire({ primitives: makePrimitives({ strictLabels: true }).primitives, runtime: "missing", failures: [] }));
	mount(persistExports);
	await settle();
	persistExports.__testing.setAutoOpen(true);
	persistExports.__testing.chooseEditor("windsurf");
	assert.equal(storage.get("dsh-client-ui-mutdiff:auto-open"), "1", "the switch persists");
	assert.equal(storage.get("dsh-client-ui-mutdiff:editor"), "windsurf", "the editor choice persists");
	assert.equal(persistExports.__testing.bridgeState().editor, "windsurf", "and takes effect immediately");

	console.log("  ok  scenario G — auto-open fires once per settled success");
}

/* -------------------------------------------------------------------------- */
/* scenarios H + I — the host half: route, fence, and validation               */
/* -------------------------------------------------------------------------- */

/** A minimal `IncomingMessage`: headers, a method, a url, and a body to emit. */
function fakeReq({ method = "GET", url = "/mutdiff/state", headers = {}, body } = {}) {
	const listeners = new Map();
	const req = {
		method,
		url,
		headers,
		on(event, callback) {
			listeners.set(event, [...(listeners.get(event) ?? []), callback]);
			return req;
		},
		resume() {},
		destroy() {},
		emit(event, value) {
			for (const callback of listeners.get(event) ?? []) callback(value);
		}
	};
	if (body !== undefined) {
		queueMicrotask(() => {
			req.emit("data", Buffer.from(body));
			req.emit("end");
		});
	}
	return req;
}

/** A minimal `ServerResponse` that records status, headers, and body. */
function fakeRes() {
	return {
		status: null,
		headers: null,
		body: "",
		writeHead(status, headers) {
			this.status = status;
			this.headers = headers;
		},
		end(payload) {
			this.body = payload ?? "";
		}
	};
}

/** The host context shape `apply` touches: a scoped inject, an effect, a route seat, a logger. */
function fakeHostContext() {
	const registered = [];
	const dependencies = [];
	const ctx = {
		logger: { info() {}, warn() {} },
		get: () => undefined,
		inject(deps, callback) {
			dependencies.push(deps);
			callback({
				effect(factory) {
					return factory();
				},
				webServer: {
					register(route) {
						registered.push(route);
						return () => {};
					}
				},
				logger: ctx.logger
			});
		}
	};
	return { ctx, registered, dependencies };
}

async function scenarioHostRoute() {
	const host = await import(`${pathToFileURL(resolve(here, "../lib/index.js")).href}?scenario=${importCounter++}`);
	const fake = fakeHostContext();

	host.apply(fake.ctx, { editor: "code" });
	assert.deepEqual(fake.dependencies, [["webServer"]], "a missing web server must leave the row active, so the dependency is scoped, not declared");
	assert.equal(fake.registered.length, 1, "exactly one route is claimed");
	assert.equal(fake.registered[0].kind, "prefix");
	assert.equal(fake.registered[0].path, "/mutdiff");
	assert.equal(typeof fake.registered[0].handler, "function");

	// config is read defensively: nothing here may throw on a typo
	const none = {};
	const defaults = host.normalizeConfig(undefined, none);
	assert.deepEqual(defaults, {
		editor: "auto",
		autoOpen: false,
		gotoLine: true,
		roots: [],
		openArgs: [],
		sources: { editor: "default", autoOpen: "default", gotoLine: "default" },
		autoOpenVariable: null
	});
	assert.equal(host.normalizeConfig({ editor: "   " }, none).editor, "auto", "a blank editor falls back to auto");
	assert.equal(host.normalizeConfig({ autoOpen: "yes" }, none).autoOpen, false, "only a real boolean turns auto-open on");
	assert.equal(host.normalizeConfig({ gotoLine: false }, none).gotoLine, false);
	assert.deepEqual(host.normalizeConfig({ roots: ["/a", 7, ""] }, none).roots, ["/a"], "non-strings are dropped from roots");
	assert.deepEqual(host.normalizeConfig("nonsense", none).openArgs, [], "a non-object config degrades to the defaults");

	// the invocation variables: no file, one run only
	const invoked = host.normalizeConfig(undefined, { MUTDIFF_AUTO_OPEN: "1", MUTDIFF_EDITOR: "windsurf", MUTDIFF_GOTO_LINE: "0" });
	assert.equal(invoked.autoOpen, true, "MUTDIFF_AUTO_OPEN=1 turns auto-open on for this run");
	assert.equal(invoked.editor, "windsurf");
	assert.equal(invoked.gotoLine, false, "MUTDIFF_GOTO_LINE=0 asks for no line jump");
	assert.deepEqual(invoked.sources, { editor: "env", autoOpen: "env", gotoLine: "env" });
	// the one-word form: naming MUTDIFF at all is the request
	const word = (value) => host.normalizeConfig(undefined, { MUTDIFF: value });
	assert.equal(word("code").editor, "code", "MUTDIFF=code names the editor");
	assert.equal(word("code").autoOpen, true, "and asks for the automatic mode in the same word");
	assert.equal(word("code").autoOpenVariable, "MUTDIFF", "the picker is told which word pinned it");
	assert.equal(word("1").editor, "auto", "MUTDIFF=1 keeps the auto-detected editor");
	assert.equal(word("on").autoOpen, true);
	assert.equal(word("0").autoOpen, false, "MUTDIFF=0 turns the automatic mode off explicitly");
	assert.equal(word("0").autoOpenVariable, "MUTDIFF");
	assert.equal(word("/opt/editors/mine --wait").editor, "/opt/editors/mine --wait", "any other word is read as the editor, command path included");
	assert.equal(host.normalizeConfig(undefined, {}).autoOpen, false, "no word, no automatic mode");
	assert.equal(host.normalizeConfig(undefined, {}).autoOpenVariable, null);
	assert.equal(host.normalizeConfig(undefined, { MUTDIFF: "code", MUTDIFF_EDITOR: "zed" }).editor, "zed", "the spelled-out variable wins over the word");
	assert.equal(host.normalizeConfig({ autoOpen: true }, { MUTDIFF: "0" }).autoOpen, false, "and the word wins over a row default");

	for (const falsey of ["0", "false", "no", "off", ""]) {
		assert.equal(host.normalizeConfig(undefined, { MUTDIFF_AUTO_OPEN: falsey }).autoOpen, false, `"${falsey}" means off`);
	}
	assert.equal(host.normalizeConfig(undefined, { MUTDIFF_AUTO_OPEN: "true" }).autoOpen, true, "any other present value means on");
	assert.equal(host.normalizeConfig({ editor: "zed" }, { MUTDIFF_EDITOR: "code" }).editor, "code", "the invocation outranks the row config");
	assert.equal(host.normalizeConfig({ autoOpen: true }, { MUTDIFF_AUTO_OPEN: "0" }).autoOpen, false, "and it can turn a config default off");
	assert.deepEqual(host.normalizeConfig({ autoOpen: true }, none).sources.autoOpen, "config", "a row default is reported as such");
	// the harness reserves DSH_* for the launching environment (a .env that sets one
	// is a boot failure), so the plugin must not read from that namespace at all
	assert.equal(host.normalizeConfig(undefined, { DSH_MUTDIFF_AUTO_OPEN: "1" }).autoOpen, false, "a DSH_-prefixed name is the harness's namespace, not this plugin's");
	assert.deepEqual(host.normalizeConfig(undefined, { DSH_MUTDIFF_AUTO_OPEN: "1" }).sources.autoOpen, "default");

	// detection resolves a real executable off a PATH, without running anything
	const binDir = mkdtempSync(join(tmpdir(), "mutdiff-bin-"));
	const codePath = join(binDir, "code");
	writeFileSync(codePath, "#!/bin/sh\n");
	chmodSync(codePath, 0o755);
	try {
		const detected = host.detectEditors(host.normalizeConfig({ editor: "auto" }), { PATH: binDir });
		assert.deepEqual(detected.map((entry) => entry.id), ["code"]);
		assert.equal(detected[0].path, codePath);

		const root = mkdtempSync(join(tmpdir(), "mutdiff-root-"));
		const file = join(root, "app.ts");
		writeFileSync(file, "line one\nline two\nconst a = 2;\n");
		try {
			const launched = [];
			const bridge = host.createBridge({
				config: host.normalizeConfig({ editor: "code" }),
				detect: () => [{ id: "code", label: "VS Code", command: codePath, family: "code", path: codePath }],
				launch: (call) => {
					launched.push(call);
				},
				roots: [root]
			});

			const state = bridge.state();
			assert.equal(state.ok, true);
			assert.equal(state.effective, "code");
			assert.equal(state.autoOpen, false, "auto-open is opt-in");
			assert.equal(state.autoOpenPinnedBy, null, "nothing pinned it, so the picker owns the switch");
			assert.deepEqual(state.editors, [{ id: "code", label: "VS Code" }]);

			// a hint becomes the line it names, and the editor gets the reuse-window goto shape
			const opened = bridge.open({ path: file, hint: "const a = 2;" });
			assert.equal(opened.ok, true);
			assert.equal(opened.line, 3);
			assert.deepEqual(launched[0], { command: codePath, args: ["-r", "-g", `${file}:3`], file });

			// the same open within the dedupe window is a no-op, not a second window
			assert.equal(bridge.open({ path: file, hint: "const a = 2;" }).deduped, true);
			assert.equal(launched.length, 1, "a duplicate request must not spawn a second editor");

			// no hint, or a hint the file no longer contains, degrades to the top of the file
			assert.equal(bridge.open({ path: file }).line, 1);
			assert.equal(bridge.open({ path: file, hint: "a line that is not there" }).line, 1);

			// a path outside every known root, a missing file, and a directory are all refused
			assert.equal(bridge.open({ path: resolve(here, "../lib/index.js") }).reason, "outside-workspace");
			assert.equal(bridge.open({ path: join(root, "gone.ts") }).reason, "not-found");
			assert.equal(bridge.open({ path: root }).reason, "not-a-file");
			assert.equal(bridge.open({}).reason, "bad-request");
			assert.equal(bridge.open({ path: "relative.ts" }).reason, "not-found", "a relative path is resolved against the harness cwd, where nothing by that name exists");
			assert.equal(bridge.open({ path: relative(process.cwd(), resolve(here, "../lib/index.js")) }).reason, "outside-workspace", "a relative path that does resolve is still held to the root list");
			assert.equal(bridge.open({ path: `${file}\nrm -rf /` }).reason, "bad-request");
			assert.equal(launched.length, 2, "a refused open must not reach the process boundary");

			// a run pinned by an invocation variable, whose editor the picker may still override per click
			const pinnedBridge = host.createBridge({
				config: host.normalizeConfig(undefined, { MUTDIFF_AUTO_OPEN: "1", MUTDIFF_EDITOR: "windsurf" }),
				detect: () => [
					{ id: "windsurf", label: "Windsurf", command: codePath, family: "code", path: codePath },
					{ id: "code", label: "VS Code", command: codePath, family: "code", path: codePath }
				],
				launch: (call) => {
					launched.push(call);
				},
				roots: [root]
			});
			assert.equal(pinnedBridge.state().autoOpen, true);
			assert.equal(pinnedBridge.state().autoOpenPinnedBy, "MUTDIFF_AUTO_OPEN", "an invocation-pinned run says so, so the picker can name it instead of offering a switch that loses");
			assert.equal(pinnedBridge.state().effective, "windsurf", "the invoked editor leads the roster");
			assert.deepEqual(pinnedBridge.open({ path: file, editor: "code" }).args.slice(0, 2), ["-r", "-g"], "a click may still choose another editor");
			assert.equal(launched.at(-1).command, codePath);

			// a launch failure is reported, not thrown
			const failing = host.createBridge({
				config: host.normalizeConfig({}),
				detect: () => [{ id: "code", label: "VS Code", command: codePath, family: "code", path: codePath }],
				launch: () => {
					throw new Error("EACCES");
				},
				roots: [root]
			});
			assert.equal(failing.open({ path: file }).reason, "spawn-failed");

			// no editor at all is its own reason, so the browser can fall back
			const unarmed = host.createBridge({ config: host.normalizeConfig({}), detect: () => [], launch: () => {}, roots: [root] });
			assert.equal(unarmed.open({ path: file }).reason, "no-editor");

			// gotoLine off sends the bare path
			const bare = host.createBridge({
				config: host.normalizeConfig({ gotoLine: false }),
				detect: () => [{ id: "code", label: "VS Code", command: codePath, family: "code", path: codePath }],
				launch: (call) => {
					launched.push(call);
				},
				roots: [root]
			});
			assert.deepEqual(bare.open({ path: file, hint: "line two" }).args, ["-r", file]);

			console.log("  ok  scenario H — host route, editor detection, and open validation");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	} finally {
		rmSync(binDir, { recursive: true, force: true });
	}
}

async function scenarioHostFence() {
	const host = await import(`${pathToFileURL(resolve(here, "../lib/index.js")).href}?scenario=${importCounter++}`);
	const root = mkdtempSync(join(tmpdir(), "mutdiff-fence-"));
	const file = join(root, "app.ts");
	writeFileSync(file, "line one\nline two\n");
	const launched = [];
	const bridge = host.createBridge({
		config: host.normalizeConfig({ editor: "code" }),
		detect: () => [{ id: "code", label: "VS Code", command: "/fake/code", family: "code", path: "/fake/code" }],
		launch: (call) => {
			launched.push(call);
		},
		roots: [root]
	});
	const call = async (request) => {
		const response = fakeRes();
		bridge.handler(request, response);
		await settle();
		return response;
	};
	const loopback = { host: "127.0.0.1:3080" };

	try {
		// the fence: DNS rebinding and cross-site requests never reach the opener
		assert.equal(host.isTrustedRequest({ headers: loopback }), true);
		assert.equal(host.isTrustedRequest({ headers: { host: "localhost:3080" } }), true);
		assert.equal(host.isTrustedRequest({ headers: { host: "[::1]:3080" } }), true);
		assert.equal(host.isTrustedRequest({ headers: { host: "127.5.5.5:3080" } }), true, "the whole 127/8 block is loopback");
		assert.equal(host.isTrustedRequest({ headers: { host: "harness.internal" } }), false);
		assert.equal(host.isTrustedRequest({ headers: { host: "192.168.1.10:3080" } }), false, "a LAN address is not this server");
		assert.equal(host.isTrustedRequest({ headers: {} }), false, "a request with no Host cannot be trusted");
		assert.equal(host.isTrustedRequest({ headers: { host: "127.0.0.1:3080", "sec-fetch-site": "cross-site" } }), false);
		assert.equal(host.isTrustedRequest({ headers: { host: "127.0.0.1:3080", origin: "http://evil.example" } }), false);
		assert.equal(host.isTrustedRequest({ headers: { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" } }), true);

		assert.equal((await call(fakeReq({ headers: loopback }))).status, 200, "a loopback GET reads the roster");
		assert.equal(JSON.parse((await call(fakeReq({ headers: loopback }))).body).ok, true);
		assert.equal((await call(fakeReq({ headers: { host: "harness.internal" } }))).status, 403);
		assert.equal((await call(fakeReq({ headers: { host: "127.0.0.1:3080", "sec-fetch-site": "cross-site" } }))).status, 403);
		assert.equal((await call(fakeReq({ headers: { host: "127.0.0.1:3080", origin: "http://evil.example" } }))).status, 403);
		assert.equal(launched.length, 0, "a rejected request must never spawn anything");
		assert.equal((await call(fakeReq({ url: "/mutdiff/other", headers: loopback }))).status, 404);

		// the body contract: JSON only, and only what the opener needs
		assert.equal((await call(fakeReq({ method: "POST", url: "/mutdiff/open", headers: loopback, body: "path=/etc/passwd" }))).status, 400, "a form-shaped post is refused before any parsing");
		assert.equal((await call(fakeReq({ method: "POST", url: "/mutdiff/open", headers: { ...loopback, "content-type": "application/json" }, body: "{not json" }))).status, 400);
		const posted = await call(fakeReq({
			method: "POST",
			url: "/mutdiff/open",
			headers: { ...loopback, "content-type": "application/json" },
			body: JSON.stringify({ path: file, hint: "line two" })
		}));
		assert.equal(posted.status, 200);
		assert.equal(posted.headers["cache-control"], "no-store");
		const payload = JSON.parse(posted.body);
		assert.equal(payload.ok, true);
		assert.equal(payload.line, 2);
		assert.equal(launched.length, 1, "an accepted request reaches the process boundary exactly once");
		assert.deepEqual(launched[0].args, ["-r", "-g", `${file}:2`]);

		// the same contract over a real HTTP round trip: real request objects,
		// real header casing, a real response — the fake pair above cannot catch a
		// header name this code reads in the wrong case
		const server = createServer(bridge.handler);
		await new Promise((done) => {
			server.listen(0, "127.0.0.1", done);
		});
		try {
			const base = `http://127.0.0.1:${String(server.address().port)}`;
			const stateResponse = await fetch(`${base}/mutdiff/state`);
			assert.equal(stateResponse.status, 200, "a same-origin GET reaches the roster");
			assert.equal((await stateResponse.json()).ok, true);
			const plainResponse = await fetch(`${base}/mutdiff/open`, {
				method: "POST",
				headers: { "content-type": "text/plain" },
				body: "path=x"
			});
			assert.equal(plainResponse.status, 400, "a non-JSON post is refused over the wire too");
			const openResponse = await fetch(`${base}/mutdiff/open`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ path: file, hint: "line one" })
			});
			assert.equal(openResponse.status, 200);
			const opened = await openResponse.json();
			assert.equal(opened.ok, true);
			assert.equal(opened.line, 1, "the hint resolves against the file on disk over the wire as well");
			assert.equal(launched.length, 2, "the wire path reaches the process boundary once");
			assert.match(opened.args.join(" "), /-r -g /);
		} finally {
			await new Promise((done) => {
				server.close(done);
			});
		}

		console.log("  ok  scenario I — the route fence and its body contract");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

console.log(`dsh-client-ui-mutdiff compatibility suite\n  target: ${target}`);
await scenario015();
await scenario011();
await scenarioFailSoft();
await scenarioPlainFallback();
await scenarioStyleSheet();
await scenarioEditorAction();
await scenarioAutoOpen();
await scenarioHostRoute();
await scenarioHostFence();
/* -------------------------------------------------------------------------- */
/* scenario J — the host half against a real cordis context                    */
/* -------------------------------------------------------------------------- */

/**
 * The scenarios above drive the host half through a hand-written context, which
 * pins its own contract but not cordis's. This one uses the real thing: the row
 * activates, requests the web server through the *scoped* inject form, and
 * registers its route inside the effect that the route's lifetime rides on.
 *
 * It runs when `@deepseek-ai/cordis` resolves — which it does from inside a DSH
 * profile tree, where the package is hoisted beside its siblings — and prints a
 * skip line otherwise, so the published suite keeps no harness dependency.
 */
async function scenarioRealCordis() {
	let cordis;
	try {
		cordis = await import("@deepseek-ai/cordis");
	} catch {
		console.log("  --  scenario J — skipped: @deepseek-ai/cordis is not resolvable here (run this suite from inside a DSH profile to exercise it)");
		return;
	}
	const host = await import(`${pathToFileURL(resolve(here, "../lib/index.js")).href}?scenario=${importCounter++}`);
	const registered = [];
	const webServer = {
		register(route) {
			registered.push(route);
			return () => {};
		}
	};

	// A web server already composed when the row loads
	const early = new cordis.Context();
	early.provide("webServer", webServer);
	early.plugin(host, { editor: "code" });
	await settle();
	assert.equal(registered.length, 1, "the route is registered on a real cordis context");
	assert.equal(registered[0].kind, "prefix");
	assert.equal(registered[0].path, "/mutdiff");

	// No web server: the row still activates, and registering nothing is not a failure
	const late = new cordis.Context();
	late.plugin(host, { autoOpen: true });
	await settle();
	assert.equal(registered.length, 1, "a context without a web server registers no route and reports no error");

	// The scoped inject is not a one-shot: a web server composed afterwards still gets the route
	late.provide("webServer", webServer);
	await settle();
	assert.equal(registered.length, 2, "a web server composed after the row still receives the route");

	// The route seat is released with its fiber, exactly as the loader expects
	const scoped = new cordis.Context();
	scoped.provide("webServer", webServer);
	const fiber = scoped.plugin(host, {});
	await settle();
	const claimed = registered.length;
	assert.equal(claimed, 3);
	await fiber.dispose();
	assert.equal(registered.length, 3, "disposal does not re-register anything");

	console.log("  ok  scenario J — host row on a real cordis context");
}

await scenarioRealCordis();
console.log("all scenarios passed");

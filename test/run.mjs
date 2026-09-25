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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] === undefined ? resolve(here, "../lib/client.js") : resolve(process.argv[2]);

/*
 * This suite has to answer the same way whoever runs it. The plugin reads its
 * invocation variables straight from `process.env`, and a developer running
 * `npm test` from inside the very `dsh web` they started with `MUTDIFF=code`
 * would otherwise get a different answer than a clean CI shell — the ambient
 * variables would turn the automatic mode on underneath the scenarios that
 * assert it is off. Every scenario that cares about the environment passes its
 * own object, so scrubbing the ambient namespace here is what makes the rest of
 * them deterministic.
 */
for (const name of Object.keys(process.env)) if (name.startsWith("MUTDIFF")) delete process.env[name];

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

		// Live follow is the host opening every edit itself, so this page must keep
		// its own automatic mode down even when the reader asked for it — otherwise
		// one change opens two windows. The A/B below is the point: the stored
		// preference is identical in both loads, and only `follow` differs.
		const followLoad = async (follow) => {
			const loaded = await loadFactory(target, { "dsh-client-ui-mutdiff:auto-open": "1" });
			globalThis.fetch = (url) => String(url).endsWith("/state")
				? answer({
					ok: true,
					autoOpen: follow ? false : true,
					follow,
					gotoLine: true,
					configured: "code",
					effective: "code",
					autoOpenPinnedBy: null,
					editors: [{ id: "code", label: "VS Code" }]
				})
				: answer({ ok: true });
			const loadedExports = loaded(makeRequire({ primitives: makePrimitives({ strictLabels: true }).primitives, runtime: "missing", failures: [] }));
			mount(loadedExports);
			await settle();
			return loadedExports;
		};
		const notFollowing = await followLoad(false);
		assert.equal(notFollowing.__testing.bridgeState().autoOpen, true, "without follow, the reader's stored choice still stands");
		const following = await followLoad(true);
		assert.equal(following.__testing.bridgeState().follow, true, "the page learns that the host is following edits live");
		assert.equal(following.__testing.bridgeState().autoOpen, false, "a stored auto-open preference loses to live follow, so one change cannot open two windows");
		assert.equal(following.__testing.bridgeState().autoOpenPinnedBy, null, "follow is not a variable pin — the picker's note explains it instead");
		assert.equal(following.__testing.openPlanFor({
			autoOpen: following.__testing.bridgeState().autoOpen,
			status: "ready",
			state: "ok",
			callId: "c-follow",
			path: HUNK.path,
			hint: "const a = 2;"
		}), null, "so a settled mutation posts nothing from this page");
		// The picker's note renders only inside the menu, which a static render
		// cannot open (see the suite's limits); its text is asserted here against
		// the bundle, where a renamed key or a dropped note would show up.
		const bundle = readFileSync(target, "utf8");
		assert.match(bundle, /mutdiff\.followNote/, "the picker's follow note key travels in the bundle");
		assert.match(bundle, /Live follow is on/, "and its default text, so the disabled switch explains itself");

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
		follow: false,
		gotoLine: true,
		roots: [],
		openArgs: [],
		sources: { editor: "default", autoOpen: "default", follow: "default", gotoLine: "default" },
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
	assert.deepEqual(invoked.sources, { editor: "env", autoOpen: "env", follow: "default", gotoLine: "env" });
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

	// live follow: its own variable, its own source, and off unless it is asked for
	assert.equal(host.normalizeConfig(undefined, {}).follow, false, "follow is opt-in like everything else");
	assert.equal(host.normalizeConfig(undefined, { MUTDIFF_FOLLOW: "1" }).follow, true);
	assert.equal(host.normalizeConfig(undefined, { MUTDIFF_FOLLOW: "1" }).sources.follow, "env");
	assert.equal(host.normalizeConfig({ follow: true }, {}).follow, true, "a row default may turn it on");
	assert.equal(host.normalizeConfig({ follow: true }, {}).sources.follow, "config");
	assert.equal(host.normalizeConfig({ follow: true }, { MUTDIFF_FOLLOW: "0" }).follow, false, "and the invocation can turn it back off");
	assert.equal(host.normalizeConfig({ follow: "yes" }, {}).follow, false, "only a real boolean or a variable turns it on");
	assert.equal(host.normalizeConfig(undefined, { MUTDIFF: "code" }).follow, false, "the one-word form stays about auto-open");

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
			assert.equal(state.follow, false, "the browser is told whether the host is following edits live");
			assert.equal(state.autoOpenPinnedBy, null, "nothing pinned it, so the picker owns the switch");
			assert.deepEqual(state.editors, [{ id: "code", label: "VS Code" }]);

			// a hint becomes the line it names, and the editor gets the reuse-window goto shape
			const opened = bridge.open({ path: file, hint: "const a = 2;" });
			assert.equal(opened.ok, true);
			assert.equal(opened.line, 3);
			assert.deepEqual(launched[0], { command: codePath, args: ["-r", "-g", `${file}:3`], file });

			// an explicit line — what live follow resolves against the applied diff —
			// outranks the hint, and a nonsense one falls back to the hint path
			assert.equal(bridge.open({ path: file, line: 2, hint: "const a = 2;" }).line, 2, "a line the host resolved itself wins over a text the browser picked out");
			assert.deepEqual(launched.at(-1).args, ["-r", "-g", `${file}:2`]);
			assert.equal(bridge.open({ path: file, line: 0, hint: "line two" }).line, 2, "a line that is not a positive integer is ignored");
			assert.equal(bridge.open({ path: file, line: 2.5, hint: "line one" }).line, 1, "a fractional line is not a line");

			// the same open within the dedupe window is a no-op, not a second window
			assert.equal(bridge.open({ path: file, hint: "const a = 2;" }).deduped, true);
			assert.equal(launched.length, 3, "a duplicate request must not spawn a second editor");

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
			assert.equal(launched.length, 3, "a refused open must not reach the process boundary");

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

			// live follow owns the automatic mode: the host opens every edit itself,
			// so the page is told to keep its own auto-open off — one change must not
			// open two windows — while still naming whatever pinned that switch
			const following = host.createBridge({
				config: host.normalizeConfig(undefined, { MUTDIFF_FOLLOW: "1", MUTDIFF_AUTO_OPEN: "1" }),
				detect: () => [{ id: "code", label: "VS Code", command: codePath, family: "code", path: codePath }],
				launch: () => {},
				roots: [root]
			});
			assert.equal(following.state().follow, true);
			assert.equal(following.state().autoOpen, false, "the host is opening every edit itself, so the page must not");
			assert.equal(following.state().autoOpenPinnedBy, "MUTDIFF_AUTO_OPEN", "the variable that pinned auto-open is still named");
			const idle = host.createBridge({
				config: host.normalizeConfig({ follow: true }),
				detect: () => [{ id: "code", label: "VS Code", command: codePath, family: "code", path: codePath }],
				launch: () => {},
				roots: [root]
			});
			assert.equal(idle.state().follow, true, "a row default turns follow on without an invocation variable");
			assert.equal(idle.state().autoOpen, false);

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

/* -------------------------------------------------------------------------- */
/* scenario K — live follow: which event reveals what, and where               */
/* -------------------------------------------------------------------------- */

/**
 * The follow engine is the part of the plugin that decides, with no browser and
 * no click, where the agent is working. It is driven here on a manual clock and
 * a fake file store: a burst that coalesces into one spawn, a file already on
 * the right line, an event that is not a mutation at all, and a hunk that has
 * moved since it applied — each of which real timers and a real disk would make
 * either slow or flaky.
 */
async function scenarioFollow() {
	const host = await import(`${pathToFileURL(resolve(here, "../lib/index.js")).href}?scenario=${importCounter++}`);
	const config = host.normalizeConfig(undefined, { MUTDIFF_FOLLOW: "1", MUTDIFF_EDITOR: "code" });

	// The pure line arithmetic first, since everything below rides on it.
	assert.equal(host.lineForProbe("one\ntwo\nthree\n", "three"), 3, "a probe resolves to the line it sits on");
	// A probe the file does not contain reveals nothing rather than the top of
	// the file: the applied diff lands a moment later with the real line, and a
	// caret flung to line 1 and back is worse than a caret that never moved.
	assert.equal(host.lineForProbe("one\ntwo\nthree\n", "a\nb"), undefined, "an absent probe reports nothing");
	assert.equal(host.lineForProbe("one\ntwo\nthree\n", "  "), undefined, "a blank probe is not a probe");
	assert.equal(host.lineForProbe("one\n  two  \nthree\n", "two"), 2, "a probe still matches through indentation");
	// a multi-line probe is far more specific than a single line, which is the
	// whole reason follow does not reuse the browser's one-line hint
	assert.equal(host.lineForProbe("if (a) {\n  go()\n}\nif (a) {\n  stop()\n}\n", "if (a) {\n  stop()\n}"), 4, "a repeated first line does not fool a block match");
	assert.equal(host.firstAddedIndex(["a", "b"], ["a", "x", "b"]), 1, "an inserted line is the first added line");
	assert.equal(host.firstAddedIndex(["a", "b"], ["a", "b"]), 0, "a block with nothing added points at the block itself");
	assert.equal(host.firstAddedIndex(["a", "b"], ["b"]), 0, "a removal-only hunk points at the hunk");
	assert.equal(host.firstAddedIndex([], ["", "x"]), 1, "a new file points at its first line with content");
	assert.equal(host.lineForDiff("one\ntwo\nTWO\nthree\n", { path: "f", oldText: "two\nthree", newText: "two\nTWO\nthree" }), 3, "the applied hunk resolves to the line it added");
	assert.equal(host.lineForDiff("one\ntwo\nthree\n", { path: "f", oldText: null, newText: "one\ntwo\nthree" }), 1, "an overwrite points at its first line with content");
	// A file that no longer contains the hunk verbatim still reports what it can
	// prove — the block's first line — rather than an offset inside a block it
	// could not match. A file containing none of the block reports nothing: the
	// editor is not moved to the top of a file for a change it cannot find.
	assert.equal(host.lineForDiff("a\nCHANGED\nb\n", { path: "f", oldText: "a\nx\nb", newText: "a\nX\nb" }), 1, "an approximate anchor reports the hunk's first line");
	assert.equal(host.lineForDiff("nothing like it\n", { path: "f", oldText: "a\nb", newText: "a\nB\nb" }), undefined, "a file containing none of the block reports nothing");

	// The metadata narrowing, mirrored from the tool that produces it.
	assert.equal(host.diffsFromMeta(undefined), undefined, "absent meta is not a diff");
	assert.equal(host.diffsFromMeta({ path: "f", offset: 1, lines: [] }), undefined, "another tool's meta is not a diff");
	assert.equal(host.diffsFromMeta({ diffs: [] }), undefined, "an empty diff list is not a mutation");
	assert.equal(host.diffsFromMeta({ diffs: [{ path: "f", oldText: 7, newText: "x" }] }), undefined, "a malformed hunk is dropped rather than trusted");
	assert.deepEqual(host.diffsFromMeta({ diffs: [{ path: "f", oldText: null, newText: "x", extra: 1 }] }).length, 1);

	// A manual clock, so "coalesce" and "sticky" are assertions rather than sleeps.
	const timers = new Map();
	let timerId = 0;
	const timer = {
		set(callback) {
			timerId += 1;
			timers.set(timerId, callback);
			return timerId;
		},
		clear(id) {
			timers.delete(id);
		}
	};
	/** Run every waiting burst, oldest first. Returns how many there were. */
	const fire = () => {
		const due = [...timers.entries()];
		timers.clear();
		for (const [, callback] of due) callback();
		return due.length;
	};
	let clock = 1_000_000;
	/**
	 * The files the engine reads, and a mutation helper: the tool writes the file
	 * first and the event lands after, so every case below applies its hunk to the
	 * store before handing the event over — which is what makes the line numbers
	 * asserted here the ones an editor would really be sent to.
	 */
	const store = new Map([
		["/w/main.ts", "one\ntwo\nthree\nfour\n"],
		["/w/burst.ts", "alpha\nbeta\ngamma\n"],
		["/w/probe.ts", "x\ny\nz\n"]
	]);
	const applied = (path, oldText, newText) => {
		const text = store.get(path) ?? "";
		const index = oldText === null ? -1 : text.indexOf(oldText);
		if (oldText === null) store.set(path, newText);
		else if (index >= 0) store.set(path, `${text.slice(0, index)}${newText}${text.slice(index + oldText.length)}`);
		return { path, oldText, newText };
	};
	const revealed = [];
	const follower = host.createFollower({
		config,
		open: (payload) => {
			revealed.push(payload);
			return { ok: true, line: payload.line };
		},
		read: (file) => store.get(file),
		timer,
		now: () => clock,
		coalesceMs: 150,
		stickyMs: 1500
	});
	const result = (meta) => ({ type: "tool/result", seq: 1, time: clock, data: { turn: 1, step: 1, message: {}, meta } });
	const call = (name, args) => ({ type: "tool/call", seq: 2, time: clock, data: { turn: 1, step: 1, callId: "c1", name, arguments: JSON.stringify(args) } });

	// An applied diff reveals its own line — after the burst window, not before.
	follower.handle({}, result({ diffs: [applied("/w/main.ts", "two\nthree", "two\nTWO\nthree")] }));
	assert.deepEqual(revealed, [], "a reveal waits out the coalescing window");
	assert.equal(fire(), 1, "exactly one burst was scheduled");
	assert.deepEqual(revealed, [{ path: "/w/main.ts", line: 3 }], "the caret lands on the line the hunk added, not the hunk's first context line");

	// The same line again is not worth raising the window for…
	follower.handle({}, result({ diffs: [{ path: "/w/main.ts", oldText: "two\nthree", newText: "two\nTWO\nthree" }] }));
	fire();
	assert.equal(revealed.length, 1, "a file already sitting on that line is not re-opened");
	// …but a later edit to the same line is a real move, once the window has passed.
	clock += 2_000;
	follower.handle({}, result({ diffs: [{ path: "/w/main.ts", oldText: "two\nthree", newText: "two\nTWO\nthree" }] }));
	fire();
	assert.equal(revealed.length, 2, "the sticky window expires");

	// A burst in one file is one spawn carrying the last line it reached.
	clock += 2_000;
	follower.handle({}, result({ diffs: [applied("/w/burst.ts", "alpha", "alpha\nA1")] }));
	follower.handle({}, result({ diffs: [applied("/w/burst.ts", "gamma", "GAMMA")] }));
	assert.equal(fire(), 1, "two mutations in flight coalesce into one burst");
	assert.deepEqual(revealed.at(-1), { path: "/w/burst.ts", line: 4 }, "the burst carries the newest line, not the first");

	// Two files in one result are two reveals: they are different tabs.
	clock += 2_000;
	follower.handle({}, result({
		diffs: [
			applied("/w/main.ts", "four", "FOUR"),
			applied("/w/burst.ts", "beta", "BETA")
		]
	}));
	assert.equal(fire(), 2, "one reveal per file, not one per event");
	assert.deepEqual(revealed.slice(-2), [{ path: "/w/main.ts", line: 5 }, { path: "/w/burst.ts", line: 3 }]);

	// `edit` reveals before it applies: its probe is on disk already.
	clock += 2_000;
	follower.handle({}, call("edit", { file_path: "/w/probe.ts", old_string: "y", new_string: "Y" }));
	fire();
	assert.deepEqual(revealed.at(-1), { path: "/w/probe.ts", line: 2 }, "an edit's old_string locates the line it is about to change");
	// `write` has no probe on disk, and a call whose arguments are still
	// streaming is not parseable: both wait for the applied diff instead.
	follower.handle({}, call("write", { file_path: "/w/probe.ts", content: "nope" }));
	assert.equal(fire(), 0, "a write has nothing on disk to locate until it lands");
	follower.handle({}, { type: "tool/call", seq: 3, time: clock, data: { turn: 1, step: 1, callId: "c2", name: "edit", arguments: '{"file_path":"/w/probe.ts","old_str' } });
	assert.equal(fire(), 0, "arguments still arriving are unparseable JSON, not a location");
	// A probe the file no longer matches is the same kind of nothing: the applied
	// diff is the trigger that follows, and it knows the real line.
	follower.handle({}, call("edit", { file_path: "/w/probe.ts", old_string: "a line that is not there", new_string: "x" }));
	assert.equal(fire(), 0, "a probe the file does not contain reveals nothing, rather than line 1");

	// Only mutations count: a read's own meta, a chunk, and a turn boundary are not lines.
	clock += 2_000;
	follower.handle({}, { type: "assistant/chunk", seq: 4, time: clock, data: { turn: 1, step: 1, chunk: {} } });
	follower.handle({}, result({ path: "/w/probe.ts", offset: 1, lines: [{ number: 1, text: "x" }], totalLines: 3 }));
	follower.handle({}, result(null));
	assert.equal(fire(), 0, "nothing but an applied file mutation counts");

	// A file the feed names but the reader cannot open is skipped, not guessed at.
	follower.handle({}, result({ diffs: [{ path: "/w/gone.ts", oldText: null, newText: "x" }] }));
	assert.equal(fire(), 0, "an unreadable file schedules nothing");

	// A reveal the bridge refused (outside the workspace, no editor) does not
	// become the sticky line, so the next event still tries.
	const refusing = host.createFollower({
		config,
		open: () => ({ ok: false, reason: "outside-workspace" }),
		read: (file) => store.get(file),
		timer,
		now: () => clock
	});
	refusing.handle({}, result({ diffs: [{ path: "/w/main.ts", oldText: "four", newText: "FOUR" }] }));
	fire();
	assert.equal(fire(), 0, "a refused reveal leaves nothing waiting");
	refusing.handle({}, result({ diffs: [{ path: "/w/main.ts", oldText: "four", newText: "FOUR" }] }));
	assert.equal(fire(), 1, "and it is retried rather than remembered as done");
	fire();

	// Follow off is the default: the same feed reveals nothing at all.
	const off = host.createFollower({ config: host.normalizeConfig(undefined, {}), open: () => ({ ok: true }), read: () => "x", timer, now: () => clock });
	off.handle({}, result({ diffs: [{ path: "/w/main.ts", oldText: null, newText: "x" }] }));
	assert.equal(fire(), 0, "follow does nothing unless it was asked for");

	// A waiting burst is dropped when the row unloads.
	follower.handle({}, result({ diffs: [{ path: "/w/main.ts", oldText: "four", newText: "FOUR" }] }));
	assert.equal(timers.size, 1, "the burst is waiting");
	follower.dispose();
	assert.equal(timers.size, 0, "dispose drops it, so a timer cannot outlive the row");

	console.log("  ok  scenario K — live follow: events, lines, coalescing, and the sticky window");
}

/* -------------------------------------------------------------------------- */
/* scenario L — live follow end to end, through the row and a real spawn        */
/* -------------------------------------------------------------------------- */

/**
 * Scenario K drives the engine through its seams, and scenarios H/I drive the
 * bridge the same way. This one drives the *row*: a real cordis context, the
 * real `apply`, a real session event, and a real `spawn` — with a stand-in
 * `code` shim on the PATH recording its argv, since asserting on a real editor
 * window is not something a test can do.
 *
 * It is the only scenario that crosses the process boundary, and it is the only
 * one that can catch what the seams cannot: a listener that never reaches the
 * engine, a config field the row drops, or an argv shape the editor would
 * reject.
 */
async function scenarioFollowWiring() {
	let cordis;
	try {
		cordis = await import("@deepseek-ai/cordis");
	} catch {
		console.log("  --  scenario L — skipped: @deepseek-ai/cordis is not resolvable here (run this suite from inside a DSH profile to exercise it)");
		return;
	}
	const host = await import(`${pathToFileURL(resolve(here, "../lib/index.js")).href}?scenario=${importCounter++}`);
	const root = mkdtempSync(join(tmpdir(), "mutdiff-live-"));
	const bin = join(root, "bin");
	mkdirSync(bin);
	const record = join(root, "argv.txt");
	const file = join(root, "app.ts");
	writeFileSync(file, "one\ntwo\nthree\n");
	writeFileSync(join(bin, "code"), `#!/bin/sh\nprintf '%s\\n' "$@" > ${record}\n`);
	chmodSync(join(bin, "code"), 0o755);
	const previousPath = process.env.PATH;
	process.env.PATH = bin;
	try {
		const context = new cordis.Context();
		context.provide("webServer", { register: () => () => {} });
		context.plugin(host, { follow: true, editor: "code" });
		await settle();

		// The event a `write`/`edit` tool result carries: path plus applied hunk.
		// The tool writes the file first and the event lands after, so the file on
		// disk is the post-apply text by the time the row sees the hunk.
		writeFileSync(file, "one\nTWO\ntwo\nthree\n");
		context.emit("session/event", {}, {
			type: "tool/result",
			seq: 1,
			time: Date.now(),
			data: {
				turn: 1,
				step: 1,
				message: { role: "tool" },
				meta: { diffs: [{ path: file, oldText: "one\ntwo", newText: "one\nTWO\ntwo" }] }
			}
		});

		const argv = await waitForLines(record, 4_000);
		assert.deepEqual(argv, ["-r", "-g", `${file}:2`], "the row follows a real event to a real editor launch, on the line the hunk added");

		// Follow is off unless the row is configured for it: the same event then
		// reaches a listener that does nothing, and no process is spawned.
		const quietRoot = join(root, "quiet");
		mkdirSync(quietRoot);
		const quietFile = join(quietRoot, "app.ts");
		writeFileSync(quietFile, "one\ntwo\n");
		const quietRecord = join(quietRoot, "argv.txt");
		const quiet = new cordis.Context();
		quiet.provide("webServer", { register: () => () => {} });
		quiet.plugin(host, { editor: "code" });
		await settle();
		quiet.emit("session/event", {}, {
			type: "tool/result",
			seq: 1,
			time: Date.now(),
			data: { turn: 1, step: 1, message: {}, meta: { diffs: [{ path: quietFile, oldText: "one\n", newText: "one\n" }] } }
		});
		await new Promise((done) => { setTimeout(done, 400); });
		assert.equal(existsSync(quietRecord), false, "an unconfigured row follows nothing");

		console.log("  ok  scenario L — live follow end to end: the row, a real event, and a real spawn");
	} finally {
		process.env.PATH = previousPath;
		rmSync(root, { recursive: true, force: true });
	}
}

/** Poll for a file of recorded lines, and return them; fails loudly on timeout. */
async function waitForLines(file, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (existsSync(file)) {
			const text = readFileSync(file, "utf8");
			if (text.trim() !== "") return text.split("\n").filter((line) => line !== "");
		}
		if (Date.now() > deadline) assert.fail(`the editor was never launched: ${file} stayed empty`);
		await new Promise((done) => { setTimeout(done, 25); });
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
await scenarioFollow();
await scenarioFollowWiring();
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

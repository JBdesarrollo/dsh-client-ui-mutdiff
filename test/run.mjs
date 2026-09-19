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
 * Usage: node test/run.mjs [path/to/client.js]
 */
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] === undefined ? resolve(here, "../lib/client.js") : resolve(process.argv[2]);

let importCounter = 0;
/** Text of every stylesheet the bundle injected during the last import. */
let injectedStyles = [];

/** Install the browser globals the bundle touches at import time. */
function installBrowserGlobals() {
	const registration = { value: null };
	const styles = [];
	injectedStyles = styles;
	globalThis.window = {
		setTimeout,
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

/** Import the bundle fresh (cache-busted) and return its factory. */
async function loadFactory(file) {
	const registration = installBrowserGlobals();
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
function makeRequire({ primitives, runtime, failures }) {
	return (specifier) => {
		if (specifier === "react") return React;
		if (specifier === "react/jsx-runtime") return { jsx, jsxs, Fragment };
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
	for (const name of ["mtd_ioCard", "mtd_visuallyHidden", "mtd_diffBody", "mtd_inspectButton", "mtd_fileLink"]) {
		assert.ok(css.includes(`.${name}`), `the stylesheet lost .${name}`);
	}
	// the highlight hooks the prefix pseudo-elements depend on
	assert.match(css, /\.mtd_hlDel span\.line:before\{content:'- '/, "the removed-side prefix rule must be intact");
	assert.match(css, /\.mtd_hlAdd span\.line:before\{content:'\+ '/, "the added-side prefix rule must be intact");

	console.log("  ok  scenario E — stylesheet intact and complete");
}

console.log(`dsh-client-ui-mutdiff compatibility suite\n  target: ${target}`);
await scenario015();
await scenario011();
await scenarioFailSoft();
await scenarioPlainFallback();
await scenarioStyleSheet();
console.log("all scenarios passed");

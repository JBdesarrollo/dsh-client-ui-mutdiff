/**
 * Compatibility suite for the browser bundle.
 *
 * The plugin hand-mirrors parts of `@deepseek-ai/dsh-client-ui-tool` and renders
 * through `@deepseek-ai/dsh-client-ui-primitives`, so its real failure mode is
 * API drift between DSH releases rather than anything the host can validate at
 * install time. This suite therefore boots `lib/client.js` inside a stub module
 * loader twice — once against the 0.1.1-rc.2 surface and once against the
 * 0.1.5-rc.2 surface — and renders real rows through React.
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

/** Install the browser globals the bundle touches at import time. */
function installBrowserGlobals() {
	const registration = { value: null };
	globalThis.window = {
		__ModuleLoader__: {
			load(value) {
				registration.value = value;
			}
		}
	};
	globalThis.document = {
		querySelector: () => null,
		createElement: () => ({ dataset: {}, style: {}, textContent: "" }),
		head: { appendChild: () => {} }
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
 * Primitives stub. `strictLabels` reproduces 0.1.5-rc.2's `DiffBlock`, which
 * dereferences its `labels` prop unconditionally and therefore throws a
 * TypeError when a caller omits it. The lenient flavour reproduces 0.1.1-rc.2,
 * which destructures only `diffs`/`maxLines`/`className` and ignores the rest.
 */
function makePrimitives({ strictLabels, withDiffTotals }) {
	const diffBlockCalls = [];

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
				"data-copied-label": copyLabel,
				"data-files-label": strictLabels ? props.labels.files(props.diffs.length) : ""
			},
			...shown.map((line, index) => React.createElement("div", { key: index }, line)),
			strictLabels
				? React.createElement("button", { type: "button" }, props.labels.expand(shown.length))
				: null
		);
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
	if (withDiffTotals) {
		primitives.diffTotals = (diffs) => {
			const lines = (value) => (value === null ? [] : value.split("\n"));
			let added = 0;
			let removed = 0;
			for (const hunk of diffs) {
				added += lines(hunk.newText).length;
				removed += lines(hunk.oldText).length;
			}
			return { added, removed };
		};
	}
	return { primitives, diffBlockCalls };
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
function mount(exports, primitives) {
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
	void primitives;
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

/* -------------------------------------------------------------------------- */
/* scenario A — DSH 0.1.5-rc.2: runtime package gone, DiffBlock needs `labels` */
/* -------------------------------------------------------------------------- */

async function scenario015() {
	const factory = await loadFactory(target);
	const failures = [];
	const built = makePrimitives({ strictLabels: true, withDiffTotals: true });
	const exports = factory(makeRequire({ primitives: built.primitives, runtime: "missing", failures }));

	assert.deepEqual(failures, ["@deepseek-ai/dsh-client-runtime/client"], "the bundle must attempt the legacy require before falling back");
	assert.equal(typeof exports.apply, "function", "module must export the plugin apply");
	assert.deepEqual(exports.inject, ["slots"], "a version-specific service name (connection/remote) must not be declared");

	const registrations = mount(exports, built.primitives);
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
	const rowProps = { t, toolName: "edit", cwd: CWD, home: HOME, openFile: () => {}, inspect: () => {} };

	// settled edit with applied hunks on block.meta
	built.diffBlockCalls.length = 0;
	let markup = render(DiffRow, {
		...rowProps,
		block: {
			kind: "tool-result",
			callId: "c1",
			call: { name: "edit", argsRaw: EDIT_ARGS },
			meta: { diffs: [{ path: "/home/u/proj/src/app.ts", oldText: "const a = 1;", newText: "const a = 2;" }] },
			content: [{ type: "text", text: "Applied 1 edit." }],
			isError: false
		}
	});
	assert.equal(built.diffBlockCalls.length, 1, "the settled edit must render a diff card");
	assert.equal(built.diffBlockCalls[0].maxLines, Infinity, "the diff must never be truncated by this plugin");
	assert.equal(built.diffBlockCalls[0].labels.copied, "Copied", "DiffBlock must receive a labels prop");
	assert.match(markup, /data-open="true"/, "the diff row must be expanded by default");
	assert.match(markup, /-const a = 1;/);
	assert.match(markup, /\+const a = 2;/);
	assert.match(markup, /\+1 -1/, "0.1.5 chrome shows the +A -R badge");
	assert.equal(render(DiffRow, { ...rowProps, block: { kind: "tool-result", callId: "x", call: { name: "edit", argsRaw: EDIT_ARGS }, meta: { diffs: [] }, content: [], isError: false } }).includes("data-open=\"true\""), false, "an edit that applied nothing shows no diff");

	// running edit: no lifecycle view, diff derived from the call args
	built.diffBlockCalls.length = 0;
	markup = render(DiffRow, { ...rowProps, block: { callId: "c2", name: "edit", argsRaw: EDIT_ARGS } });
	assert.equal(built.diffBlockCalls.length, 1, "a running edit must derive its diff from the args");
	assert.match(markup, /data-open="true"/);

	// running write: whole-file diff
	built.diffBlockCalls.length = 0;
	markup = render(DiffRow, { ...rowProps, toolName: "write", block: { callId: "c3", name: "write", argsRaw: WRITE_ARGS } });
	assert.equal(built.diffBlockCalls.length, 1);
	assert.match(markup, /\+line one/);

	// errored mutation: no diff card, model-facing text surfaces instead
	built.diffBlockCalls.length = 0;
	markup = render(DiffRow, {
		...rowProps,
		block: {
			kind: "tool-result",
			callId: "c4",
			call: { name: "edit", argsRaw: EDIT_ARGS },
			content: [{ type: "text", text: "Edit failed: no match found" }],
			isError: true,
			error: { code: "tool_error" }
		}
	});
	assert.equal(built.diffBlockCalls.length, 0, "an errored mutation must not render a diff card");
	// An errored mutation has no diff, so it stays collapsed (stock behaviour) and
	// surfaces the model-facing error line in the summary.
	assert.match(markup, /data-open="false"/);
	assert.match(markup, /Edit failed: no match found/);
	assert.match(markup, /mtd_visuallyHidden">Failed</, "the row status resolves through the 0.1.5 row.* namespace");
	assert.doesNotMatch(markup, /row\.(running|failed|input|output)/, "no raw locale key may leak into the row");

	// a subagent-nested call owns no card
	built.diffBlockCalls.length = 0;
	render(DiffRow, { ...rowProps, block: { callId: "c5", name: "edit", argsRaw: EDIT_ARGS, parentCallId: "p1" } });
	assert.equal(built.diffBlockCalls.length, 0, "a nested call renders no diff card");

	console.log("  ok  scenario A — 0.1.5-rc.2 surface");
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
	const built = makePrimitives({ strictLabels: false, withDiffTotals: false });
	const exports = factory(
		makeRequire({ primitives: built.primitives, runtime: { abbreviateHomePath: homePath }, failures })
	);

	assert.deepEqual(failures, [], "the legacy runtime module resolves on this surface");
	assert.deepEqual(exports.inject, ["slots"]);

	const registrations = mount(exports, built.primitives);
	const t = tOf(DICT_011);
	const DiffRow = registrations[0].component;
	const rowProps = { t, toolName: "edit", cwd: CWD, home: HOME, openFile: () => {}, inspect: () => {} };
	const hunk = { path: "/home/u/proj/src/app.ts", oldText: "const a = 1;", newText: "const a = 2;" };

	built.diffBlockCalls.length = 0;
	let markup = render(DiffRow, {
		...rowProps,
		block: { kind: "tool-result", callId: "c1", call: { name: "edit", argsRaw: EDIT_ARGS }, resultView: { card: "diff", diffs: [hunk] }, content: [], isError: false }
	});
	assert.equal(built.diffBlockCalls.length, 1, "the host-supplied result view is authoritative");
	assert.equal(built.diffBlockCalls[0].maxLines, Infinity);
	assert.match(markup, /data-open="true"/);
	assert.match(markup, /-const a = 1;/);
	assert.doesNotMatch(markup, /\+1 -1/, "0.1.1 has no diffTotals primitive, so no badge is added");

	// the host view is authoritative even when it is not a diff card
	built.diffBlockCalls.length = 0;
	render(DiffRow, {
		...rowProps,
		block: { kind: "tool-result", callId: "c2", call: { name: "edit", argsRaw: EDIT_ARGS }, resultView: { card: "terminal" }, content: [], isError: false }
	});
	assert.equal(built.diffBlockCalls.length, 0, "a non-diff host view must not be second-guessed");

	// the shipped home-path helper is preferred over the local copy
	homePathCalls.length = 0;
	markup = render(DiffRow, { ...rowProps, block: { callId: "c3", name: "edit", argsRaw: EDIT_ARGS } });
	assert.equal(homePathCalls.length, 1, "abbreviateHomePath from the client runtime is used when present");
	assert.match(markup, />src\/app\.ts</, "the summary is relativized to the session cwd");
	markup = render(DiffRow, { ...rowProps, cwd: undefined, block: { callId: "c4", name: "edit", argsRaw: EDIT_ARGS } });
	assert.match(markup, /~\/proj\/src\/app\.ts/, "an out-of-cwd path is home-abbreviated through the shipped helper");
	assert.doesNotMatch(markup, /row\.(running|failed|stopped)/, "0.1.1 lacks row.* keys, so the bash namespace literal is used");

	console.log("  ok  scenario B — 0.1.1-rc.2 surface");
}

/* -------------------------------------------------------------------------- */
/* scenario C — an unrecognizable primitives table must fail soft              */
/* -------------------------------------------------------------------------- */

async function scenarioFailSoft() {
	const factory = await loadFactory(target);
	const failures = [];
	const built = makePrimitives({ strictLabels: true, withDiffTotals: true });
	const partial = { ...built.primitives };
	delete partial.DiffBlock;
	const exports = factory(makeRequire({ primitives: partial, runtime: "missing", failures }));

	const errors = [];
	const originalError = console.error;
	console.error = (...args) => errors.push(args.join(" "));
	let registrations;
	try {
		registrations = mount(exports, partial);
	} finally {
		console.error = originalError;
	}
	assert.deepEqual(registrations, [], "an incompatible primitives table must leave the shipped rows alone");
	assert.equal(errors.length, 1, "the skip must be reported once");
	assert.match(errors[0], /DiffBlock/, "the diagnostic must name the missing primitive");

	console.log("  ok  scenario C — fails soft on an unknown primitives table");
}

console.log(`dsh-client-ui-mutdiff compatibility suite\n  target: ${target}`);
await scenario015();
await scenario011();
await scenarioFailSoft();
console.log("all scenarios passed");

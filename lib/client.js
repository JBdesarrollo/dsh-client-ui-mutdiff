window.__ModuleLoader__.load({
	id: "@jbdesarrollo/dsh-client-ui-mutdiff",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		// DSH <= 0.1.1-rc.2 served home-path abbreviation from
		// `@deepseek-ai/dsh-client-runtime/client`; 0.1.2+ removed that package, and
		// an unresolvable require here aborts this whole client entry — the browser
		// then boots into "Failed to load plugins". So the require is opportunistic
		// and every use has a local fallback (see homePathDisplay below).
		let _runtime = null;
		try {
			_runtime = require("@deepseek-ai/dsh-client-runtime/client");
		} catch {
			_runtime = null;
		}

		//#region css
		const css = ".mtd_root{flex-direction:column;display:flex}.mtd_row{position:relative;overflow:hidden}.mtd_root[data-state=running] .mtd_row:after{content:\"\";background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);pointer-events:none;width:300px;animation:2.6s ease-out infinite mtd_sweep;position:absolute;top:0;bottom:0;left:0}@keyframes mtd_sweep{0%{left:-300px}90%,to{left:100%}}.mtd_leading{flex-shrink:0}.mtd_title{font-weight:400}.mtd_sep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}.mtd_summary{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-tertiary);flex:auto;font-size:14px;line-height:24px;overflow:hidden}.mtd_summarySuffix{white-space:nowrap;color:var(--dsw-alias-label-tertiary);flex:none;margin-left:4px;font-size:14px;line-height:24px}.mtd_fileLink{text-overflow:ellipsis;white-space:nowrap;min-width:0;font:inherit;text-align:left;color:var(--dsw-alias-label-secondary);text-decoration:underline;text-decoration-color:var(--dsw-alias-label-quaternary);text-underline-offset:3px;cursor:pointer;background:0 0;border:none;flex:auto;margin:0;padding:0;font-size:14px;line-height:24px;overflow:hidden}.mtd_fileLink:hover{color:var(--dsw-alias-label-primary);text-decoration-color:currentColor}.mtd_errorSummary{color:var(--dsw-alias-state-error-primary)}.mtd_bodyWrap{flex-direction:column;display:flex}.mtd_inspectButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;border-radius:999px;align-self:flex-start;align-items:center;gap:4px;margin:4px 0 2px 4px;padding:2px 8px;font-size:11px;line-height:16px;transition:opacity .1s;display:inline-flex}.mtd_root:hover .mtd_inspectButton,.mtd_inspectButton:focus-visible{opacity:1}.mtd_inspectButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.mtd_bodyScroll{max-height:260px;overflow-y:auto}.mtd_ioCard{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-markdown-code-block);font:var(--dsw-font-markdown-code-block-small);border-radius:12px;flex-direction:column;margin:4px 0 4px 4px;display:flex}.mtd_ioSection{grid-template-columns:max-content 1fr;align-items:baseline;column-gap:14px;max-height:150px;padding:12px 16px;display:grid;overflow-y:auto}.mtd_ioSection::-webkit-scrollbar-thumb{background-clip:padding-box;border:2px solid #0000;border-radius:6px}.mtd_ioSection::-webkit-scrollbar-track{margin:6px 0}.mtd_ioLabel{color:var(--dsw-alias-label-caption);align-self:start;position:sticky;top:0}.mtd_ioDivider{background:var(--dsw-alias-border-l2);flex:none;height:1px}.mtd_ioText{white-space:pre-wrap;word-break:break-word;min-width:0;color:var(--dsw-alias-label-secondary)}.mtd_ioText[data-error]{color:var(--dsw-alias-state-error-primary)}.mtd_diffBody{margin:4px 0 4px 4px}.mtd_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}";
		const tagId = "@jbdesarrollo/dsh-client-ui-mutdiff/DiffRow.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@jbdesarrollo/dsh-client-ui-mutdiff";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		const css_styles = {
			"root": "mtd_root",
			"row": "mtd_row",
			"leading": "mtd_leading",
			"title": "mtd_title",
			"chevron": "mtd_chevron",
			"sep": "mtd_sep",
			"summary": "mtd_summary",
			"summarySuffix": "mtd_summarySuffix",
			"fileLink": "mtd_fileLink",
			"errorSummary": "mtd_errorSummary",
			"bodyWrap": "mtd_bodyWrap",
			"inspectButton": "mtd_inspectButton",
			"bodyScroll": "mtd_bodyScroll",
			"ioCard": "mtd_ioCard",
			"ioSection": "mtd_ioSection",
			"ioLabel": "mtd_ioLabel",
			"ioDivider": "mtd_ioDivider",
			"ioText": "mtd_ioText",
			"diffBody": "mtd_diffBody",
			"visuallyHidden": "mtd_visuallyHidden"
		};
		//#endregion

		//#region version-compat helpers
		// DSH moved several client APIs between the release this plugin was first
		// hand-mirrored against (0.1.1-rc.2) and current releases (0.1.5-rc.2+):
		// `@deepseek-ai/dsh-client-runtime` was deleted, the `connection` service was
		// renamed to `remote`, `DiffBlock` began requiring a `labels` prop, and the
		// diff card moved off `callView`/`resultView` onto the call args plus
		// `block.meta`. Everything below is self-contained so the bundle keeps
		// working when one of those moves again.
		function isWindowsStylePath(value) {
			return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
		}
		/** POSIX home abbreviation; byte-for-byte the shipped helper in both versions. */
		function abbreviateHomePathLocal(path, home) {
			if (home === void 0 || home === "") return path;
			if (isWindowsStylePath(path) || isWindowsStylePath(home)) return path;
			const root = home.replace(/\/+$/, "");
			if (root === "" || root === "/") return path;
			if (path.replace(/\/+$/, "") === root) return "~";
			if (path.startsWith(`${root}/`)) return `~${path.slice(root.length)}`;
			return path;
		}
		/**
		* Home-path display: use the host's own helper when this DSH version still
		* ships one, else the equivalent local implementation.
		*/
		function homePathDisplay(path, home) {
			const shipped = _runtime === null ? void 0 : _runtime.abbreviateHomePath;
			return typeof shipped === "function" ? shipped(path, home) : abbreviateHomePathLocal(path, home);
		}
		/**
		* Translate with a fallback for missing keys. The locale seat resolves an
		* unknown key to the key itself (never throws), and locale namespaces were
		* renamed across versions (`bash.running` -> `row.running`, `IN` ->
		* `row.input`), so a miss falls through to the caller's literal rather than
		* leaking a raw key into the UI.
		*/
		function tr(t, key, params, fallback) {
			if (typeof t !== "function") return fallback;
			let value;
			try {
				value = params === void 0 ? t(key) : t(key, params);
			} catch {
				return fallback;
			}
			return typeof value === "string" && value !== "" && value !== key ? value : fallback;
		}
		function tt(t, key, fallback) {
			return tr(t, key, void 0, fallback);
		}
		/**
		* Diff-card chrome labels. 0.1.5-rc.2 made `DiffBlock` require a `labels` prop
		* and dereferences it unconditionally (`labels.copied`, `labels.files(...)`),
		* so omitting it throws on every mutation row. 0.1.1-rc.2 destructures only
		* `diffs`/`maxLines`/`className` and ignores the rest, which makes passing it
		* unconditionally safe on both.
		*/
		function diffBlockLabels(t) {
			return {
				copy: tt(t, "copy", "Copy"),
				copied: tt(t, "copied", "Copied"),
				collapseAria: tt(t, "diff.collapseAria", "Collapse diff"),
				expandAria: (count) => tr(t, "diff.expandAria", { count }, `Expand diff (${String(count)} more lines)`),
				collapse: tt(t, "collapse", "Collapse"),
				expand: (count) => tr(t, "diff.expandRest", { count }, `… ${String(count)} more lines`),
				files: (count) => tr(t, count === 1 ? "diff.files.one" : "diff.files.other", { count }, `${String(count)} file${count === 1 ? "" : "s"}`)
			};
		}
		/**
		* Primitives this plugin renders through. A future rename must degrade to the
		* shipped edit/write rows and say so, instead of failing the client entry.
		*/
		const REQUIRED_PRIMITIVES = [
			"DisclosureRow",
			"DiffBlock",
			"StateDot",
			"IconEditOutline16",
			"IconInspectOutline12"
		];
		function missingPrimitives() {
			return REQUIRED_PRIMITIVES.filter((name) => _primitives[name] === void 0);
		}
		//#endregion

		//#region model derivation (mirrors dsh-client-ui-tool)
		function firstLine(text) {
			const nl = text.indexOf("\n");
			return nl === -1 ? text : text.slice(0, nl);
		}
		function pickString(args, keys) {
			for (const key of keys) {
				const v = args[key];
				if (typeof v === "string" && v !== "") return v;
			}
		}
		const VARIANT_TITLES = { search: "Search", read: "Read", bash: "Bash", write: "Write", edit: "Edit", code: "Code", others: "Tool call" };
		const TOOL_VARIANTS = { bash: "bash", pwsh: "bash", read: "read", read_image: "read", web_fetch: "read", web_search: "search", grep: "search", glob: "search", write: "write", edit: "edit", run_code: "code", cordis_package_inspect: "read", cordis_runtime_inspect: "read", cordis_run: "others", cordis_stop: "others", cordis_undefine: "others" };
		const TOOL_TITLES = { cordis_package_inspect: "Inspect", cordis_runtime_inspect: "Inspect", cordis_run: "Run Cordis Plugin", cordis_stop: "Stop Cordis Plugin", cordis_undefine: "Remove Cordis Plugin", pwsh: "Pwsh", read_image: "Read Image" };
		// 0.1.2+ localizes row titles through these keys; 0.1.1 has no such keys, so
		// `tt` falls back to the literals above and the row still reads correctly.
		const VARIANT_TITLE_KEYS = { search: "tool.title.search", read: "tool.title.read", bash: "tool.title.bash", write: "tool.title.write", edit: "tool.title.edit", code: "tool.title.code", others: "tool.title.generic" };
		const TOOL_TITLE_KEYS = { cordis_package_inspect: "tool.title.inspect", cordis_runtime_inspect: "tool.title.inspect", cordis_run: "tool.title.runCordis", cordis_stop: "tool.title.stopCordis", cordis_undefine: "tool.title.removeCordis", pwsh: "tool.title.pwsh", read_image: "tool.title.readImage" };
		function classifyTool(toolName) { return TOOL_VARIANTS[toolName] ?? "others"; }
		function resultText(node) {
			const parts = [];
			for (const block of node.content) if (block.type === "text") parts.push(block.text);
			else parts.push(JSON.stringify(block, null, 2));
			if (parts.length === 0 && node.error !== void 0) parts.push(`${node.error.name}: ${node.error.code}`);
			return parts.join("\n");
		}
		function parseArgs(argsRaw) { try { return JSON.parse(argsRaw); } catch { return; } }
		const SUMMARY_KEYS = { bash: ["description", "command"], read: ["path", "file_path", "url"], search: ["query", "pattern", "url"], write: ["path", "file_path"], edit: ["path", "file_path"], code: ["description"], others: [] };
		function relativizeToCwd(text, cwd) {
			if (cwd === void 0 || cwd === "") return text;
			const root = cwd.replace(/[/\\]+$/, "");
			if (text.startsWith(`${root}/`) || text.startsWith(`${root}\\`)) return text.slice(root.length + 1);
			return text;
		}
		function deriveSummary(variant, argsRaw) {
			const parsed = parseArgs(argsRaw);
			if (typeof parsed !== "object" || parsed === null) return firstLine(argsRaw);
			const args = parsed;
			if (variant === "search" && Array.isArray(args.queries)) {
				const queries = args.queries.filter((q) => typeof q === "string" && q !== "");
				if (queries.length > 0) return queries.map(firstLine).join(", ");
			}
			const picked = pickString(args, SUMMARY_KEYS[variant]);
			if (picked !== void 0) return firstLine(picked);
			for (const v of Object.values(args)) if (typeof v === "string" && v !== "") return firstLine(v);
			return firstLine(argsRaw);
		}
		const FILE_PATH_KEYS = ["path", "file_path"];
		const FILE_PATH_VARIANTS = new Set(["read", "write", "edit"]);
		function deriveFilePath(variant, argsRaw) {
			if (!FILE_PATH_VARIANTS.has(variant)) return void 0;
			const parsed = parseArgs(argsRaw);
			if (typeof parsed !== "object" || parsed === null) return void 0;
			const picked = pickString(parsed, FILE_PATH_KEYS);
			return picked === void 0 ? void 0 : firstLine(picked);
		}
		function deriveBody(variant, argsRaw) {
			if (argsRaw === "") return null;
			const parsed = parseArgs(argsRaw);
			if (parsed === void 0) return argsRaw;
			if (variant === "code" && typeof parsed === "object" && parsed !== null) {
				const code = parsed.code;
				if (typeof code === "string" && code !== "") return code;
			}
			return JSON.stringify(parsed, null, 2);
		}
		function toolRowModel(toolName, block, cwd, home) {
			const variant = classifyTool(toolName);
			const done = "kind" in block;
			const argsRaw = (done ? block.call?.argsRaw : block.argsRaw) ?? "";
			const state = !done ? "running" : block.error?.code === "interrupted" ? "stopped" : block.isError ? "error" : "ok";
			const base = argsRaw === "" ? block.callId : homePathDisplay(relativizeToCwd(deriveSummary(variant, argsRaw), cwd), home);
			const toolTitle = TOOL_TITLES[toolName];
			const summary = variant === "others" && toolName !== "" && toolTitle === void 0 ? `${toolName} · ${base}` : base;
			const output = done ? resultText(block) || null : null;
			const errorSummary = state === "error" && output !== null ? firstLine(output) : null;
			return { variant, title: toolTitle ?? VARIANT_TITLES[variant], titleKey: TOOL_TITLE_KEYS[toolName] ?? VARIANT_TITLE_KEYS[variant], summary, filePath: deriveFilePath(variant, argsRaw), body: deriveBody(variant, argsRaw), output, errorSummary, state };
		}
		function narrowDiffs(diffs) {
			if (!Array.isArray(diffs) || diffs.length === 0) return null;
			const out = [];
			for (const hunk of diffs) {
				if (typeof hunk !== "object" || hunk === null) return null;
				const { path, oldText, newText } = hunk;
				if (typeof path !== "string") return null;
				if (oldText !== null && typeof oldText !== "string") return null;
				if (typeof newText !== "string") return null;
				out.push({ path, oldText, newText });
			}
			return out;
		}
		/** Parse a call's argument JSON, mirroring the shipped accessor for both block forms. */
		function parsedToolCall(block) {
			const call = "kind" in block ? block.call : block;
			if (call === null || call === void 0) return null;
			const args = parseArgs(call.argsRaw);
			if (typeof args !== "object" || args === null || Array.isArray(args)) return null;
			return { name: call.name, args };
		}
		/**
		* Sandbox-escalation arguments disqualify the argument-derived diff, exactly as
		* the shipped model does: a call that asked for wider access is not presented
		* as a plain file mutation.
		*/
		function validEscalationFields(args) {
			const permission = args.sandbox_permissions;
			const justification = args.justification;
			if (permission === void 0 && justification === void 0) return true;
			if (permission !== "workspace-write" && permission !== "danger-full-access") return false;
			return typeof justification === "string" && justification.trim() !== "";
		}
		/**
		* The whole-file diff a running edit/write call intends, derived from its args.
		* 0.1.2+ needs this because the host no longer precomputes a call view.
		* @returns the intended tool/diff pair, or null when the call is not a mutation.
		*/
		function intendedDiff(block) {
			const parsed = parsedToolCall(block);
			if (parsed === null) return null;
			const { file_path: path } = parsed.args;
			if (typeof path !== "string" || path.trim() === "") return null;
			if (!validEscalationFields(parsed.args)) return null;
			if (parsed.name === "write") {
				const content = parsed.args.content;
				return typeof content === "string" ? { tool: "write", diff: { path, oldText: null, newText: content } } : null;
			}
			if (parsed.name !== "edit") return null;
			const oldText = parsed.args.old_string;
			const newText = parsed.args.new_string;
			if (typeof oldText !== "string" || typeof newText !== "string") return null;
			return { tool: "edit", diff: { path, oldText: oldText || null, newText } };
		}
		/**
		* Diff-card props for a mutation block, tolerant of both host shapes:
		* - <= 0.1.1-rc.2 attaches a ready-made card to the lifecycle view, which is
		*   authoritative (including when it is absent, e.g. an errored mutation).
		* - 0.1.2+ dropped those views: a running call derives its diff from the args,
		*   and a settled call prefers the applied hunks on `block.meta`, falling back
		*   to the argument-derived whole-file diff for a successful `write`.
		* @param block - running or settled Tool block.
		* @returns the diff-card props, or null when this block shows no diff.
		*/
		function diffCardModel(block) {
			const done = "kind" in block;
			if (done ? "resultView" in block : "callView" in block) {
				const view = done ? block.resultView : block.callView;
				const diffs = view !== null && view !== void 0 && view.card === "diff" ? narrowDiffs(view.diffs) : null;
				return diffs === null ? null : { card: { diffs } };
			}
			if (block.parentCallId !== void 0) return null;
			const intended = intendedDiff(block);
			if (intended === null) return null;
			if (!done) return { card: { diffs: [intended.diff] } };
			if (block.isError) return null;
			const applied = narrowDiffs(block.meta?.diffs);
			if (applied === null) return intended.tool === "write" ? { card: { diffs: [intended.diff] } } : null;
			return { card: { diffs: applied } };
		}
		//#endregion

		//#region row chrome (mirrors dsh-client-ui-tool ToolRow)
		function leadingFor(state, icon) {
			switch (state) {
				case "error": return react_jsx_runtime.jsx(_primitives.StateDot, { state: "error" });
				case "stopped": return react_jsx_runtime.jsx(_primitives.StateDot, { state: "warning" });
				default: return icon;
			}
		}
		function stateStatus(state, t) {
			const key = state === "running" ? "running" : state === "error" ? "failed" : state === "stopped" ? "stopped" : null;
			if (key === null) return null;
			// 0.1.2+ moved these from the bash namespace to the shared row namespace.
			const literal = key === "running" ? "Running" : key === "failed" ? "Failed" : "Stopped";
			return tt(t, `row.${key}`, tt(t, `bash.${key}`, literal));
		}
		function DiffRow({ t, toolName, block, cwd, home, openFile, inspect }) {
			const model = toolRowModel(toolName, block, cwd, home);
			const diff = diffCardModel(block);
			// Default-open for diff cards: the whole point of this plugin.
			const [expanded, setExpanded] = react.useState(diff !== null);
			const diffBody = diff ?? null;
			const title = tt(t, model.titleKey, model.title);
			const outputText = model.output ?? null;
			const expandable = model.body !== null || outputText !== null || diffBody !== null;
			const open = expanded && expandable;
			const status = stateStatus(model.state, t);
			const failureLine = model.state === "error" ? model.errorSummary ?? null : null;
			const summaryText = failureLine ?? model.summary;
			// The `+A -R` badge is 0.1.2+ chrome (`diffTotals` is new there), so it is
			// opt-in and simply absent on 0.1.1.
			const suffix = failureLine !== null || diffBody === null || typeof _primitives.diffTotals !== "function" ? null : (() => {
				const totals = _primitives.diffTotals(diffBody.card.diffs);
				return `+${String(totals.added)} -${String(totals.removed)}`;
			})();
			const fileLink = model.filePath !== void 0 && openFile !== void 0 && failureLine === null;
			const toggleExpand = () => setExpanded((v) => !v);
			const onOpenFile = (event) => { event.stopPropagation(); if (model.filePath !== void 0) openFile?.(model.filePath); };
			const fileLinkKeyDown = (event) => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); };
			const cardBody = model.variant === "code" ? null : model.body;
			return react_jsx_runtime.jsxs("div", {
				className: css_styles.root,
				"data-variant": model.variant,
				"data-tool": toolName,
				"data-state": model.state,
				children: [
					status !== null && react_jsx_runtime.jsx("span", { className: css_styles.visuallyHidden, children: status }),
					react_jsx_runtime.jsx(_primitives.DisclosureRow, {
						rowClassName: css_styles.row,
						leadingClassName: css_styles.leading,
						titleClassName: css_styles.title,
						chevronClassName: css_styles.chevron,
						icon: leadingFor(model.state, react_jsx_runtime.jsx(_primitives.IconEditOutline16, { size: 14 })),
						title,
						open,
						expandable,
						expandOnRowClick: true,
						keepContentWhenOpen: true,
						onToggle: toggleExpand,
						collapsedContent: summaryText !== "" && react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, {
							children: [
								react_jsx_runtime.jsx("span", { className: css_styles.sep, "aria-hidden": true }),
								fileLink ? react_jsx_runtime.jsx("button", {
									type: "button",
									className: css_styles.fileLink,
									onClick: onOpenFile,
									onKeyDown: fileLinkKeyDown,
									children: summaryText
								}) : react_jsx_runtime.jsx("span", {
									className: css_styles.summary + (failureLine !== null ? " " + css_styles.errorSummary : ""),
									children: summaryText
								}),
								suffix !== null && react_jsx_runtime.jsx("span", { className: css_styles.summarySuffix, children: suffix })
							]
						}),
						children: react_jsx_runtime.jsxs("div", {
							className: css_styles.bodyWrap,
							children: [
								diffBody !== null ? react_jsx_runtime.jsx(_primitives.DiffBlock, {
									...diffBody.card,
									labels: diffBlockLabels(t),
									maxLines: Infinity,
									className: css_styles.diffBody
								}) : react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, {
									children: [
										(cardBody !== null || outputText !== null) && react_jsx_runtime.jsxs("div", {
											className: css_styles.ioCard,
											children: [
												cardBody !== null && react_jsx_runtime.jsxs("div", {
													className: css_styles.ioSection,
													children: [
														react_jsx_runtime.jsx("span", { className: css_styles.ioLabel, children: tt(t, "row.input", "IN") }),
														react_jsx_runtime.jsx("span", { className: css_styles.ioText, children: cardBody })
													]
												}),
												cardBody !== null && outputText !== null && react_jsx_runtime.jsx("span", { className: css_styles.ioDivider, "aria-hidden": true }),
												outputText !== null && react_jsx_runtime.jsxs("div", {
													className: css_styles.ioSection,
													children: [
														react_jsx_runtime.jsx("span", { className: css_styles.ioLabel, children: tt(t, "row.output", "OUT") }),
														react_jsx_runtime.jsx("span", { className: css_styles.ioText, "data-error": model.state === "error" || void 0, children: outputText })
													]
												})
											]
										})
									]
								}),
								inspect !== void 0 && react_jsx_runtime.jsxs("button", {
									type: "button",
									className: css_styles.inspectButton,
									onClick: inspect,
									children: [react_jsx_runtime.jsx(_primitives.IconInspectOutline12, {}), "Inspect"]
								})
							]
						})
					})
				]
			});
		}
		//#endregion

		//#region plugin
		const CONVERSATION_NS = "conversation";
		const mutDiffToolview = {
			name: "mut-diff-toolview",
			inject: ["slots"],
			apply(ctx) {
				ctx.slots.inject("tool.call.toolview", function* () {
					yield ctx.slots.register({
						name: "tool.call.toolview",
						key: "edit",
						locale: CONVERSATION_NS,
						priority: -1
					}, DiffRow);
					yield ctx.slots.register({
						name: "tool.call.toolview",
						key: "write",
						locale: CONVERSATION_NS,
						priority: -1
					}, DiffRow);
				});
			}
		};
		//#endregion

		//#region apply + inject
		// Only `slots` is used. This entry must NOT declare `connection`: 0.1.2+
		// renamed that service to `remote`, and a declared-but-absent service parks
		// the entry as `pending` forever, which fails the whole client boot
		// ("N entries did not activate").
		const inject = ["slots"];
		function apply(ctx) {
			const missing = missingPrimitives();
			if (missing.length > 0) {
				// Fail soft: a renamed or removed primitive must leave the stock
				// edit/write rows in place instead of taking the client boot down.
				console.error(`[dsh-client-ui-mutdiff] inapplicable on this DSH build — @deepseek-ai/dsh-client-ui-primitives is missing ${missing.join(", ")}. Leaving the stock edit/write rows in place. This plugin targets the primitives shipped by dsh 0.1.1-rc.2 and 0.1.5-rc.2.`);
				return;
			}
			try {
				ctx.plugin(mutDiffToolview);
			} catch (error) {
				console.error("[dsh-client-ui-mutdiff] could not take over the edit/write rows; keeping the stock rows:", error);
			}
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

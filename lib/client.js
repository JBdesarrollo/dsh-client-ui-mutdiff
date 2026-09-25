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
		const css = ".mtd_root{flex-direction:column;display:flex}.mtd_row{position:relative;overflow:hidden}.mtd_root[data-state=running] .mtd_row:after{content:\"\";background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);pointer-events:none;width:300px;animation:2.6s ease-out infinite mtd_sweep;position:absolute;top:0;bottom:0;left:0}@keyframes mtd_sweep{0%{left:-300px}90%,to{left:100%}}.mtd_leading{flex-shrink:0}.mtd_title{font-weight:400}.mtd_sep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}.mtd_summary{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-tertiary);flex:auto;font-size:14px;line-height:24px;overflow:hidden}.mtd_summarySuffix{white-space:nowrap;color:var(--dsw-alias-label-tertiary);flex:none;margin-left:4px;font-size:14px;line-height:24px}.mtd_fileLink{text-overflow:ellipsis;white-space:nowrap;min-width:0;font:inherit;text-align:left;color:var(--dsw-alias-label-secondary);text-decoration:underline;text-decoration-color:var(--dsw-alias-label-quaternary);text-underline-offset:3px;cursor:pointer;background:0 0;border:none;flex:auto;margin:0;padding:0;font-size:14px;line-height:24px;overflow:hidden}.mtd_fileLink:hover{color:var(--dsw-alias-label-primary);text-decoration-color:currentColor}.mtd_errorSummary{color:var(--dsw-alias-state-error-primary)}.mtd_bodyWrap{flex-direction:column;display:flex}.mtd_inspectButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;border-radius:999px;align-self:flex-start;align-items:center;gap:4px;margin:4px 0 2px 4px;padding:2px 8px;font-size:11px;line-height:16px;transition:opacity .1s;display:inline-flex}.mtd_root:hover .mtd_inspectButton,.mtd_inspectButton:focus-visible{opacity:1}.mtd_inspectButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.mtd_bodyScroll{max-height:260px;overflow-y:auto}.mtd_ioCard{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-markdown-code-block);font:var(--dsw-font-markdown-code-block-small);border-radius:12px;flex-direction:column;margin:4px 0 4px 4px;display:flex}.mtd_ioSection{grid-template-columns:max-content 1fr;align-items:baseline;column-gap:14px;max-height:150px;padding:12px 16px;display:grid;overflow-y:auto}.mtd_ioSection::-webkit-scrollbar-thumb{background-clip:padding-box;border:2px solid #0000;border-radius:6px}.mtd_ioSection::-webkit-scrollbar-track{margin:6px 0}.mtd_ioLabel{color:var(--dsw-alias-label-caption);align-self:start;position:sticky;top:0}.mtd_ioDivider{background:var(--dsw-alias-border-l2);flex:none;height:1px}.mtd_ioText{white-space:pre-wrap;word-break:break-word;min-width:0;color:var(--dsw-alias-label-secondary)}.mtd_ioText[data-error]{color:var(--dsw-alias-state-error-primary)}.mtd_diffBody{margin:4px 0 4px 4px}.mtd_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}.mtd_diffCard{background:var(--dsw-alias-markdown-code-block);color:var(--dsw-alias-label-primary);border-radius:12px;flex-direction:column;margin:4px 0 4px 4px;padding:6px 0;display:flex;position:relative}.mtd_hunk{flex-direction:column;display:flex}.mtd_hunkPath{color:var(--dsw-alias-label-primary);font-weight:600;font-size:12px;line-height:18px;padding:2px 12px}.mtd_hunkGap{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:2px 12px}.mtd_hlCode.mtd_hlDel{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent);border-left:2px solid var(--dsw-alias-state-error-primary)}.mtd_hlCode.mtd_hlAdd{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, transparent);border-left:2px solid var(--dsw-alias-state-success-primary)}.mtd_hlCode.mtd_hlSide{background-clip:padding-box;border-radius:0;margin:0!important}.mtd_hlCode> :first-child{display:none}.mtd_hlCode pre{background:transparent!important;border-radius:0;margin:0!important;padding:1px 12px;white-space:pre;word-break:normal;overflow-x:auto}.mtd_hlCode pre code{font:inherit;background:none;padding:0}.mtd_hlDel span.line:before{content:'- ';color:var(--dsw-alias-state-error-primary)}.mtd_hlAdd span.line:before{content:'+ ';color:var(--dsw-alias-state-success-primary)}.mtd_copyButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;border-radius:999px;position:absolute;top:4px;right:6px;align-items:center;gap:4px;padding:2px 8px;font-size:11px;line-height:16px;transition:opacity .1s;display:inline-flex}.mtd_diffCard:hover .mtd_copyButton,.mtd_copyButton:focus-visible{opacity:1}.mtd_copyButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.mtd_bodyActions{position:relative;align-self:flex-start;align-items:center;gap:6px;margin:4px 0 2px 4px;display:flex;opacity:0;transition:opacity .1s}.mtd_root:hover .mtd_bodyActions,.mtd_bodyActions:focus-within,.mtd_bodyActions[data-open=true]{opacity:1}.mtd_bodyActions .mtd_inspectButton{margin:0;opacity:1}.mtd_editorButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:999px;align-items:center;gap:4px;padding:2px 8px;font-size:11px;line-height:16px;display:inline-flex}.mtd_editorButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.mtd_editorButton:disabled{cursor:default;opacity:.6}.mtd_editorCaret{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:999px;padding:2px 6px;font:inherit;font-size:11px;line-height:16px}.mtd_editorCaret:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.mtd_editorMenu{position:absolute;bottom:calc(100% + 6px);left:0;z-index:20;min-width:230px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);border-radius:10px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.18);flex-direction:column;display:flex}.mtd_editorMenuTitle{color:var(--dsw-alias-label-caption);padding:4px 8px;font-size:11px;line-height:16px}.mtd_editorMenuItem{border:none;background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;text-align:left;border-radius:6px;padding:4px 8px;font:inherit;font-size:12px;line-height:18px}.mtd_editorMenuItem:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.mtd_editorMenuItem[data-active=true]{color:var(--dsw-alias-label-primary);font-weight:600}.mtd_editorMenuToggle{color:var(--dsw-alias-label-secondary);cursor:pointer;align-items:center;gap:6px;padding:4px 8px;font-size:12px;line-height:18px;display:flex}.mtd_editorMenuToggle[data-pinned=true]{cursor:default;color:var(--dsw-alias-label-tertiary)}.mtd_editorMenuNote{color:var(--dsw-alias-label-caption);padding:2px 8px 4px;font-size:11px;line-height:15px}.mtd_editorError{color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px}";
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
			"diffCard": "mtd_diffCard",
			"hunk": "mtd_hunk",
			"hunkPath": "mtd_hunkPath",
			"hunkGap": "mtd_hunkGap",
			"hlCode": "mtd_hlCode",
			"hlSide": "mtd_hlSide",
			"hlDel": "mtd_hlDel",
			"hlAdd": "mtd_hlAdd",
			"copyButton": "mtd_copyButton",
			"bodyActions": "mtd_bodyActions",
			"editorButton": "mtd_editorButton",
			"editorCaret": "mtd_editorCaret",
			"editorMenu": "mtd_editorMenu",
			"editorMenuTitle": "mtd_editorMenuTitle",
			"editorMenuItem": "mtd_editorMenuItem",
			"editorMenuToggle": "mtd_editorMenuToggle",
			"editorMenuNote": "mtd_editorMenuNote",
			"editorError": "mtd_editorError",
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
		* Either diff renderer suffices: the syntax-highlighted one needs `CodeBlock`,
		* the plain fallback needs `DiffBlock`.
		*/
		const REQUIRED_PRIMITIVES = [
			"DisclosureRow",
			"StateDot",
			"IconEditOutline16",
			"IconInspectOutline12"
		];
		function missingPrimitives() {
			const missing = REQUIRED_PRIMITIVES.filter((name) => _primitives[name] === void 0);
			if (typeof _primitives.CodeBlock !== "function" && typeof _primitives.DiffBlock !== "function") missing.push("CodeBlock|DiffBlock");
			return missing;
		}
		/** True when the shell exposes a tokenizing code block (0.1.1-rc.2 and 0.1.5-rc.2 both do). */
		function canHighlight() {
			return typeof _primitives.CodeBlock === "function";
		}
		/** Split a code fragment into display lines, mirroring the shipped helper. */
		function codeLines(text) {
			return text === "" ? [] : (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
		}
		/**
		* File extension as the shiki language alias the shell already resolves
		* (`ts`, `py`, `rs`, …). Unknown or absent extensions return undefined, and
		* the shell's own code block then renders the text unhighlighted.
		*/
		function langFromPath(path) {
			const name = path.slice(path.lastIndexOf("/") + 1);
			const dot = name.lastIndexOf(".");
			return dot <= 0 || dot === name.length - 1 ? void 0 : name.slice(dot + 1).toLowerCase();
		}
		/**
		* Group narrow hunks into per-file runs, mirroring the shipped diff-card
		* builder: a path header for a file's first hunk and a gap mark afterwards,
		* then the old side (removed) and the new side (added).
		*
		* Each side is verbatim text, so one highlighted code block per side is exact
		* — the tokenizer sees whole code rather than lines severed from their context.
		* This is also why the card needs no line-diff algorithm: the shipped card is
		* not a minimal diff either, it prints every old line and then every new one.
		* @param diffs - narrowed hunks ({path, oldText, newText}).
		* @returns the runs plus the added/removed line counts the badge shows.
		*/
		function diffRuns(diffs) {
			const runs = [];
			let added = 0;
			let removed = 0;
			let previous;
			for (const hunk of diffs) {
				const del = hunk.oldText === null ? [] : codeLines(hunk.oldText);
				const add = codeLines(hunk.newText);
				added += add.length;
				removed += del.length;
				runs.push({
					path: hunk.path,
					first: hunk.path !== previous,
					del: del.length === 0 ? null : hunk.oldText,
					add: add.length === 0 ? null : hunk.newText,
					lang: langFromPath(hunk.path)
				});
				previous = hunk.path;
			}
			return { runs, added, removed };
		}
		/** Unified text a copy action yields, in the shipped `- `/`+ ` shape. */
		function diffClipboardText(diffs) {
			const parts = [];
			for (const hunk of diffs) {
				parts.push(hunk.path);
				for (const line of codeLines(hunk.oldText ?? "")) parts.push(`- ${line}`);
				for (const line of codeLines(hunk.newText)) parts.push(`+ ${line}`);
			}
			return parts.join("\n");
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

		//#region editor bridge (browser side of the host route in lib/index.js)
		/**
		* "Open in editor" bridge.
		*
		* The host half registers one loopback-fenced route that spawns the chosen
		* editor's CLI; this region is the entire browser side of it: read the host's
		* editor roster once, remember the reader's own choice, and post one small
		* payload per open — a path plus the first line the mutation added.
		*
		* The host may also answer `follow: true`, which means it is opening every
		* edit itself from the session's event feed. This region then keeps the
		* automatic mode off whatever the reader stored, so one change never opens
		* two windows; the picker states that instead of offering a dead switch.
		*
		* Nothing here is load-bearing for the plugin's original job. When the route
		* is absent (a profile without a web server, an older host half, a future
		* rename) the state read fails once, a diagnostic is logged, the action is not
		* rendered, and DSH's own file link keeps opening with the system default
		* application. That is the same fail-soft contract the diff row follows when
		* the shipped primitives move.
		*
		* The request deliberately uses plain `fetch` against the plugin's own route
		* rather than a Cordis client service: 0.1.2+ renamed the client `connection`
		* service to `remote`, and a declared-but-absent service parks this entry as
		* `pending` forever, which fails the whole client boot. A `fetch` needs no
		* service, so the entry keeps its single dependency.
		*/
		const BRIDGE_PREFIX = "/mutdiff";
		const EDITOR_STORAGE_KEY = "dsh-client-ui-mutdiff:editor";
		const AUTO_OPEN_STORAGE_KEY = "dsh-client-ui-mutdiff:auto-open";
		/** Longest added-line hint sent to the host; mirrors its own cap. */
		const HINT_MAX_LENGTH = 240;
		/** How many already-opened calls are remembered, so auto-open fires once per call. */
		const AUTO_OPEN_MEMORY = 200;
		/** Reasons the host may answer with, as the words a reader sees. */
		const EDITOR_ERROR_TEXT = {
			"no-editor": "No editor command was found on the host PATH",
			"not-found": "That file no longer exists",
			"not-a-file": "That path is not a file",
			"outside-workspace": "That path is outside the session workspace",
			"spawn-failed": "The editor could not be launched",
			untrusted: "The host trust fence refused the request",
			"bad-request": "The host rejected the request",
			"http-404": "The host has no editor route"
		};

		/** One persisted preference, read without ever throwing (private mode, hardened profiles). */
		function readStoredFlag(key) {
			try {
				if (typeof window === "undefined" || window.localStorage === void 0) return void 0;
				const value = window.localStorage.getItem(key);
				return typeof value === "string" ? value : void 0;
			} catch {
				return void 0;
			}
		}
		function writeStoredFlag(key, value) {
			try {
				if (typeof window === "undefined" || window.localStorage === void 0) return;
				if (value === void 0) window.localStorage.removeItem(key);
				else window.localStorage.setItem(key, value);
			} catch {
				// A refused write costs the preference its persistence, never the action.
			}
		}

		/** The reader's explicit editor choice, or undefined while the host's own default stands. */
		let editorChoice = readStoredFlag(EDITOR_STORAGE_KEY);
		/** The reader's explicit auto-open choice (`1`/`0`), or undefined while the host config stands. */
		let autoOpenChoice = readStoredFlag(AUTO_OPEN_STORAGE_KEY);

		let bridgeSnapshot = Object.freeze({
			/** `unknown` until the host answers, then `ready` or `unavailable`. */
			status: "unknown",
			/** Detected editors as `{id, label}`, in the host's preference order. */
			editors: [],
			/** The editor a click would use. */
			editor: null,
			/** Whether every successful mutation opens without a click. */
			autoOpen: false,
			/** Whether the *host* is following edits live (it opens them itself, without this page). */
			follow: false,
			/** The environment variable pinning auto-open for this run, or null. */
			autoOpenPinnedBy: null,
			/** A request is in flight. */
			pending: false,
			/** The last failure reason, or null. */
			error: null
		});
		const bridgeListeners = new Set();
		function publishBridge(patch) {
			bridgeSnapshot = Object.freeze({ ...bridgeSnapshot, ...patch });
			for (const listener of [...bridgeListeners]) {
				try {
					listener();
				} catch {
					// One broken subscriber must not stop the others.
				}
			}
		}
		function subscribeBridge(listener) {
			bridgeListeners.add(listener);
			return () => {
				bridgeListeners.delete(listener);
			};
		}
		function bridgeState() {
			return bridgeSnapshot;
		}
		/**
		* Subscribe a component to the bridge store.
		*
		* Deliberately `useState` + `useEffect` rather than `useSyncExternalStore`:
		* the latter needs React 18, and this bundle is loaded into whatever React
		* the shell seeds. The reducer is a no-op when the snapshot reference is
		* unchanged, so a publish that does not concern this row costs no render.
		*/
		function useBridgeState() {
			const [state, setState] = react.useState(() => bridgeState());
			react.useEffect(() => {
				setState(bridgeState());
				return subscribeBridge(() => { setState(bridgeState()); });
			}, []);
			return state;
		}
		/** Read the host's roster once per page load; a failure is a diagnostic, never an error surface. */
		let bridgePrimed = false;
		function primeBridge() {
			if (bridgePrimed) return;
			bridgePrimed = true;
			if (typeof fetch !== "function") {
				publishBridge({ status: "unavailable" });
				return;
			}
			fetch(`${BRIDGE_PREFIX}/state`, { headers: { accept: "application/json" } }).then((response) => {
				if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
				return response.json();
			}).then((body) => {
				if (body === null || typeof body !== "object" || body.ok !== true) throw new Error("the route refused the request");
				const editors = (Array.isArray(body.editors) ? body.editors : []).filter((entry) => entry !== null && typeof entry === "object" && typeof entry.id === "string").map((entry) => ({
					id: entry.id,
					label: typeof entry.label === "string" && entry.label !== "" ? entry.label : entry.id
				}));
				const chosen = editorChoice !== void 0 && editors.some((entry) => entry.id === editorChoice) ? editorChoice : typeof body.effective === "string" ? body.effective : editors.length > 0 ? editors[0].id : null;
				// A variable named on the invocation is the deliberate act for this run, so
				// it outranks a browser preference stored months ago; otherwise the stored
				// choice (an equally deliberate click) outranks the host's default.
				const pinnedBy = typeof body.autoOpenPinnedBy === "string" && body.autoOpenPinnedBy !== "" ? body.autoOpenPinnedBy : null;
				// Live follow is the host opening every edit itself, from the session's own
				// event feed — it needs neither this page nor a click. The automatic mode is
				// therefore off here regardless of any stored choice, so one change cannot
				// open two windows, and the picker says why instead of showing a switch that
				// would do nothing.
				const follow = body.follow === true;
				publishBridge({
					status: "ready",
					editors,
					editor: chosen,
					follow,
					autoOpenPinnedBy: pinnedBy,
					autoOpen: follow ? false : pinnedBy !== null ? body.autoOpen === true : autoOpenChoice === void 0 ? body.autoOpen === true : autoOpenChoice === "1"
				});
			}).catch((error) => {
				publishBridge({ status: "unavailable" });
				console.warn("[dsh-client-ui-mutdiff] the open-in-editor bridge is unavailable on this host:", error === null || error === void 0 ? void 0 : error.message, "— the file link still opens with the system default application.");
			});
		}
		/** Post one open request; resolves true when the host launched an editor. */
		async function requestOpen(path, hint, editor) {
			if (typeof fetch !== "function") return false;
			publishBridge({ pending: true, error: null });
			const body = { path, hint };
			const chosen = editor ?? bridgeSnapshot.editor;
			if (chosen !== null && chosen !== void 0) body.editor = chosen;
			try {
				const response = await fetch(`${BRIDGE_PREFIX}/open`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body)
				});
				let payload = null;
				try {
					payload = await response.json();
				} catch {
					payload = null;
				}
				if (payload !== null && payload.ok === true) {
					publishBridge({ pending: false, error: null });
					return true;
				}
				const reason = payload !== null && typeof payload.reason === "string" ? payload.reason : `http-${String(response.status)}`;
				publishBridge({ pending: false, error: reason });
				return false;
			} catch (error) {
				publishBridge({ pending: false, error: error === null || error === void 0 ? void 0 : error.message });
				return false;
			}
		}
		/** Remember the reader's editor choice and re-render every row. */
		function chooseEditor(id) {
			editorChoice = id;
			writeStoredFlag(EDITOR_STORAGE_KEY, id);
			publishBridge({ editor: id });
		}
		/** Remember the reader's auto-open choice and re-render every row. */
		function setAutoOpen(value) {
			autoOpenChoice = value === true ? "1" : "0";
			writeStoredFlag(AUTO_OPEN_STORAGE_KEY, autoOpenChoice);
			publishBridge({ autoOpen: value === true });
		}
		/**
		* Resolve a mutation's path the way the chat view does.
		*
		* The agent may name the file relative to the session workspace, absolutely,
		* or with a leading `~`; the host expands `~` and re-resolves through
		* `realpath`, so the only job here is to hand it something absolute whenever
		* the session workspace is known.
		*/
		function resolveAgainstCwd(path, cwd) {
			if (typeof path !== "string" || path.trim() === "") return null;
			const trimmed = path.trim();
			if (trimmed === "~" || trimmed.startsWith("~/")) return trimmed;
			if (trimmed.startsWith("/") || isWindowsStylePath(trimmed)) return trimmed;
			if (typeof cwd !== "string" || cwd === "") return trimmed;
			return `${cwd.replace(/\/+$/, "")}/${trimmed}`;
		}
		/**
		* The first line a mutation *added*, which is the line a reader wants to see.
		*
		* DSH's recorded diff carries no line numbers (`FileDiff` is a path plus the
		* before and after text), so the host resolves this hint against the file on
		* disk. A `write` (no prior text) has nothing to compare, so its first
		* non-empty line is the hint; an `edit` contributes the first line of its new
		* side that the old side did not contain.
		*/
		function firstChangedLine(oldText, newText) {
			if (typeof newText !== "string" || newText === "") return "";
			const candidateLines = newText.split("\n");
			if (typeof oldText === "string") {
				const known = new Set(oldText.split("\n").map((line) => line.trim()));
				for (const line of candidateLines) {
					const trimmed = line.trim();
					if (trimmed !== "" && !known.has(trimmed)) return trimmed.slice(0, HINT_MAX_LENGTH);
				}
			}
			for (const line of candidateLines) {
				const trimmed = line.trim();
				if (trimmed !== "") return trimmed.slice(0, HINT_MAX_LENGTH);
			}
			return "";
		}
		/** Calls that already triggered an automatic open, so a re-render never opens twice. */
		const autoOpenedCalls = new Set();
		/**
		* Decide whether one mutation row should open its file by itself.
		*
		* Pure but for the once-per-call memory. Opening is refused while the bridge
		* is unknown or unavailable, while the call is not a settled success (a failed
		* or interrupted mutation must not open anything, and a running one has no
		* file on disk yet for a `write`), and for a call already opened. Returns the
		* payload to send, or null.
		*/
		function openPlanFor(input) {
			if (input.autoOpen !== true || input.status !== "ready") return null;
			if (input.state !== "ok") return null;
			if (typeof input.callId !== "string" || input.callId === "") return null;
			if (typeof input.path !== "string" || input.path === "") return null;
			if (autoOpenedCalls.has(input.callId)) return null;
			autoOpenedCalls.add(input.callId);
			if (autoOpenedCalls.size > AUTO_OPEN_MEMORY) {
				const oldest = autoOpenedCalls.values().next().value;
				autoOpenedCalls.delete(oldest);
			}
			return { path: input.path, hint: typeof input.hint === "string" ? input.hint : "" };
		}
		//#endregion

		//#region row chrome (mirrors dsh-client-ui-tool ToolRow)
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
		/** Copy helper: the shell's clipboard primitive when present, else the platform API. */
		function copyText(text) {
			if (typeof _primitives.writeClipboard === "function") return Promise.resolve(_primitives.writeClipboard(text));
			if (typeof navigator !== "undefined" && navigator.clipboard !== void 0) return navigator.clipboard.writeText(text);
			return Promise.resolve(false);
		}
		/**
		* The diff card with syntax colors.
		*
		* DSH already ships a complete highlighter — shiki with VS Code's TextMate
		* grammars, its own light/dark palette and on-demand grammar loading — and
		* `ReadBlock`/`CodeBlock` use it. Only `DiffBlock` renders plain text, so this
		* plugin renders the card itself through the exported `CodeBlock` primitive and
		* gets the shell's tokens, palette and language loading for free.
		*
		* One block per side keeps the tokenizer honest: each side is verbatim text.
		* `+`/`-` prefixes come from CSS on the emitted lines, so they survive whatever
		* the tokenizer does; the side tint and border show the direction even when the
		* extension maps to no grammar.
		*/
		function HighlightedDiff({ diffs, t }) {
			const { runs } = diffRuns(diffs);
			const [copied, setCopied] = react.useState(false);
			const copyLabel = tt(t, "copy", "Copy");
			const copiedLabel = tt(t, "copied", "Copied");
			const onCopy = react.useCallback(() => {
				if (copied) return;
				copyText(diffClipboardText(diffs)).then((ok) => {
					if (ok === false) return;
					setCopied(true);
					window.setTimeout(() => { setCopied(false); }, 1000);
				}, () => {});
			}, [copied, diffs]);
			return react_jsx_runtime.jsxs("div", {
				className: css_styles.diffCard,
				"data-diff": "",
				children: [
					react_jsx_runtime.jsx("button", {
						type: "button",
						className: css_styles.copyButton,
						onClick: onCopy,
						children: copied ? copiedLabel : copyLabel
					}),
					runs.map((run, index) => react_jsx_runtime.jsxs("div", {
						className: css_styles.hunk,
						children: [
							run.first
								? react_jsx_runtime.jsx("div", { className: css_styles.hunkPath, children: run.path })
								: react_jsx_runtime.jsx("div", { className: css_styles.hunkGap, children: "⋯" }),
							run.del === null ? null : react_jsx_runtime.jsx(_primitives.CodeBlock, {
								code: run.del,
								lang: run.lang,
								copyLabel,
								copiedLabel,
								className: `${css_styles.hlCode} ${css_styles.hlSide} ${css_styles.hlDel}`
							}),
							run.add === null ? null : react_jsx_runtime.jsx(_primitives.CodeBlock, {
								code: run.add,
								lang: run.lang,
								copyLabel,
								copiedLabel,
								className: `${css_styles.hlCode} ${css_styles.hlSide} ${css_styles.hlAdd}`
							})
						]
					}, index))
				]
			});
		}
		function DiffRow({ t, callId, toolName, block, cwd, home, openFile, inspect }) {
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
			// The `+A -R` badge is counted here rather than via the 0.1.5 `diffTotals`
			// primitive, so both versions show it and the numbers cannot drift.
			const diffDiffs = diffBody === null ? null : diffBody.card.diffs;
			const totals = diffDiffs === null ? null : diffRuns(diffDiffs);
			const suffix = failureLine !== null || totals === null ? null : `+${String(totals.added)} -${String(totals.removed)}`;
			const fileLink = model.filePath !== void 0 && openFile !== void 0 && failureLine === null;
			const toggleExpand = () => setExpanded((v) => !v);
			const onOpenFile = (event) => { event.stopPropagation(); if (model.filePath !== void 0) openFile?.(model.filePath); };
			const fileLinkKeyDown = (event) => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); };
			const cardBody = model.variant === "code" ? null : model.body;
			// The host bridge renders an action only for a real file that reached a
			// working host route; every other case keeps the stock row exactly.
			const bridge = useBridgeState();
			const firstDiff = diffDiffs === null || diffDiffs.length === 0 ? null : diffDiffs[0];
			const editorPath = firstDiff === null ? null : resolveAgainstCwd(firstDiff.path, cwd);
			const editorHint = firstDiff === null ? "" : firstChangedLine(firstDiff.oldText, firstDiff.newText);
			const editorAction = bridge.status === "ready" && bridge.editors.length > 0 && editorPath !== null && failureLine === null;
			const [menuOpen, setMenuOpen] = react.useState(false);
			const editorLabel = bridge.pending ? tt(t, "mutdiff.opening", "Opening…") : tt(t, "mutdiff.openInEditor", "Open in editor");
			const pickLabel = tt(t, "mutdiff.chooseEditor", "Choose the editor");
			const autoLabel = tt(t, "mutdiff.autoOpen", "Open every edited file automatically");
			const onOpenInEditor = () => { if (editorPath !== null) void requestOpen(editorPath, editorHint); };
			const editorError = bridge.error === null || bridge.error === void 0 ? null : EDITOR_ERROR_TEXT[bridge.error] ?? `Open failed (${String(bridge.error)})`;
			// Live follow-along: a settled, successful mutation opens its own file once,
			// with the caret on the first line it added. Keyed on the call id, so the
			// re-renders of streaming output never open the same file twice.
			react.useEffect(() => {
				const plan = openPlanFor({ status: bridge.status, autoOpen: bridge.autoOpen, state: model.state, callId, path: editorPath, hint: editorHint });
				if (plan !== null) void requestOpen(plan.path, plan.hint);
			}, [bridge.status, bridge.autoOpen, model.state, callId, editorPath, editorHint]);
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
								diffBody !== null ? (canHighlight() ? react_jsx_runtime.jsx(HighlightedDiff, {
									diffs: diffBody.card.diffs,
									t
								}) : react_jsx_runtime.jsx(_primitives.DiffBlock, {
									...diffBody.card,
									labels: diffBlockLabels(t),
									maxLines: Infinity,
									className: css_styles.diffBody
								})) : react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, {
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
								(inspect !== void 0 || editorAction) && react_jsx_runtime.jsxs("div", {
									className: css_styles.bodyActions,
									"data-open": menuOpen ? "true" : void 0,
									children: [
										inspect !== void 0 && react_jsx_runtime.jsxs("button", {
											type: "button",
											className: css_styles.inspectButton,
											onClick: inspect,
											children: [react_jsx_runtime.jsx(_primitives.IconInspectOutline12, {}), "Inspect"]
										}),
										editorAction && react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, {
											children: [
												react_jsx_runtime.jsxs("button", {
													type: "button",
													className: css_styles.editorButton,
													disabled: bridge.pending,
													title: bridge.editor === null || bridge.editor === void 0 ? editorLabel : `${editorLabel} — ${bridge.editor}`,
													"aria-label": editorLabel,
													onClick: onOpenInEditor,
													children: [react_jsx_runtime.jsx(_primitives.IconEditOutline16, { size: 12 }), editorLabel]
												}),
												react_jsx_runtime.jsx("button", {
													type: "button",
													className: css_styles.editorCaret,
													"aria-haspopup": "menu",
													"aria-expanded": menuOpen,
													"aria-label": pickLabel,
													title: pickLabel,
													onClick: () => setMenuOpen((value) => !value),
													children: "▾"
												}),
												menuOpen && react_jsx_runtime.jsxs("div", {
													className: css_styles.editorMenu,
													role: "menu",
													children: [
														react_jsx_runtime.jsx("span", { key: "title", className: css_styles.editorMenuTitle, children: tt(t, "mutdiff.detectedEditors", "Open with") }),
														bridge.editors.map((entry) => react_jsx_runtime.jsx("button", {
															type: "button",
															role: "menuitemradio",
															"aria-checked": entry.id === bridge.editor,
															"data-active": entry.id === bridge.editor ? "true" : void 0,
															className: css_styles.editorMenuItem,
															onClick: () => { chooseEditor(entry.id); },
															children: entry.label
														}, entry.id)),
														react_jsx_runtime.jsxs("label", {
															key: "auto",
															className: css_styles.editorMenuToggle,
															"data-pinned": bridge.follow || bridge.autoOpenPinnedBy !== null ? "true" : void 0,
															children: [
																react_jsx_runtime.jsx("input", {
																	type: "checkbox",
																	checked: bridge.autoOpen,
																	disabled: bridge.follow || bridge.autoOpenPinnedBy !== null,
																	onChange: (event) => { setAutoOpen(event.target.checked); }
																}),
																autoLabel
															]
														}),
														react_jsx_runtime.jsx("span", {
															key: "note",
															className: css_styles.editorMenuNote,
															children: bridge.follow ? tt(t, "mutdiff.followNote", "Live follow is on: the host opens every edit as it lands, without this page") : bridge.autoOpenPinnedBy === null ? tt(t, "mutdiff.autoOpenNote", "Opening raises the editor window") : tr(t, "mutdiff.autoOpenPinned", { name: bridge.autoOpenPinnedBy }, `Pinned by ${bridge.autoOpenPinnedBy} for this run`)
														})
													]
												})
											]
										}),
										editorError !== null && react_jsx_runtime.jsx("span", { className: css_styles.editorError, children: editorError })
									]
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
			// The editor roster is read whether or not the rows are taken over: it is
			// independent of the primitives this plugin renders through, and a failed
			// read only logs a diagnostic.
			primeBridge();
			try {
				ctx.plugin(mutDiffToolview);
			} catch (error) {
				console.error("[dsh-client-ui-mutdiff] could not take over the edit/write rows; keeping the stock rows:", error);
			}
		}
		//#endregion

		/**
		* Test-only seam. `test/run.mjs` renders static markup, so it can neither run
		* effects nor reach this factory's closure; these are the pure pieces of the
		* bridge (the auto-open decision, the line hint, the path resolution) plus the
		* store and the request itself. Nothing in the shell reads this key.
		*/
		exports.__testing = {
			openPlanFor,
			firstChangedLine,
			resolveAgainstCwd,
			requestOpen,
			bridgeState,
			publishBridge,
			primeBridge,
			chooseEditor,
			setAutoOpen
		};
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

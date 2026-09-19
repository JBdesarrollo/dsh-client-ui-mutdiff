# Upstream: syntax-highlight `DiffBlock` (the diff is the one code surface left uncoloured)

Notes for a report against [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness), written while building this plugin. Paths are given by package and by the region markers the shipped bundles keep, since the published artifacts are minified.

## Summary

The client shell already ships a complete highlighter — shiki, with VS Code's TextMate grammars, its own light/dark palette and on-demand grammar loading. `ReadBlock` and `CodeBlock` use it. `DiffBlock` does not, so file-mutation rows render flat monochrome text while every other code surface in the same conversation is highlighted.

## Current behaviour

**`ReadBlock` tokenizes** (`@deepseek-ai/dsh-client-ui-primitives`, region `lib/types/client/tool/models/…` / the primitive's own module):

```js
function ReadBlock({ label, lines, totalLines, lang, maxLines = 16, className }) {
  const text = useMemo(() => lines.map((l) => l.text).join("\n"), [lines]);
  const highlighted = useMemo(() => highlightToTokens(text, lang), [text, lang, useSyncExternalStore(...)]);
  // …
  <span className={content}>{tokens === undefined ? line.text : renderTokens(tokens)}</span>
}
```

where `highlightToTokens` is `highlighter.codeToTokens(text, { lang, theme: "css-variables" })`, and the lang is resolved through the shell's extension-alias map (`ts`/`tsx`/`js` → `typescript`, `py` → `python`, …).

**`CodeBlock` tokenizes** the same way, through `codeToHtml`.

**`DiffBlock` does not.** Its signature and row rendering:

```js
function DiffBlock({ diffs, labels, maxLines = 16, className }) {
  const { rows, added, removed, files } = useMemo(() => buildDiffRows(diffs), [diffs]);
  // …
  rows.map((row) => <div className={cls(styles.line, KIND_CLASS[row.kind])}>{row.text}</div>)
}
```

`buildDiffRows` emits `{kind: "path" | "gap" | "del" | "add", text}` and the line classes only colour the `- `/`+ ` prefixes (`:before{content:"- "}`). The text itself has no tokens, and there is no `lang` to tokenize with — the card is built from hunks that already carry `path`, `oldText` and `newText`.

## The intended hooks exist and are unused

Shiki's css-variables theme (the one the shell builds as `createCssVariablesTheme({ name: "css-variables", variablePrefix: "--shiki-", fontStyle: true })`) declares token variables for diff scopes:

```
--shiki-token-inserted
--shiki-token-deleted
--shiki-token-changed
```

`@deepseek-ai/dsh-client-ui-theme`'s `shiki.css` defines `foreground`, `background` and the code tokens (`token-constant`, `token-string`, `token-comment`, `token-keyword`, `token-parameter`, `token-function`, `token-string-expression`, `token-punctuation`, `token-link`) for light and dark — but **none of the three diff tokens**. So the palette was laid out for a highlighted diff that was never wired up.

(For completeness, the theme also references the sixteen `--shiki-ansi-*` variables, which `shiki.css` likewise does not define. That only affects `lang: "ansi"` terminal output.)

## Proposed change

1. Give `DiffBlock` an optional `lang` — per hunk, since one card can span several files and each hunk already carries `path`. A `langFromPath` helper next to the existing alias map is enough.
2. Tokenize per line exactly as `ReadBlock` does: join the run of same-kind lines into one string, `codeToTokens` once, then index the returned tokens by line. One tokenizer call per side keeps whole-code context, and the `del`/`add` line classes keep working unchanged.
3. Define `--shiki-token-inserted` / `--shiki-token-deleted` / `--shiki-token-changed` in `ui-theme`'s `shiki.css` (light and dark), and use them for the emphasis the diff already applies.
4. Thread the language through the call site: `file-mutation-row` already receives the hunks from `diffCardModel`, and `ToolRow` already forwards `diff` to `DiffBlock`, so this is a prop away.

## Why it matters

A diff is the densest code a user reads in the conversation, and it is currently the only place where a `write`/`edit` is shown as undifferentiated text. It also affects readability of large hunks, which is where the missing colours hurt most.

## Workaround

This plugin takes over the `edit`/`write` keys of the `tool.call.toolview` keyed slot at `priority: -1` and rebuilds the card out of the exported `CodeBlock` primitive — one highlighted block per side, `+`/`-` prefixes drawn by CSS on the emitted shiki lines. It works, but it means re-implementing shipped card chrome and tracking it across releases, which is exactly what a `lang` prop on `DiffBlock` would remove.

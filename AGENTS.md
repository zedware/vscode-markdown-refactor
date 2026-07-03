# AGENTS.md

## Project Notes

This is a VS Code extension for Markdown refactoring. The primary user command is:

```text
Markdown: Refactor...
```

It opens a Quick Pick action launcher. Keep new refactors behind this launcher unless there is a strong reason to add a separate shortcut.

## Commands

- `markdownRefactor.showActions`: opens the action launcher and owns `Ctrl+Alt+M`.
- `markdownRefactor.extractSelectionToFile`: extracts selected Markdown into a new file and replaces the selection with a link.
- `markdownRefactor.spaceCjkAndEnglish`: adds spaces only between CJK letters and half-width English/numbers.
- `markdownRefactor.spaceCjkAndEnglishWithPunctuation`: also handles immediate punctuation around half-width words.
- `markdownRefactor.convertPunctuationToFullWidth`: converts common half-width punctuation to full-width punctuation.
- `markdownRefactor.convertPunctuationToHalfWidth`: converts common full-width punctuation to half-width punctuation.
- `markdownRefactor.cycleTaskCheckbox`: cycles a Markdown task checkbox through `markdownRefactor.checkboxCycle` and owns `Ctrl+Alt+W`.

## Formatting Rules

Examples use literal Unicode escapes to keep this file readable in non-UTF-8 terminals.

Spacing examples:

```text
\u4e2d\u6587English\u4e2d\u6587 -> \u4e2d\u6587 English \u4e2d\u6587
\u6d4b\u8bd5VSCode\u63d2\u4ef6 -> \u6d4b\u8bd5 VSCode \u63d2\u4ef6
\u7248\u672c2\u53d1\u5e03 -> \u7248\u672c 2 \u53d1\u5e03
,NL2SQL\uff0c -> , NL2SQL \uff0c
```

Punctuation conversion examples:

```text
Hello, world! -> Hello\uff0cworld\uff01
Hello\uff0cworld\uff01 -> Hello,world!
```

Leading Markdown syntax must remain valid Markdown when converting to full width. Preserve heading markers (`#`), blockquote markers (`>`), unordered list markers (`-`, `*`, `+`), task list checkboxes, ordered list markers (`1. ` and `1) `), and fence marker lines (` ``` ` and `~~~`).

Markdown ordered-list markers must remain valid Markdown when converting to full width:

```text
  1. \u738b,NL2SQL, \u8bba\u6587
  2. \u5f20\uff0cNL2SQL, \u62a5\u544a
  3. \u8c22, NL2SQL, \u5ba3\u4f20\u7a3f
```

converts to:

```text
  1. \u738b\uff0cNL2SQL\uff0c\u8bba\u6587
  2. \u5f20\uff0cNL2SQL\uff0c\u62a5\u544a
  3. \u8c22\uff0cNL2SQL\uff0c\u5ba3\u4f20\u7a3f
```

Existing line-leading `1\u3001` markers normalize back to `1. ` when converting to half width.

Preservation examples:

```text
# Hello, world! -> # Hello\uff0cworld\uff01
> # Quote, title -> > # Quote\uff0ctitle
- [ ] task, item -> - [ ] task\uff0citem
1. item, one -> 1. item\uff0cone
```

## Checkbox Cycling

The default checkbox cycle is `⬜ -> ⏳ -> ✅ -> ❌ -> ❗`. The command changes task markers after a Markdown list prefix, such as `- ⬜ item`, `1. ⏳ item`, or `> - ✅ quoted item`.

Plain list items without a task marker are activated by inserting the first configured marker, for example `- item` becomes `- ⬜ item`. Existing legacy bracket tasks always use the bracket cycle `[ ] -> [/] -> [!] -> [-] -> [x]`, even when the configured cycle uses emoji markers. It treats `[X]` as `[x]` when cycling legacy bracket tasks.

`markdownRefactor.checkboxCycle` must contain at least two unique markers. Markers can be bracketed strings, for example `[ ]`, or compact emoji/text markers without spaces, for example `⬜`.

Checkbox decoration is enabled by `markdownRefactor.decorateCheckboxes`. It highlights bracket-style task markers in Markdown editors only, using marker meanings: `[ ]` todo, `[/]` in progress, `[-]` cancelled, `[x]`/`[X]` done, `[!]` important, and a fallback style for custom non-emoji markers. Emoji markers are not decorated.

## Development

```powershell
npm install
npm run compile
npx @vscode/vsce package
code --install-extension .\vscode-markdown-refactor-0.2.3.vsix --force
```

Use `F5` in VS Code to launch an Extension Development Host.

Before packaging or publishing, run:

```powershell
npm run compile
npx @vscode/vsce package
```

Keep the Marketplace README concise. Put detailed implementation notes and edge cases in this file.

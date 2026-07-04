# Markdown Refactor

## Overview

Markdown Refactor is a VS Code extension for small Markdown editing refactors:

- Extract selected Markdown into a new linked file.
- Add spaces between CJK/full-width text, English words, and numbers.
- Convert punctuation between half-width and full-width forms.
- Cycle Markdown task markers through a configurable state list.
- Highlight bracket-style task checkbox states while editing raw Markdown.

Repository: [zedware/vscode-markdown-refactor](https://github.com/zedware/vscode-markdown-refactor)

## Usage

Open a Markdown file and run:

```text
Markdown: Refactor...
```

Default shortcut:

```text
Ctrl+Alt+M
```

Available actions:

1. Extract selection to a single Markdown file
2. Space CJK, English words, and numbers
3. Space CJK, English words, numbers, and punctuation
4. Convert punctuation to full width
5. Convert punctuation to half width
6. Cycle task checkbox

Spacing and punctuation actions work on the current selection. If nothing is selected, they apply to the whole Markdown document. Punctuation conversion asks for confirmation before changing the whole document and preserves leading Markdown syntax such as headings and list markers.

Task marker cycling works on the list line at the cursor, including multiple cursors. Default shortcut: `Ctrl+Alt+W`. Plain list items are activated with the first configured emoji marker, while existing bracket-style task markers keep cycling through `[ ]`, `[/]`, `[x]`, `[-]`, `[!]`.

Settings:

- `markdownRefactor.linkStyle`: `markdown`, `embed`, or `wiki`
- `markdownRefactor.defaultDirectory`: optional extraction directory relative to the current file
- `markdownRefactor.checkboxCycle`: ordered task marker states, default `⬜`, `⏳`, `✅`, `❌`, `❗`
- `markdownRefactor.decorateCheckboxes`: highlight bracket-style checkbox states in the editor

Checkbox settings in `settings.json`:

```json
{
  "markdownRefactor.checkboxCycle": ["⬜", "⏳", "✅", "❌", "❗"],
  "markdownRefactor.decorateCheckboxes": true
}
```

Default marker meanings:

- `⬜`: TODO
- `⏳`: In Progress
- `✅`: Done
- `❌`: Cancelled
- `❗`: Important

You can use the legacy bracket cycle too:

```json
{
  "markdownRefactor.checkboxCycle": ["[ ]", "[/]", "[x]", "[-]", "[!]"]
}
```

Decoration highlighting can be turned on or off with `markdownRefactor.decorateCheckboxes`. Bracket-style markers use built-in status colors, custom non-emoji markers use a fallback highlight style, and emoji markers are not decorated.

## Installation

From VS Code Marketplace:

```powershell
code --install-extension zedware.vscode-markdown-refactor
```

Or search for `Markdown Refactor` in VS Code Extensions.

From Git source code:

```powershell
git clone git@github.com:zedware/vscode-markdown-refactor.git
cd vscode-markdown-refactor
npm install
npm run compile
npx @vscode/vsce package
code --install-extension .\vscode-markdown-refactor-0.2.9.vsix --force
```

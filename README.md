# Markdown Refactor

## Overview

Markdown Refactor is a VS Code extension for small Markdown editing refactors:

- Extract selected Markdown into a new linked file.
- Add spaces between CJK/full-width text and English words.
- Convert punctuation between half-width and full-width forms.

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
2. Space CJK and English words
3. Space CJK and English words with punctuation
4. Convert punctuation to full width
5. Convert punctuation to half width

Spacing and punctuation actions work on the current selection. If nothing is selected, they apply to the whole Markdown document. Punctuation conversion asks for confirmation before changing the whole document and preserves leading Markdown syntax such as headings and list markers.

Settings:

- `markdownRefactor.linkStyle`: `markdown`, `embed`, or `wiki`
- `markdownRefactor.defaultDirectory`: optional extraction directory relative to the current file

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
code --install-extension .\vscode-markdown-refactor-0.1.0.vsix --force
```

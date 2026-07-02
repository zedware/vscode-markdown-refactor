# Markdown Refactor

This VS Code extension adds refactor-style commands for Markdown.

## Commands

### Markdown: Extract Selection to File

1. Select text in a Markdown file.
2. Run `Markdown: Extract Selection to File`.
3. Enter a file name.
4. The selected text is moved to the new file.
5. The original selection is replaced with a link.

Default keybinding: `Ctrl+Alt+M`

### Markdown: Space CJK and English

Adds spaces between adjacent CJK characters and half-width English letters or numbers.

Examples:

- `中文English中文` -> `中文 English 中文`
- `测试VSCode插件` -> `测试 VSCode 插件`
- `版本2发布` -> `版本 2 发布`

If text is selected, only the selection is changed. If there is no selection, the whole Markdown document is changed.

## Development

```powershell
npm install
npm run compile
code .
```

Press `F5` in VS Code to launch an Extension Development Host.

## Settings

- `markdownRefactor.linkStyle`
  - `markdown`: Markdown link style
  - `embed`: Markdown embed/image link style
  - `wiki`: `[[file]]`
- `markdownRefactor.defaultDirectory`
  - Optional path relative to the current file, for example `notes`.

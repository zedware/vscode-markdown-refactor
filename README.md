# Markdown Refactor

This VS Code extension adds refactor-style commands for Markdown.

The first command extracts selected Markdown into a new linked file:

1. Select text in a Markdown file.
2. Run `Markdown: Extract Selection to File`.
3. Enter a file name.
4. The selected text is moved to the new file.
5. The original selection is replaced with a link.

## Development

```powershell
npm install
npm run compile
code .
```

Press `F5` in VS Code to launch an Extension Development Host.

## Command

- `Markdown: Extract Selection to File`
- Default keybinding: `Ctrl+Alt+M`

## Settings

- `markdownRefactor.linkStyle`
  - `markdown`: Markdown link style
  - `embed`: Markdown embed/image link style
  - `wiki`: `[[file]]`
- `markdownRefactor.defaultDirectory`
  - Optional path relative to the current file, for example `notes`.

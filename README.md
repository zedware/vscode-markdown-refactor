# Markdown Refactor

This VS Code extension adds refactor-style commands for Markdown.

## Commands

### Markdown: Refactor...

Opens an action menu for Markdown refactors.

Default keybinding: `Ctrl+Alt+M`

Actions:

1. Extract selection to a single Markdown file
2. Space CJK and English words
3. Space CJK and English words with punctuation

### Extract Selection to File

1. Select text in a Markdown file.
2. Run `Markdown: Refactor...`.
3. Choose `Extract selection to a single Markdown file`.
4. Enter a file name.
5. The selected text is moved to the new file and replaced with a link.

### Space CJK and English Words

Adds spaces between adjacent CJK/full-width characters and half-width English letters or numbers.

Examples:

- `中文English中文` -> `中文 English 中文`
- `测试VSCode插件` -> `测试 VSCode 插件`
- `版本2发布` -> `版本 2 发布`

### Space CJK and English Words with Punctuation

Adds the same spaces, and also separates immediate punctuation around half-width words in mixed-width text.

Example:

- `,NL2SQL，` -> `, NL2SQL ，`

For spacing actions, if text is selected, only the selection is changed. If there is no selection, the whole Markdown document is changed.

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

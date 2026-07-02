import * as path from "path";
import * as vscode from "vscode";

type LinkStyle = "markdown" | "embed" | "wiki";
type TextFormatter = (value: string) => string;

interface RefactorAction extends vscode.QuickPickItem {
  command: string;
}

const cjkLetterCharacter = "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}]";
const fullWidthBoundaryCharacter = "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\u3000-\\u303F\\uFF01-\\uFF65]";
const halfWidthWordCharacter = "[A-Za-z0-9]";
const halfWidthPunctuationCharacter = "[,.;:!?]";
const cjkBeforeHalfWidthWord = new RegExp(
  `(${cjkLetterCharacter})(${halfWidthWordCharacter})`,
  "gu"
);
const halfWidthWordBeforeCjk = new RegExp(
  `(${halfWidthWordCharacter})(${cjkLetterCharacter})`,
  "gu"
);
const halfWidthPunctuationBeforeWordNearFullWidth = new RegExp(
  `(${halfWidthPunctuationCharacter})(${halfWidthWordCharacter}+)(?=${fullWidthBoundaryCharacter})`,
  "gu"
);
const fullWidthBeforeHalfWidthWord = new RegExp(
  `(${fullWidthBoundaryCharacter})(${halfWidthWordCharacter})`,
  "gu"
);
const halfWidthWordBeforeFullWidth = new RegExp(
  `(${halfWidthWordCharacter})(${fullWidthBoundaryCharacter})`,
  "gu"
);
const halfWidthToFullWidthPunctuation = new Map<string, string>([
  ["!", "\uFF01"],
  ["\"", "\uFF02"],
  ["#", "\uFF03"],
  ["$", "\uFF04"],
  ["%", "\uFF05"],
  ["&", "\uFF06"],
  ["'", "\uFF07"],
  ["(", "\uFF08"],
  [")", "\uFF09"],
  ["*", "\uFF0A"],
  ["+", "\uFF0B"],
  [",", "\uFF0C"],
  ["-", "\uFF0D"],
  [".", "\u3002"],
  ["/", "\uFF0F"],
  [":", "\uFF1A"],
  [";", "\uFF1B"],
  ["<", "\uFF1C"],
  ["=", "\uFF1D"],
  [">", "\uFF1E"],
  ["?", "\uFF1F"],
  ["@", "\uFF20"],
  ["[", "\uFF3B"],
  ["\\", "\uFF3C"],
  ["]", "\uFF3D"],
  ["^", "\uFF3E"],
  ["_", "\uFF3F"],
  ["`", "\uFF40"],
  ["{", "\uFF5B"],
  ["|", "\uFF5C"],
  ["}", "\uFF5D"],
  ["~", "\uFF5E"]
]);
const fullWidthToHalfWidthPunctuation = new Map<string, string>(
  [...halfWidthToFullWidthPunctuation.entries()].map(([halfWidth, fullWidth]) => [fullWidth, halfWidth])
);
for (const [fullWidth, halfWidth] of [
  ["\uFF0E", "."],
  ["\u3001", ","],
  ["\u300C", "\""],
  ["\u300D", "\""],
  ["\u300E", "\""],
  ["\u300F", "\""],
  ["\u201C", "\""],
  ["\u201D", "\""],
  ["\u2018", "'"],
  ["\u2019", "'"],
  ["\u3010", "["],
  ["\u3011", "]"],
  ["\u300A", "<"],
  ["\u300B", ">"]
]) {
  fullWidthToHalfWidthPunctuation.set(fullWidth, halfWidth);
}
const halfWidthPunctuationPattern = makeCharacterPattern(halfWidthToFullWidthPunctuation.keys());
const fullWidthPunctuationPattern = makeCharacterPattern(fullWidthToHalfWidthPunctuation.keys());
const markdownLeadingSyntaxPattern = new RegExp(
  "^((?:[-+*]|\\d+[.)])[ \\t]+\\[[ xX]\\][ \\t]+|(?:#{1,6}|[-+*]|\\d+[.)])(?:[ \\t]+|$))"
);
const fullWidthOrderedListMarkerPattern = /(^|\r?\n)([ \t]*\d+)\u3001[ \t]*/g;
const fullWidthPunctuationSpacingPattern = /([\uFF0C\u3001\u3002\uFF1B\uFF1A\uFF01\uFF1F])[ \t]+/g;

export function activate(context: vscode.ExtensionContext) {
  const launcherDisposable = vscode.commands.registerCommand(
    "markdownRefactor.showActions",
    showRefactorActions
  );
  const extractDisposable = vscode.commands.registerCommand(
    "markdownRefactor.extractSelectionToFile",
    extractSelectionToFile
  );
  const spaceBasicDisposable = vscode.commands.registerCommand(
    "markdownRefactor.spaceCjkAndEnglish",
    spaceCjkAndEnglish
  );
  const spaceWithPunctuationDisposable = vscode.commands.registerCommand(
    "markdownRefactor.spaceCjkAndEnglishWithPunctuation",
    spaceCjkAndEnglishWithPunctuation
  );
  const convertPunctuationToFullWidthDisposable = vscode.commands.registerCommand(
    "markdownRefactor.convertPunctuationToFullWidth",
    convertPunctuationToFullWidth
  );
  const convertPunctuationToHalfWidthDisposable = vscode.commands.registerCommand(
    "markdownRefactor.convertPunctuationToHalfWidth",
    convertPunctuationToHalfWidth
  );

  context.subscriptions.push(
    launcherDisposable,
    extractDisposable,
    spaceBasicDisposable,
    spaceWithPunctuationDisposable,
    convertPunctuationToFullWidthDisposable,
    convertPunctuationToHalfWidthDisposable
  );
}

export function deactivate() {}

async function showRefactorActions() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "markdown") {
    vscode.window.showWarningMessage("Open a Markdown file before running Markdown Refactor.");
    return;
  }

  const actions: RefactorAction[] = [
    {
      label: "Extract selection to a single Markdown file",
      description: "Move selected text into a new linked .md file",
      command: "markdownRefactor.extractSelectionToFile"
    },
    {
      label: "Space CJK and English words",
      description: "Add spaces at CJK/full-width and English word boundaries",
      command: "markdownRefactor.spaceCjkAndEnglish"
    },
    {
      label: "Space CJK and English words with punctuation",
      description: "Also separates immediate prefix/suffix punctuation",
      command: "markdownRefactor.spaceCjkAndEnglishWithPunctuation"
    },
    {
      label: "Convert punctuation to full width",
      description: "Use CJK/full-width punctuation marks",
      command: "markdownRefactor.convertPunctuationToFullWidth"
    },
    {
      label: "Convert punctuation to half width",
      description: "Use English/half-width punctuation marks",
      command: "markdownRefactor.convertPunctuationToHalfWidth"
    }
  ];

  const selection = await vscode.window.showQuickPick(actions, {
    placeHolder: "Choose a Markdown refactor action"
  });

  if (!selection) {
    return;
  }

  await vscode.commands.executeCommand(selection.command);
}

async function extractSelectionToFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  if (document.languageId !== "markdown") {
    vscode.window.showWarningMessage("Open a Markdown file before extracting.");
    return;
  }

  if (editor.selection.isEmpty) {
    vscode.window.showWarningMessage("Select Markdown text to extract.");
    return;
  }

  if (document.isUntitled) {
    vscode.window.showWarningMessage("Save the current Markdown file before extracting.");
    return;
  }

  const selectedText = document.getText(editor.selection);
  if (!selectedText.trim()) {
    vscode.window.showWarningMessage("The selection is empty.");
    return;
  }

  const suggestedName = suggestFileName(selectedText);
  const inputName = await vscode.window.showInputBox({
    prompt: "New Markdown file name",
    value: suggestedName,
    validateInput: validateFileName
  });

  if (!inputName) {
    return;
  }

  const targetUri = await buildTargetUri(document.uri, inputName);
  if (!targetUri) {
    return;
  }

  if (await fileExists(targetUri)) {
    const choice = await vscode.window.showWarningMessage(
      `${path.basename(targetUri.fsPath)} already exists. Overwrite it?`,
      { modal: true },
      "Overwrite"
    );

    if (choice !== "Overwrite") {
      return;
    }
  }

  const normalizedText = selectedText.endsWith("\n") ? selectedText : `${selectedText}\n`;
  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(normalizedText, "utf8"));

  const replacement = makeReplacementLink(document.uri, targetUri);
  await editor.edit((editBuilder) => {
    editBuilder.replace(editor.selection, replacement);
  });

  await document.save();
  await vscode.window.showTextDocument(targetUri);
}

async function spaceCjkAndEnglish() {
  await formatCurrentMarkdownText(spaceBasicMixedWidthText, "No CJK/English spacing changes needed.");
}

async function spaceCjkAndEnglishWithPunctuation() {
  await formatCurrentMarkdownText(
    spacePunctuationAwareMixedWidthText,
    "No CJK/English punctuation spacing changes needed."
  );
}

async function convertPunctuationToFullWidth() {
  await formatCurrentMarkdownText(
    convertHalfWidthPunctuationToFullWidth,
    "No half-width punctuation changes needed.",
    true
  );
}

async function convertPunctuationToHalfWidth() {
  await formatCurrentMarkdownText(
    convertFullWidthPunctuationToHalfWidth,
    "No full-width punctuation changes needed.",
    true
  );
}

async function formatCurrentMarkdownText(
  formatter: TextFormatter,
  unchangedMessage: string,
  confirmWholeDocument = false
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  if (document.languageId !== "markdown") {
    vscode.window.showWarningMessage("Open a Markdown file before spacing CJK and English text.");
    return;
  }

  const selectedRanges = editor.selections.filter((selection) => !selection.isEmpty);
  if (selectedRanges.length === 0 && confirmWholeDocument) {
    const choice = await vscode.window.showWarningMessage(
      "No text is selected. This will convert punctuation in the whole Markdown document and may affect links or Markdown syntax.",
      { modal: true },
      "Convert Document"
    );

    if (choice !== "Convert Document") {
      return;
    }
  }

  const ranges = selectedRanges.length > 0
    ? selectedRanges
    : [new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))];

  const replacements = ranges.map((range) => {
    const originalText = document.getText(range);
    return {
      range,
      originalText,
      formattedText: formatter(originalText)
    };
  });

  if (replacements.every(({ originalText, formattedText }) => originalText === formattedText)) {
    vscode.window.showInformationMessage(unchangedMessage);
    return;
  }

  await editor.edit((editBuilder) => {
    for (const { range, formattedText } of replacements) {
      editBuilder.replace(range, formattedText);
    }
  });
}

async function buildTargetUri(sourceUri: vscode.Uri, inputName: string): Promise<vscode.Uri | undefined> {
  const config = vscode.workspace.getConfiguration("markdownRefactor");
  const configuredDirectory = config.get<string>("defaultDirectory", "").trim();
  const sourceDirectory = path.dirname(sourceUri.fsPath);
  const targetDirectory = configuredDirectory
    ? path.resolve(sourceDirectory, configuredDirectory)
    : sourceDirectory;

  const normalizedName = inputName.endsWith(".md") ? inputName : `${inputName}.md`;
  const targetPath = path.resolve(targetDirectory, normalizedName);

  if (!isPathInside(targetPath, sourceDirectory)) {
    const choice = await vscode.window.showWarningMessage(
      "The target path is outside the current Markdown file's folder. Continue?",
      { modal: true },
      "Continue"
    );

    if (choice !== "Continue") {
      return undefined;
    }
  }

  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(targetPath)));
  return vscode.Uri.file(targetPath);
}

function makeReplacementLink(sourceUri: vscode.Uri, targetUri: vscode.Uri): string {
  const config = vscode.workspace.getConfiguration("markdownRefactor");
  const linkStyle = config.get<LinkStyle>("linkStyle", "markdown");
  const relativePath = path
    .relative(path.dirname(sourceUri.fsPath), targetUri.fsPath)
    .replace(/\\/g, "/");
  const title = titleFromFileName(path.basename(targetUri.fsPath, ".md"));

  if (linkStyle === "embed") {
    return `![${title}](${relativePath})`;
  }

  if (linkStyle === "wiki") {
    return `[[${relativePath.replace(/\.md$/i, "")}]]`;
  }

  return `[${title}](${relativePath})`;
}

function spaceBasicMixedWidthText(value: string): string {
  return value
    .replace(cjkBeforeHalfWidthWord, "$1 $2")
    .replace(halfWidthWordBeforeCjk, "$1 $2");
}

function spacePunctuationAwareMixedWidthText(value: string): string {
  return value
    .replace(halfWidthPunctuationBeforeWordNearFullWidth, "$1 $2")
    .replace(fullWidthBeforeHalfWidthWord, "$1 $2")
    .replace(halfWidthWordBeforeFullWidth, "$1 $2");
}

function makeCharacterPattern(characters: Iterable<string>): RegExp {
  const characterClass = [...characters].map(escapeRegExp).join("");
  return new RegExp(`[${characterClass}]`, "gu");
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|\-]/g, "\\$&");
}

function convertHalfWidthPunctuationToFullWidth(value: string): string {
  return value
    .split(/(\r?\n)/)
    .map((part) => {
      if (/^\r?\n$/.test(part)) {
        return part;
      }

      return convertHalfWidthPunctuationLineToFullWidth(part);
    })
    .join("");
}

function convertHalfWidthPunctuationLineToFullWidth(value: string): string {
  const [syntaxPrefix, content] = splitMarkdownLeadingSyntax(value);
  return `${syntaxPrefix}${convertHalfWidthPunctuationSegmentToFullWidth(content)}`;
}

function splitMarkdownLeadingSyntax(value: string): [string, string] {
  const indentation = value.match(/^[ \t]*/)?.[0] ?? "";
  let prefix = indentation;
  let content = value.slice(indentation.length);

  while (content.startsWith(">")) {
    const marker = content.match(/^>[ \t]*/)?.[0] ?? ">";
    prefix += marker;
    content = content.slice(marker.length);
  }

  if (/^(`{3,}|~{3,})/.test(content)) {
    return [value, ""];
  }

  const syntaxMarker = content.match(markdownLeadingSyntaxPattern)?.[0];
  if (!syntaxMarker) {
    return [prefix, content];
  }

  return [`${prefix}${syntaxMarker}`, content.slice(syntaxMarker.length)];
}

function convertHalfWidthPunctuationSegmentToFullWidth(value: string): string {
  return value
    .replace(halfWidthPunctuationPattern, (punctuation) => {
      return halfWidthToFullWidthPunctuation.get(punctuation) ?? punctuation;
    })
    .replace(fullWidthPunctuationSpacingPattern, "$1");
}

function convertFullWidthPunctuationToHalfWidth(value: string): string {
  return value
    .replace(fullWidthOrderedListMarkerPattern, "$1$2. ")
    .replace(fullWidthPunctuationPattern, (punctuation) => {
      return fullWidthToHalfWidthPunctuation.get(punctuation) ?? punctuation;
    });
}

function suggestFileName(text: string): string {
  const firstMeaningfulLine = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);

  const base = slugify(firstMeaningfulLine ?? "extracted-note");
  return `${base || "extracted-note"}.md`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function titleFromFileName(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function validateFileName(value: string): string | undefined {
  if (!value.trim()) {
    return "Enter a file name.";
  }

  if (/[<>:"|?*]/.test(value)) {
    return "File name cannot contain < > : \" | ? *";
  }

  return undefined;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function isPathInside(candidatePath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
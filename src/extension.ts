import * as path from "path";
import * as vscode from "vscode";

type LinkStyle = "markdown" | "embed" | "wiki";
type TextFormatter = (value: string) => string;
type TimestampFormat = "date" | "time" | "datetime";
type CheckboxDecorationKind = "todo" | "progress" | "cancelled" | "done" | "important" | "custom";

interface RefactorAction extends vscode.QuickPickItem {
  command: string;
}

interface TimestampFormatItem extends vscode.QuickPickItem {
  format: TimestampFormat;
}

interface CheckboxTokenMatch {
  token: string;
  start: number;
  end: number;
}

interface CrossnoteInstallTarget extends vscode.QuickPickItem {
  fsPath: string;
}

const cjkLetterCharacter = "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}]";
const fullWidthBoundaryCharacter = "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\u3000-\\u303F\\uFF01-\\uFF65]";
const englishLetterCharacter = "[A-Za-z]";
const englishWordToken = "[A-Za-z][A-Za-z0-9]*";
const halfWidthTextCharacter = "[A-Za-z0-9]";
const numericRunToken = "[0-9]+(?:[.,][0-9]+)*%?";
const halfWidthPunctuationCharacter = "[,.;:!?]";
const cjkBeforeHalfWidthText = new RegExp(
  "(" + cjkLetterCharacter + ")(" + halfWidthTextCharacter + ")",
  "gu"
);
const halfWidthTextBeforeCjk = new RegExp(
  "([A-Za-z0-9%])(" + cjkLetterCharacter + ")",
  "gu"
);
const numericRunBeforeEnglishWord = new RegExp(
  "(?<![A-Za-z])(" + numericRunToken + ")(" + englishLetterCharacter + ")",
  "gu"
);
const halfWidthPunctuationBeforeWordNearFullWidth = new RegExp(
  "(" + halfWidthPunctuationCharacter + ")(" + englishWordToken + ")(?=" + fullWidthBoundaryCharacter + ")",
  "gu"
);
const fullWidthBeforeEnglishWord = new RegExp(
  "(" + fullWidthBoundaryCharacter + ")(" + englishLetterCharacter + ")",
  "gu"
);
const englishWordBeforeFullWidth = new RegExp(
  "(" + englishWordToken + ")(" + fullWidthBoundaryCharacter + ")",
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
  "^((?:[-+*]|\\d+[.)])[ \\t]+\\[[^\\]\\r\\n]*\\][ \\t]+|(?:#{1,6}|[-+*]|\\d+[.)])(?:[ \\t]+|$))"
);
const fullWidthOrderedListMarkerPattern = /(^|\r?\n)([ \t]*\d+)\u3001[ \t]*/g;
const fullWidthPunctuationSpacingPattern = /([\uFF0C\u3001\u3002\uFF1B\uFF1A\uFF01\uFF1F])[ \t]+/g;
const defaultCheckboxCycle = ["\u2B1C", "\u23F3", "\u2705", "\u274C", "\u2757"];
const legacyCheckboxCycle = ["[ ]", "[/]", "[x]", "[-]", "[!]"];
const checkboxTokenPattern = /^(?:\[[^\]\r\n]*\]|\S+)$/u;
const emojiMarkerPattern = /\p{Extended_Pictographic}/u;
const taskLinePrefixPattern = /^(?:[ \t]*>[ \t]*)*[ \t]*(?:[-+*]|\d+[.)])[ \t]+/;
const checkboxDecorationTypes = new Map<CheckboxDecorationKind, vscode.TextEditorDecorationType>();
const mpeCrossnoteTemplateDirectory = "mpe-crossnote";
const mpeCrossnoteTemplateFiles = ["parser.js", "style.less"];

export function activate(context: vscode.ExtensionContext) {
  initializeCheckboxDecorations(context);

  const launcherDisposable = vscode.commands.registerCommand(
    "markdownRefactor.showActions",
    showRefactorActions
  );
  const insertTimestampDisposable = vscode.commands.registerCommand(
    "markdownRefactor.insertTimestamp",
    insertTimestamp
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
  const cycleTaskCheckboxDisposable = vscode.commands.registerCommand(
    "markdownRefactor.cycleTaskCheckbox",
    cycleTaskCheckbox
  );
  const unifyListFormatDisposable = vscode.commands.registerCommand(
    "markdownRefactor.unifyListFormat",
    unifyListFormat
  );
  const unifyTrailingPunctuationDisposable = vscode.commands.registerCommand(
    "markdownRefactor.unifyTrailingPunctuation",
    unifyTrailingPunctuation
  );
  const installMpeSupportDisposable = vscode.commands.registerCommand(
    "markdownRefactor.installMarkdownPreviewEnhancedSupport",
    () => installMarkdownPreviewEnhancedSupport(context)
  );
  const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
    updateVisibleCheckboxDecorations();
  });
  const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
    if (vscode.window.visibleTextEditors.some((editor) => editor.document === event.document)) {
      updateVisibleCheckboxDecorations();
    }
  });
  const configurationChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (
      event.affectsConfiguration("markdownRefactor.checkboxCycle") ||
      event.affectsConfiguration("markdownRefactor.decorateCheckboxes")
    ) {
      updateVisibleCheckboxDecorations();
    }
  });

  context.subscriptions.push(
    launcherDisposable,
    insertTimestampDisposable,
    extractDisposable,
    spaceBasicDisposable,
    spaceWithPunctuationDisposable,
    convertPunctuationToFullWidthDisposable,
    convertPunctuationToHalfWidthDisposable,
    cycleTaskCheckboxDisposable,
    unifyListFormatDisposable,
    unifyTrailingPunctuationDisposable,
    installMpeSupportDisposable,
    activeEditorDisposable,
    documentChangeDisposable,
    configurationChangeDisposable
  );

  updateVisibleCheckboxDecorations();

  return {
    extendMarkdownIt(md: any) {
      return md.use(customTaskListsPlugin);
    }
  };
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
      label: "a. Insert timestamp",
      description: "Choose full timestamp, date only, or time only",
      command: "markdownRefactor.insertTimestamp"
    },
    {
      label: "b. Extract selection to a single Markdown file",
      description: "Move selected text into a new linked .md file",
      command: "markdownRefactor.extractSelectionToFile"
    },
    {
      label: "c. Space CJK, English words, and numbers",
      description: "Add spaces around CJK/full-width text, English words, and numbers",
      command: "markdownRefactor.spaceCjkAndEnglish"
    },
    {
      label: "d. Space CJK, English words, and numbers with punctuation",
      description: "Also separates immediate prefix/suffix punctuation",
      command: "markdownRefactor.spaceCjkAndEnglishWithPunctuation"
    },
    {
      label: "e. Convert punctuation to full width",
      description: "Use CJK/full-width punctuation marks",
      command: "markdownRefactor.convertPunctuationToFullWidth"
    },
    {
      label: "f. Convert punctuation to half width",
      description: "Use English/half-width punctuation marks",
      command: "markdownRefactor.convertPunctuationToHalfWidth"
    },
    {
      label: "g. Cycle task checkbox",
      description: "Replace the task checkbox with the next configured state",
      command: "markdownRefactor.cycleTaskCheckbox"
    },
    {
      label: "h. Unify list format",
      description: "Unify the list marker format for selected lines",
      command: "markdownRefactor.unifyListFormat"
    },
    {
      label: "i. Unify trailing punctuation",
      description: "Unify the ending punctuation for selected lines",
      command: "markdownRefactor.unifyTrailingPunctuation"
    },
    {
      label: "j. Install Markdown Preview Enhanced support",
      description: "Copy task marker preview templates into a .crossnote folder",
      command: "markdownRefactor.installMarkdownPreviewEnhancedSupport"
    }
  ];

  const quickPick = vscode.window.createQuickPick<RefactorAction>();
  quickPick.items = actions;
  quickPick.placeholder = "Choose a Markdown refactor action (type a letter to execute)";

  quickPick.onDidChangeValue(value => {
    const match = value.trim().toLowerCase().match(/^([a-j])$/);
    if (match) {
      const action = actions.find(a => a.label.startsWith(match[1] + "."));
      if (action) {
        quickPick.hide();
        vscode.commands.executeCommand(action.command);
        quickPick.dispose();
      }
    }
  });

  quickPick.onDidAccept(() => {
    const selection = quickPick.selectedItems[0];
    if (selection) {
      quickPick.hide();
      vscode.commands.executeCommand(selection.command);
    }
    quickPick.dispose();
  });

  quickPick.onDidHide(() => quickPick.dispose());
  quickPick.show();
}

async function insertTimestamp() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  if (document.languageId !== "markdown") {
    vscode.window.showWarningMessage("Open a Markdown file before inserting a timestamp.");
    return;
  }

  const formats: TimestampFormatItem[] = [
    {
      label: "Date only",
      description: "2026-01-02",
      format: "date"
    },
    {
      label: "Time only",
      description: "13:14:15",
      format: "time"
    },
    {
      label: "Full timestamp",
      description: "2026-01-02 13:14:15",
      format: "datetime"
    },
  ];

  const selection = await vscode.window.showQuickPick(formats, {
    placeHolder: "Choose timestamp format"
  });
  if (!selection) {
    return;
  }

  const timestamp = formatTimestamp(new Date(), selection.format);
  await editor.edit((editBuilder) => {
    for (const selection of editor.selections) {
      editBuilder.replace(selection, timestamp);
    }
  });
}

function formatTimestamp(date: Date, format: TimestampFormat): string {
  const datePart = [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
  const timePart = [pad2(date.getHours()), pad2(date.getMinutes()), pad2(date.getSeconds())].join(":");

  if (format === "date") {
    return datePart;
  }

  if (format === "time") {
    return timePart;
  }

  return datePart + " " + timePart;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
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

  const originalSelection = editor.selection;
  const selectedText = document.getText(originalSelection);
  if (!selectedText.trim()) {
    vscode.window.showWarningMessage("The selection is empty.");
    return;
  }

  const suggestedName = suggestTargetPath(document, originalSelection, selectedText);
  const inputName = await vscode.window.showInputBox({
    prompt: "New Markdown path, relative to the current file",
    value: suggestedName,
    validateInput: async (value) => validateTargetPath(document.uri, value)
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
    editBuilder.replace(originalSelection, replacement);
  });

  await document.save();
  await vscode.window.showTextDocument(targetUri);
}

async function spaceCjkAndEnglish() {
  await formatCurrentMarkdownText(spaceBasicMixedWidthText, "No CJK/English/number spacing changes needed.");
}

async function spaceCjkAndEnglishWithPunctuation() {
  await formatCurrentMarkdownText(
    spacePunctuationAwareMixedWidthText,
    "No CJK/English/number punctuation spacing changes needed."
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

async function installMarkdownPreviewEnhancedSupport(context: vscode.ExtensionContext) {
  const targetRoot = await pickCrossnoteInstallTarget();
  if (!targetRoot) {
    return;
  }

  const targetDirectory = vscode.Uri.file(path.join(targetRoot, ".crossnote"));
  const existingFiles: string[] = [];
  for (const fileName of mpeCrossnoteTemplateFiles) {
    if (await fileExists(vscode.Uri.joinPath(targetDirectory, fileName))) {
      existingFiles.push(fileName);
    }
  }

  if (existingFiles.length > 0) {
    const choice = await vscode.window.showWarningMessage(
      `Overwrite existing Markdown Preview Enhanced files in ${targetDirectory.fsPath}: ${existingFiles.join(", ")}?`,
      { modal: true },
      "Overwrite"
    );

    if (choice !== "Overwrite") {
      return;
    }
  }

  await vscode.workspace.fs.createDirectory(targetDirectory);
  for (const fileName of mpeCrossnoteTemplateFiles) {
    const sourceUri = vscode.Uri.joinPath(context.extensionUri, mpeCrossnoteTemplateDirectory, fileName);
    const targetUri = vscode.Uri.joinPath(targetDirectory, fileName);
    const content = await vscode.workspace.fs.readFile(sourceUri);
    await vscode.workspace.fs.writeFile(targetUri, content);
  }

  vscode.window.showInformationMessage(
    `Installed Markdown Preview Enhanced support in ${targetDirectory.fsPath}. Reload the MPE preview to apply it.`
  );
}

async function pickCrossnoteInstallTarget(): Promise<string | undefined> {
  const targets = new Map<string, CrossnoteInstallTarget>();
  const activeDocument = vscode.window.activeTextEditor?.document;

  if (activeDocument && activeDocument.uri.scheme === "file" && !activeDocument.isUntitled) {
    const activeDirectory = path.dirname(activeDocument.uri.fsPath);
    targets.set(activeDirectory, {
      label: "Current file folder",
      description: activeDirectory,
      fsPath: activeDirectory
    });
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    targets.set(folder.uri.fsPath, {
      label: `Workspace: ${folder.name}`,
      description: folder.uri.fsPath,
      fsPath: folder.uri.fsPath
    });
  }

  const items = [...targets.values()];
  if (items.length === 0) {
    vscode.window.showWarningMessage(
      "Open a Markdown file or workspace folder before installing Markdown Preview Enhanced support."
    );
    return undefined;
  }

  const selection = await vscode.window.showQuickPick(items, {
    placeHolder: "Install Markdown Preview Enhanced support into which folder?"
  });

  return selection?.fsPath;
}

async function cycleTaskCheckbox() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  if (document.languageId !== "markdown") {
    vscode.window.showWarningMessage("Open a Markdown file before cycling a task checkbox.");
    return;
  }

  const cycle = getCheckboxCycle();
  if (!cycle) {
    vscode.window.showWarningMessage(
      "Configure markdownRefactor.checkboxCycle as at least two unique markers, such as \u2B1C, \u23F3, \u2705, \u274C, \u2757."
    );
    return;
  }

  const activeLines = new Map<number, vscode.Selection>();
  for (const selection of editor.selections) {
    if (!activeLines.has(selection.active.line)) {
      activeLines.set(selection.active.line, selection);
    }
  }

  const replacements: Array<{ range: vscode.Range; value: string }> = [];
  for (const [lineNumber] of activeLines) {
    const line = document.lineAt(lineNumber);
    const replacement = makeTaskMarkerReplacement(line.text, lineNumber, cycle);
    if (replacement) {
      replacements.push(replacement);
    }
  }

  if (replacements.length === 0) {
    vscode.window.showWarningMessage("Place the cursor on a Markdown list item or task marker.");
    return;
  }

  await editor.edit((editBuilder) => {
    for (const { range, value } of replacements) {
      editBuilder.replace(range, value);
    }
  });
}

function makeTaskMarkerReplacement(
  lineText: string,
  lineNumber: number,
  cycle: string[]
): { range: vscode.Range; value: string } | undefined {
  const prefixMatch = lineText.match(taskLinePrefixPattern);
  if (!prefixMatch) {
    return undefined;
  }

  const markerStart = prefixMatch[0].length;
  const legacyMatch = findTaskCheckboxTokenAt(lineText, markerStart, legacyCheckboxCycle);
  if (legacyMatch) {
    return makeCycleReplacement(lineNumber, legacyMatch, legacyCheckboxCycle, lineText);
  }

  const configuredMatch = findTaskCheckboxTokenAt(lineText, markerStart, cycle);
  if (configuredMatch) {
    return makeCycleReplacement(lineNumber, configuredMatch, cycle, lineText);
  }

  const defaultEmojiMatch = findTaskCheckboxTokenAt(lineText, markerStart, defaultCheckboxCycle);
  if (defaultEmojiMatch) {
    return makeCycleReplacement(lineNumber, defaultEmojiMatch, defaultCheckboxCycle, lineText);
  }

  const activationCycle = isLegacyCheckboxCycle(cycle) ? defaultCheckboxCycle : cycle;
  return {
    range: new vscode.Range(lineNumber, markerStart, lineNumber, markerStart),
    value: `${activationCycle[0]} `
  };
}

function makeCycleReplacement(
  lineNumber: number,
  match: CheckboxTokenMatch,
  cycle: string[],
  lineText: string
): { range: vscode.Range; value: string } | undefined {
  const cycleIndex = getCheckboxCycleIndex(cycle, match.token);
  if (cycleIndex === -1) {
    return undefined;
  }

  if (cycle !== legacyCheckboxCycle && cycleIndex === cycle.length - 1) {
    let end = match.end;
    if (end < lineText.length && lineText.charAt(end) === " ") {
      end++;
    }
    return {
      range: new vscode.Range(lineNumber, match.start, lineNumber, end),
      value: ""
    };
  }

  return {
    range: new vscode.Range(lineNumber, match.start, lineNumber, match.end),
    value: cycle[(cycleIndex + 1) % cycle.length]
  };
}

function isLegacyCheckboxCycle(cycle: string[]): boolean {
  return cycle.length === legacyCheckboxCycle.length && cycle.every((token, index) => token === legacyCheckboxCycle[index]);
}

function getCheckboxCycle(): string[] | undefined {
  const config = vscode.workspace.getConfiguration("markdownRefactor");
  const configuredCycle = config.get<unknown>("checkboxCycle", defaultCheckboxCycle);
  if (!Array.isArray(configuredCycle)) {
    return undefined;
  }

  const cycle = configuredCycle.filter((value): value is string => typeof value === "string" && value.length > 0);
  const uniqueCycle = [...new Set(cycle)];
  if (uniqueCycle.length !== cycle.length || uniqueCycle.length < 2) {
    return undefined;
  }

  if (uniqueCycle.some((value) => !checkboxTokenPattern.test(value))) {
    return undefined;
  }

  return uniqueCycle;
}

function findTaskCheckboxToken(lineText: string, cycle: string[]): CheckboxTokenMatch | undefined {
  const prefixMatch = lineText.match(taskLinePrefixPattern);
  if (!prefixMatch) {
    return undefined;
  }

  return findTaskCheckboxTokenAt(lineText, prefixMatch[0].length, cycle);
}

function findTaskCheckboxTokenAt(
  lineText: string,
  markerStart: number,
  cycle: string[]
): CheckboxTokenMatch | undefined {
  const token = getCheckboxSearchTokens(cycle)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => lineText.startsWith(candidate, markerStart));
  if (!token) {
    return undefined;
  }

  return {
    token,
    start: markerStart,
    end: markerStart + token.length
  };
}

function findAnyTaskCheckboxToken(lineText: string, cycles: string[][]): CheckboxTokenMatch | undefined {
  const prefixMatch = lineText.match(taskLinePrefixPattern);
  if (!prefixMatch) {
    return undefined;
  }

  const markerStart = prefixMatch[0].length;
  for (const cycle of cycles) {
    const match = findTaskCheckboxTokenAt(lineText, markerStart, cycle);
    if (match) {
      return match;
    }
  }

  return undefined;
}

function getCheckboxSearchTokens(cycle: string[]): string[] {
  const tokens = [...cycle];
  if (cycle.includes("[x]") && !tokens.includes("[X]")) {
    tokens.push("[X]");
  }

  return tokens;
}

function getCheckboxCycleIndex(cycle: string[], token: string): number {
  const exactIndex = cycle.indexOf(token);
  if (exactIndex !== -1) {
    return exactIndex;
  }

  if (token === "[X]") {
    return cycle.indexOf("[x]");
  }

  return -1;
}
function initializeCheckboxDecorations(context: vscode.ExtensionContext) {
  const decorationOptions: Record<CheckboxDecorationKind, vscode.DecorationRenderOptions> = {
    todo: {
      color: "#8b949e",
      backgroundColor: "rgba(139, 148, 158, 0.16)",
      border: "1px solid rgba(139, 148, 158, 0.45)",
      borderRadius: "3px",
      fontWeight: "700"
    },
    progress: {
      color: "#d29922",
      backgroundColor: "rgba(210, 153, 34, 0.18)",
      border: "1px solid rgba(210, 153, 34, 0.45)",
      borderRadius: "3px",
      fontWeight: "700"
    },
    cancelled: {
      color: "#f85149",
      backgroundColor: "rgba(248, 81, 73, 0.14)",
      border: "1px solid rgba(248, 81, 73, 0.42)",
      borderRadius: "3px",
      fontWeight: "700",
      textDecoration: "line-through"
    },
    done: {
      color: "#3fb950",
      backgroundColor: "rgba(63, 185, 80, 0.16)",
      border: "1px solid rgba(63, 185, 80, 0.45)",
      borderRadius: "3px",
      fontWeight: "700"
    },
    important: {
      color: "#ff7b72",
      backgroundColor: "rgba(255, 123, 114, 0.18)",
      border: "1px solid rgba(255, 123, 114, 0.48)",
      borderRadius: "3px",
      fontWeight: "700"
    },
    custom: {
      color: "#79c0ff",
      backgroundColor: "rgba(121, 192, 255, 0.16)",
      border: "1px solid rgba(121, 192, 255, 0.45)",
      borderRadius: "3px",
      fontWeight: "700"
    }
  };

  for (const [kind, options] of Object.entries(decorationOptions) as Array<[CheckboxDecorationKind, vscode.DecorationRenderOptions]>) {
    const decorationType = vscode.window.createTextEditorDecorationType({
      ...options,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    checkboxDecorationTypes.set(kind, decorationType);
    context.subscriptions.push(decorationType);
  }
}

function updateVisibleCheckboxDecorations() {
  for (const editor of vscode.window.visibleTextEditors) {
    updateCheckboxDecorations(editor);
  }
}

function updateCheckboxDecorations(editor: vscode.TextEditor) {
  if (editor.document.languageId !== "markdown" || !isCheckboxDecorationEnabled()) {
    clearCheckboxDecorations(editor);
    return;
  }

  const cycle = getCheckboxCycle();
  if (!cycle) {
    clearCheckboxDecorations(editor);
    return;
  }

  const rangesByKind = new Map<CheckboxDecorationKind, vscode.Range[]>();
  for (const kind of checkboxDecorationTypes.keys()) {
    rangesByKind.set(kind, []);
  }

  for (let lineNumber = 0; lineNumber < editor.document.lineCount; lineNumber += 1) {
    const line = editor.document.lineAt(lineNumber);
    const match = findAnyTaskCheckboxToken(line.text, [legacyCheckboxCycle, cycle, defaultCheckboxCycle]);
    if (!match) {
      continue;
    }

    if (isEmojiCheckboxToken(match.token)) {
      continue;
    }

    const kind = getCheckboxDecorationKind(match.token);
    rangesByKind.get(kind)?.push(new vscode.Range(lineNumber, match.start, lineNumber, match.end));
  }

  for (const [kind, decorationType] of checkboxDecorationTypes) {
    editor.setDecorations(decorationType, rangesByKind.get(kind) ?? []);
  }
}

function clearCheckboxDecorations(editor: vscode.TextEditor) {
  for (const decorationType of checkboxDecorationTypes.values()) {
    editor.setDecorations(decorationType, []);
  }
}

function isCheckboxDecorationEnabled(): boolean {
  const config = vscode.workspace.getConfiguration("markdownRefactor");
  return config.get<boolean>("decorateCheckboxes", true);
}

function isEmojiCheckboxToken(token: string): boolean {
  return emojiMarkerPattern.test(token);
}

function getCheckboxDecorationKind(token: string): CheckboxDecorationKind {
  switch (token) {
    case "[ ]":
      return "todo";
    case "[/]":
      return "progress";
    case "[-]":
      return "cancelled";
    case "[x]":
    case "[X]":
      return "done";
    case "[!]":
      return "important";
    default:
      return "custom";
  }
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
    vscode.window.showWarningMessage("Open a Markdown file before spacing CJK, English, and number text.");
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
  const sourceDirectory = path.dirname(sourceUri.fsPath);
  const targetUri = resolveTargetUri(sourceUri, inputName);
  const targetPath = targetUri.fsPath;

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
  return targetUri;
}

function resolveTargetUri(sourceUri: vscode.Uri, inputName: string): vscode.Uri {
  const normalizedName = /\.md$/i.test(inputName.trim())
    ? inputName.trim()
    : `${inputName.trim()}.md`;
  return vscode.Uri.file(path.resolve(path.dirname(sourceUri.fsPath), normalizedName));
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
    .replace(cjkBeforeHalfWidthText, "$1 $2")
    .replace(halfWidthTextBeforeCjk, "$1 $2")
    .replace(numericRunBeforeEnglishWord, "$1 $2");
}

function spacePunctuationAwareMixedWidthText(value: string): string {
  return spaceBasicMixedWidthText(value)
    .replace(halfWidthPunctuationBeforeWordNearFullWidth, "$1 $2")
    .replace(fullWidthBeforeEnglishWord, "$1 $2")
    .replace(englishWordBeforeFullWidth, "$1 $2");
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

function suggestTargetPath(
  document: vscode.TextDocument,
  selection: vscode.Selection,
  selectedText: string
): string {
  const config = vscode.workspace.getConfiguration("markdownRefactor");
  const configuredDirectory = config
    .get<string>("defaultDirectory", "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  const sourceBaseName = path.basename(document.uri.fsPath, path.extname(document.uri.fsPath));
  const directoryName = makeFileNamePart(sourceBaseName, false) || "extracted";
  const contextTitle = findNearestMarkdownTitle(document, selection.start.line - 1);
  const selectedTitle = selectedText
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:#{1,6}|[-+*]|\d+[.)])\s+/, "").trim())
    .find(Boolean);
  const fileName = makeFileNamePart(contextTitle ?? selectedTitle ?? "Extracted Note") || "Extracted Note";

  return [configuredDirectory, directoryName, `${fileName}.md`].filter(Boolean).join("/");
}

function findNearestMarkdownTitle(document: vscode.TextDocument, startLine: number): string | undefined {
  for (let lineNumber = startLine; lineNumber >= 0; lineNumber--) {
    const line = document.lineAt(lineNumber).text.replace(/^(?:\s*>\s*)+/, "");
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      return heading[1];
    }

    const listItem = line.match(/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[^\]\r\n]*\]\s+)?(.+?)\s*$/);
    if (listItem) {
      return listItem[1];
    }
  }

  return undefined;
}

function makeFileNamePart(value: string, titleCase = true): string {
  const cleaned = value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_~]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80)
    .trim();
  const normalized = titleCase
    ? cleaned
        .toLocaleLowerCase()
        .replace(/(^|[\s-])(\p{L})/gu, (_match, prefix: string, letter: string) => {
          return prefix + letter.toLocaleUpperCase();
        })
    : cleaned;

  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(normalized)
    ? `${normalized} Note`
    : normalized;
}

function titleFromFileName(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function validateFileName(value: string): string | undefined {
  if (!value.trim()) {
    return "Enter a Markdown path.";
  }

  const parts = value.trim().split(/[\\/]/);
  if (parts.some((part) => !part)) {
    return "Path folders and file name cannot be empty.";
  }

  if (parts.some((part) => /[<>:"|?*\u0000-\u001F]/.test(part))) {
    return "Path names cannot contain < > : \" | ? *";
  }

  if (parts.some((part) => part !== "." && part !== ".." && /[. ]$/.test(part))) {
    return "Path names cannot end with a dot or space.";
  }

  const filePart = parts[parts.length - 1].replace(/\.md$/i, "");
  if (!filePart || filePart === "." || filePart === "..") {
    return "Enter a Markdown file name.";
  }

  if (parts.some((part) => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    return "That path contains a reserved Windows file name.";
  }

  return undefined;
}

async function validateTargetPath(
  sourceUri: vscode.Uri,
  value: string
): Promise<string | vscode.InputBoxValidationMessage | undefined> {
  const invalidMessage = validateFileName(value);
  if (invalidMessage) {
    return invalidMessage;
  }

  const targetUri = resolveTargetUri(sourceUri, value);
  if (await fileExists(targetUri)) {
    const relativePath = path
      .relative(path.dirname(sourceUri.fsPath), targetUri.fsPath)
      .replace(/\\/g, "/");
    return {
      message: `${relativePath} already exists and will require overwrite confirmation.`,
      severity: vscode.InputBoxValidationSeverity.Warning
    };
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

function customTaskListsPlugin(md: any) {
  md.core.ruler.after("inline", "custom-task-lists", (state: any) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type !== "inline") {
        continue;
      }

      // The VS Code built-in markdown-it-task-lists plugin runs before our plugin.
      // It converts `[ ]` and `[x]` into `<input type="checkbox">` html_inline tokens.
      if (token.children && token.children.length > 0) {
        const pOpen = tokens[i - 1];
        if (!pOpen || pOpen.type !== "paragraph_open") continue;

        let liOpenIndex = i - 2;
        while (liOpenIndex >= 0 && tokens[liOpenIndex].type !== "list_item_open") {
          liOpenIndex--;
        }
        const liOpen = tokens[liOpenIndex];
        if (!liOpen || liOpen.type !== "list_item_open") continue;

        const firstChild = token.children[0];

        // Case 1: Already processed by markdown-it-task-lists
        if (firstChild.type === "html_inline" && firstChild.content.includes('type="checkbox"')) {
          const isChecked = firstChild.content.includes("checked");
          const marker = isChecked ? "x" : " ";
          const className = isChecked ? "done" : "todo";
          
          firstChild.content = `<span class="task-list-item-checkbox custom-checkbox ${className}">${marker}</span>`;
          continue;
        }

        // Case 2: Unprocessed text (custom markers)
        if (firstChild.type === "text") {
          const textContent = firstChild.content;
          
          const cycle = getCheckboxCycle() || defaultCheckboxCycle;
          const allMarkers = [...new Set([...legacyCheckboxCycle, ...cycle, ...defaultCheckboxCycle])];
          if (!allMarkers.includes("[X]")) allMarkers.push("[X]");

          let matchedMarker: string | undefined;
          let matchLength = 0;
          let isEmoji = false;

          for (const marker of allMarkers) {
            if (textContent.startsWith(marker + " ") || textContent.startsWith(marker + "\t")) {
              matchedMarker = marker;
              matchLength = marker.length + 1;
              isEmoji = !marker.startsWith("[");
              break;
            }
          }
          
          if (matchedMarker) {
            firstChild.content = textContent.slice(matchLength);

            const checkboxToken = new state.Token("html_inline", "", 0);
            
            if (isEmoji) {
              checkboxToken.content = `<span class="task-list-item-checkbox custom-checkbox emoji-checkbox">${matchedMarker}</span>`;
            } else {
              let className = getCheckboxDecorationKind(matchedMarker);
              const innerText = matchedMarker.length >= 3 ? matchedMarker.slice(1, -1) : matchedMarker;
              checkboxToken.content = `<span class="task-list-item-checkbox custom-checkbox ${className}">${innerText}</span>`;
            }
            token.children.unshift(checkboxToken);
            
            let classAttrIndex = liOpen.attrIndex("class");
            if (classAttrIndex < 0) {
              liOpen.attrPush(["class", "task-list-item"]);
            } else {
              const classAttr = liOpen.attrs[classAttrIndex];
              if (!classAttr[1].includes("task-list-item")) {
                classAttr[1] = (classAttr[1] + " task-list-item").trim();
              }
            }

            // Also add contains-task-list to the parent list so the bullet is hidden
            let listOpenIndex = liOpenIndex - 1;
            while (listOpenIndex >= 0 && tokens[listOpenIndex].type !== "bullet_list_open" && tokens[listOpenIndex].type !== "ordered_list_open") {
              listOpenIndex--;
            }
            if (listOpenIndex >= 0) {
              const listOpen = tokens[listOpenIndex];
              let listClassAttrIndex = listOpen.attrIndex("class");
              if (listClassAttrIndex < 0) {
                listOpen.attrPush(["class", "contains-task-list"]);
              } else {
                const listClassAttr = listOpen.attrs[listClassAttrIndex];
                if (!listClassAttr[1].includes("contains-task-list")) {
                  listClassAttr[1] = (listClassAttr[1] + " contains-task-list").trim();
                }
              }
            }
          }
        }
      }
    }
  });
}

async function unifyListFormat() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  if (document.languageId !== "markdown") {
    vscode.window.showWarningMessage("Open a Markdown file before running this command.");
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showInformationMessage("Select some lines to unify their list format.");
    return;
  }

  const newMarker = await vscode.window.showInputBox({
    prompt: "Enter the new list marker (e.g., '-', '+', '*', '1.', '#')",
    placeHolder: "-",
  });

  if (newMarker === undefined) {
    return;
  }

  const markerStr = newMarker.trim();

  await editor.edit((editBuilder) => {
    const startLine = selection.start.line;
    const endLine = selection.end.line;

    for (let i = startLine; i <= endLine; i++) {
      const line = document.lineAt(i);
      const text = line.text;
      
      const match = text.match(/^(\s*)([-+*]|\d+[\.)]|#+)(\s+)(.*)$/);
      
      if (match) {
        const replacement = markerStr ? `${match[1]}${markerStr}${match[3]}${match[4]}` : `${match[1]}${match[4]}`;
        editBuilder.replace(line.range, replacement);
      } else if (text.trim().length > 0 && markerStr) {
        const wsMatch = text.match(/^(\s*)(.*)$/);
        if (wsMatch) {
          const replacement = `${wsMatch[1]}${markerStr} ${wsMatch[2]}`;
          editBuilder.replace(line.range, replacement);
        }
      }
    }
  });
}

async function unifyTrailingPunctuation() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  if (document.languageId !== "markdown") {
    vscode.window.showWarningMessage("Open a Markdown file before running this command.");
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showInformationMessage("Select some lines to unify their trailing punctuation.");
    return;
  }

  const puncStr = await vscode.window.showInputBox({
    prompt: "Enter trailing punctuation (e.g. '.', ';', ',.'，'，。')",
  });

  if (puncStr === undefined) {
    return;
  }

  const chars = Array.from(puncStr.trim());
  let normalPunc = "";
  let lastPunc = "";

  if (chars.length === 0) {
    normalPunc = "";
    lastPunc = "";
  } else if (chars.length === 1) {
    normalPunc = chars[0];
    lastPunc = chars[0];
  } else {
    normalPunc = chars[0];
    lastPunc = chars[1];
  }

  const trailingPuncRegex = /[.,;:!?。，；：！？]+(\s*)$/;

  await editor.edit((editBuilder) => {
    const startLine = selection.start.line;
    const endLine = selection.end.line;

    for (let i = startLine; i <= endLine; i++) {
      const line = document.lineAt(i);
      const text = line.text;
      
      if (text.trim().length === 0) {
        continue;
      }

      const targetPunc = i === endLine ? lastPunc : normalPunc;

      const match = text.match(trailingPuncRegex);
      if (match) {
        const trailingWs = match[1];
        const baseText = text.substring(0, match.index);
        editBuilder.replace(line.range, `${baseText}${targetPunc}${trailingWs}`);
      } else {
        const wsMatch = text.match(/(\s*)$/);
        if (wsMatch) {
          const trailingWs = wsMatch[1];
          const baseText = text.substring(0, text.length - trailingWs.length);
          editBuilder.replace(line.range, `${baseText}${targetPunc}${trailingWs}`);
        } else {
          editBuilder.replace(line.range, `${text}${targetPunc}`);
        }
      }
    }
  });
}

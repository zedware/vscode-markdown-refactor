import * as path from "path";
import * as vscode from "vscode";

type LinkStyle = "markdown" | "embed" | "wiki";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "markdownRefactor.extractSelectionToFile",
    extractSelectionToFile
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}

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

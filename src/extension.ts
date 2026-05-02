import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { spawn } from "child_process";
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;
let runTerminal: vscode.Terminal | undefined;
let outputChannel: vscode.OutputChannel | undefined;

function out(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel("Kinal");
    }
    return outputChannel;
}

function isWindows(): boolean {
    return process.platform === "win32";
}

function serverExecutableName(): string {
    return isWindows() ? "kinal-lsp-server.exe" : "kinal-lsp-server";
}

function pushExecutableVariants(candidates: string[], candidate: string) {
    if (!candidate || candidate.trim().length === 0) {
        return;
    }
    candidates.push(candidate);
    if (isWindows() && path.extname(candidate).toLowerCase() !== ".exe") {
        candidates.push(`${candidate}.exe`);
    }
}

function resolveServerPath(context: vscode.ExtensionContext): string {
    const cfg = vscode.workspace.getConfiguration("kinal");
    const configured = cfg.get<string>("serverPath", serverExecutableName());
    const candidates: string[] = [];

    if (configured && configured.trim().length > 0) {
        if (path.isAbsolute(configured)) {
            pushExecutableVariants(candidates, configured);
        } else {
            const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (ws) {
                pushExecutableVariants(candidates, path.join(ws, configured));
            }
            pushExecutableVariants(candidates, path.join(context.extensionPath, configured));
        }
    }

    const envServer = process.env.KINAL_LSP_SERVER ?? "";
    if (envServer.trim().length > 0) {
        pushExecutableVariants(candidates, envServer);
    }

    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (ws) {
        pushExecutableVariants(candidates, path.join(ws, "kinal-lsp", "server", "build-clang", serverExecutableName()));
        pushExecutableVariants(candidates, path.join(ws, "kinal-lsp", "server", "build-clang-release", serverExecutableName()));
        pushExecutableVariants(candidates, path.join(ws, "kinal-lsp", "server", "build", serverExecutableName()));
    }

    pushExecutableVariants(candidates, path.join(context.extensionPath, "..", "..", "..", "kinal-lsp", "server", "build-clang", serverExecutableName()));
    pushExecutableVariants(candidates, path.join(context.extensionPath, "..", "..", "..", "kinal-lsp", "server", "build-clang-release", serverExecutableName()));
    pushExecutableVariants(candidates, path.join(context.extensionPath, "..", "..", "kinal-lsp-server"));
    pushExecutableVariants(candidates, path.join(context.extensionPath, "..", "kinal-lsp-server"));

    for (const c of candidates) {
        if (c && fs.existsSync(c)) {
            return c;
        }
    }

    return serverExecutableName();
}

function compilerExecutableName(): string {
    return isWindows() ? "kinal.exe" : "kinal";
}

function resolveCompilerPath(context: vscode.ExtensionContext): string {
    const configured = vscode.workspace.getConfiguration("kinal").get<string>("path", compilerExecutableName());
    const candidates: string[] = [];

    if (configured && configured.trim().length > 0) {
        if (path.isAbsolute(configured)) {
            pushExecutableVariants(candidates, configured);
        } else {
            const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (ws) {
                pushExecutableVariants(candidates, path.join(ws, configured));
            }
            pushExecutableVariants(candidates, path.join(context.extensionPath, configured));
        }
    }

    const envCompiler = process.env.KINAL_COMPILER ?? "";
    if (envCompiler.trim().length > 0) {
        pushExecutableVariants(candidates, envCompiler);
    }

    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (ws) {
        pushExecutableVariants(candidates, path.join(ws, "build", compilerExecutableName()));
    }
    pushExecutableVariants(candidates, path.join(context.extensionPath, "..", "..", "kinal"));
    pushExecutableVariants(candidates, path.join(context.extensionPath, "..", "..", "kinal.exe"));
    pushExecutableVariants(candidates, path.join(context.extensionPath, "..", "..", "..", "build", compilerExecutableName()));

    for (const c of candidates) {
        if (c && fs.existsSync(c)) {
            return c;
        }
    }

    return compilerExecutableName();
}

function getDefaultLinker(): string {
    return vscode.workspace.getConfiguration("kinal").get<string>("defaultLinker", "lld");
}

function getLinkerPath(): string {
    return vscode.workspace.getConfiguration("kinal").get<string>("linkerPath", "");
}

function resolveDiagnosticsLanguage(): string {
    const cfg = vscode.workspace.getConfiguration("kinal");
    const v = (cfg.get<string>("diagnosticsLanguage", "en") || "en").toLowerCase();
    if (v === "zh") {
        return "zh";
    }
    if (v === "auto") {
        const ui = (vscode.env.language || "en").toLowerCase();
        return ui.startsWith("zh") ? "zh" : "en";
    }
    return "en";
}

function resolveCompilerLanguage(): string {
    const cfg = vscode.workspace.getConfiguration("kinal");
    const v = (cfg.get<string>("compilerLanguage", "auto") || "auto").toLowerCase();
    if (v === "zh") {
        return "zh";
    }
    if (v === "auto") {
        const ui = (vscode.env.language || "en").toLowerCase();
        return ui.startsWith("zh") ? "zh" : "en";
    }
    return "en";
}

function getLocaleFile(): string {
    const v = vscode.workspace.getConfiguration("kinal").get<string>("localeFile", "") || "";
    return v.trim();
}

function fileExtLower(file: string): string {
    return path.extname(file).toLowerCase();
}

function isKinalSourceFile(file: string): boolean {
    const ext = fileExtLower(file);
    return ext === ".kn" || ext === ".kinal";
}

function isKinalProjectFile(file: string): boolean {
    return fileExtLower(file) === ".knproj";
}

function ensureRunTerminal(cwd: string): vscode.Terminal {
    if (!runTerminal) {
        // Reuse an existing terminal if one is already open (e.g. after extension reload).
        runTerminal = vscode.window.terminals.find((t) => t.name === "Kinal Run");
    }
    if (runTerminal) {
        return runTerminal;
    }

    const name = "Kinal Run";
    runTerminal = isWindows()
        ? vscode.window.createTerminal({ name, cwd, shellPath: "powershell.exe", shellArgs: ["-NoLogo"] })
        : vscode.window.createTerminal({ name, cwd });
    return runTerminal;
}

async function runProcess(exe: string, args: string[], cwd: string): Promise<number> {
    const ch = out();
    return await new Promise<number>((resolve) => {
        let done = false;
        const p = spawn(exe, args, { cwd, shell: false, windowsHide: true });
        p.stdout.on("data", (d) => ch.append(d.toString()));
        p.stderr.on("data", (d) => ch.append(d.toString()));
        p.on("error", (err) => {
            if (done) return;
            done = true;
            ch.appendLine(String(err));
            resolve(-1);
        });
        p.on("close", (code) => {
            if (done) return;
            done = true;
            resolve(code ?? -1);
        });
    });
}

async function runProcessText(exe: string, args: string[], cwd: string, stdinText: string): Promise<{ code: number; stdout: string; stderr: string; }> {
    return await new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let done = false;
        const p = spawn(exe, args, { cwd, shell: false, windowsHide: true });
        p.stdout.on("data", (d) => { stdout += d.toString(); });
        p.stderr.on("data", (d) => { stderr += d.toString(); });
        p.on("error", (err) => {
            if (done) {
                return;
            }
            done = true;
            resolve({ code: -1, stdout, stderr: `${stderr}${String(err)}` });
        });
        p.on("close", (code) => {
            if (done) {
                return;
            }
            done = true;
            resolve({ code: code ?? -1, stdout, stderr });
        });
        if (stdinText.length > 0) {
            p.stdin.write(stdinText);
        }
        p.stdin.end();
    });
}

async function formatDocumentWithCompiler(context: vscode.ExtensionContext, document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    const compiler = resolveCompilerPath(context);
    const virtualPath = document.uri.fsPath && document.uri.fsPath.length > 0
        ? document.uri.fsPath
        : `${document.fileName || "untitled.kn"}`;
    const ws = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath
        ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        ?? context.extensionPath;
    const cwd = ws;
    const args = ["fmt", "--stdin", "--stdout", "--stdin-filepath", virtualPath];
    const result = await runProcessText(compiler, args, cwd, document.getText());
    if (result.code !== 0) {
        const ch = out();
        ch.appendLine([compiler, ...args].join(" "));
        if (result.stderr.trim().length > 0) {
            ch.append(result.stderr);
            if (!result.stderr.endsWith("\n")) {
                ch.appendLine("");
            }
        }
        if (result.stdout.trim().length > 0) {
            ch.append(result.stdout);
            if (!result.stdout.endsWith("\n")) {
                ch.appendLine("");
            }
        }
        ch.show(true);
        throw new Error(result.stderr.trim().length > 0 ? result.stderr.trim() : "kinal fmt failed");
    }

    const current = document.getText();
    if (result.stdout === current) {
        return [];
    }

    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(current.length));
    return [vscode.TextEdit.replace(fullRange, result.stdout)];
}

async function compileAndRunProjectFile(context: vscode.ExtensionContext, file: string) {
    const projectDir = path.dirname(file);
    const compiler = resolveCompilerPath(context);
    const lang = resolveCompilerLanguage();
    const args: string[] = ["run", "--project", projectDir, "--lang", lang];

    const ch = out();
    ch.clear();
    ch.appendLine([compiler, ...args].join(" "));

    const rc = await runProcess(compiler, args, projectDir);
    if (rc !== 0) {
        void vscode.commands.executeCommand("workbench.actions.view.problems");
        vscode.window.showErrorMessage("Project run failed.");
        return;
    }

    ch.show(true);
}

async function compileAndRunActiveFile(context: vscode.ExtensionContext) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor.");
        return;
    }

    if (editor.document.isDirty) {
        await editor.document.save();
    }

    const file = editor.document.uri.fsPath;
    if (isKinalProjectFile(file)) {
        await compileAndRunProjectFile(context, file);
        return;
    }

    if (editor.document.languageId !== "kinal" || !isKinalSourceFile(file)) {
        vscode.window.showErrorMessage("Active editor is not a Kinal source file.");
        return;
    }

    const parsed = path.parse(file);
    const suffix = isWindows() ? ".exe" : "";
    const output = path.join(parsed.dir, `${parsed.name}${suffix}`);

    const compiler = resolveCompilerPath(context);
    const linker = getDefaultLinker();
    const linkerPath = getLinkerPath();
    const lang = resolveCompilerLanguage();

    const args: string[] = ["build", file, "-o", output, "--linker", linker];
    if (linkerPath.trim().length > 0) {
        args.push("--linker-path", linkerPath);
    }
    args.push("--lang", lang);

    const ch = out();
    ch.clear();
    ch.appendLine([compiler, ...args].join(" "));

    const rc = await runProcess(compiler, args, parsed.dir);
    if (rc !== 0) {
        void vscode.commands.executeCommand("workbench.actions.view.problems");
        vscode.window.showErrorMessage("Build failed. Not running.");
        return;
    }
    if (!fs.existsSync(output)) {
        vscode.window.showErrorMessage("Build succeeded, but output executable was not found.");
        return;
    }

    const terminal = ensureRunTerminal(parsed.dir);
    terminal.show(true); // preserve editor focus
    if (isWindows()) {
        terminal.sendText(`& ${quote(output)}`);
    } else {
        terminal.sendText(quote(output));
    }
}

function quote(s: string): string {
    if (s.includes(" ") || s.includes("\t")) {
        return `"${s.replace(/"/g, "\\\"")}"`;
    }
    return s;
}

export async function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.window.onDidCloseTerminal((t) => {
        if (runTerminal && t === runTerminal) {
            runTerminal = undefined;
        }
    }));

    const runDisposable = vscode.commands.registerCommand("kinal.runFile", () => compileAndRunActiveFile(context));
    context.subscriptions.push(runDisposable);
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider([{ scheme: "file", language: "kinal" }, { scheme: "untitled", language: "kinal" }], {
            provideDocumentFormattingEdits: async (document) => {
                try {
                    return await formatDocumentWithCompiler(context, document);
                } catch (err) {
                    void vscode.window.showErrorMessage(`Kinal format failed: ${String(err)}`);
                    return [];
                }
            }
        })
    );

    const serverPath = resolveServerPath(context);
    const serverOptions: ServerOptions = {
        run: { command: serverPath, transport: TransportKind.stdio },
        debug: { command: serverPath, transport: TransportKind.stdio }
    };

    // Provide stdlib stubs (e.g. for "Go to Definition" on `Get IO.Console;`).
    const stdlibProvider = vscode.workspace.registerTextDocumentContentProvider("kinal-stdlib", {
        provideTextDocumentContent: async (uri) => {
            const p = uri.path || "";
            const isKlib = p.startsWith("/klib/");
            // For klib URIs, keep the full path (including .kn); for stubs, strip .kn suffix.
            const mod = isKlib
                ? p.replace(/^\/+/, "")
                : p.replace(/^\/+/, "").replace(/\.kn$/i, "");
            if (!client) {
                return `// Language server not ready.\n`;
            }
            try {
                const text = await client.sendRequest<string>("kinal/stdlibText", { module: mod });
                return text || (isKlib ? `// Source not available: ${mod}\n` : `// Unknown stdlib module: ${mod}\n`);
            } catch (e) {
                return `// Failed to load module: ${mod}\n// ${String(e)}\n`;
            }
        }
    });
    context.subscriptions.push(stdlibProvider);

    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(async (doc) => {
        if (doc.uri.scheme !== "kinal-stdlib") return;
        if (doc.languageId === "kinal") return;
        try {
            await vscode.languages.setTextDocumentLanguage(doc, "kinal");
        } catch {
            // ignore
        }
    }));

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: "file", language: "kinal" },
            { scheme: "kinal-stdlib", language: "kinal" }
        ],
        initializationOptions: {
            diagnosticsLanguage: resolveDiagnosticsLanguage(),
            localeFile: getLocaleFile()
        },
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher("**/*.{kn,kinal}"),
            configurationSection: "kinal"
        }
    };

    client = new LanguageClient("kinalLsp", "Kinal Language Server", serverOptions, clientOptions);
    context.subscriptions.push(client);
    void client.start();
}

export async function deactivate(): Promise<void> {
    if (!client) {
        return;
    }
    await client.stop();
}

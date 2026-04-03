# Kinal VSCode Client

[中文说明](./README.zh-CN.md)

This extension provides:
- `.kn` language activation
- Kinal syntax grammar
- LSP client wiring for `kinal-lsp-server`
- `Kinal: Compile And Run` command and editor button

## Settings

- `kinal.path`: path to `kinal.exe`
- `kinal.defaultLinker`: `lld | zig | msvc`
- `kinal.linkerPath`: optional linker executable path
- `kinal.serverPath`: path to LSP server executable

## Build

```powershell
python build.py deps
python build.py package
```

The generated VSIX is written to `dist/`.

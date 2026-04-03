# Kinal VSCode Extension

[中文说明](./README.zh-CN.md)

This extension provides:
- `.kn` / `.kinal` language activation
- Kinal syntax highlighting
- LSP client wiring for `kinal-lsp-server`
- `Kinal: Compile and Run`
- document formatting through `kinal fmt`

Project site:
- [kinal.org](https://kinal.org)

Repository:
- [Kinal-Lang/Kinal-VSCode](https://github.com/Kinal-Lang/Kinal-VSCode)

## Settings
- `kinal.path`: path to `kinal.exe` or `kinal`
- `kinal.defaultLinker`: `lld | zig | msvc`
- `kinal.linkerPath`: optional explicit linker executable path
- `kinal.serverPath`: path to `kinal-lsp-server`

## Build

```powershell
python build.py deps
python build.py compile
python build.py package --clean
```

The generated VSIX is written to `dist/`.

## Version

```powershell
python build.py version get
python build.py version set 0.2.10
python build.py version bump patch
python build.py version bump minor
python build.py version bump major
```

## GitHub Actions
- `CI`: build and package the extension on push and pull request.
- `Version Get`: print the current version to the workflow summary.
- `Version Set`: set an exact `x.y.z` version, commit it, and push to `main`.
- `Version Bump`: bump `patch`, `minor`, or `major`, commit it, and push to `main`.
- `Release`: build the VSIX, create or update a tag, and publish a GitHub Release with optional markdown release notes.

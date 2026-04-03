# Kinal VSCode 插件

[English README](./README.md)

这个插件提供：
- `.kn` / `.kinal` 文件语言激活
- Kinal 语法高亮
- `kinal-lsp-server` 的 LSP 客户端接入
- `Kinal: Compile and Run`
- 通过 `kinal fmt` 实现文档格式化

项目站点：
- [kinal.org](https://kinal.org)

仓库地址：
- [Kinal-Lang/Kinal-VSCode](https://github.com/Kinal-Lang/Kinal-VSCode)

## 设置项
- `kinal.path`：`kinal.exe` 或 `kinal` 的路径
- `kinal.defaultLinker`：默认链接器，`lld | zig | msvc`
- `kinal.linkerPath`：可选的显式链接器路径
- `kinal.serverPath`：`kinal-lsp-server` 的路径

## 构建

```powershell
python build.py deps
python build.py compile
python build.py test
python build.py package --clean
```

生成的 VSIX 位于 `dist/`，同时也会生成对应的 SHA-256 哈希文件。

## 版本

```powershell
python build.py version get
python build.py version set 0.2.10
python build.py version bump patch
python build.py version bump minor
python build.py version bump major
```

## GitHub Actions
- `CI`：在 push 和 pull request 时自动构建并打包插件。
- `Version Get`：手动查看当前版本号，并写入 workflow summary。
- `Version Set`：手动设置精确的 `x.y.z` 版本号，提交并推送到 `main`。
- `Version Bump`：手动累加 `patch`、`minor` 或 `major` 版本号，提交并推送到 `main`。
- `Release`：先跑 smoke 检查，再默认创建新 tag、构建 VSIX、生成 SHA-256 哈希，并带可选的 Markdown 发布说明发布 GitHub Release。
  除非显式启用 `allow_retag`，否则不会覆盖已有 tag。

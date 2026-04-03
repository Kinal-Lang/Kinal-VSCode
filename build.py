#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "out"
DIST_DIR = ROOT / "dist"


def run(cmd: list[str], *, cwd: Path = ROOT) -> None:
    print("+", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(cwd))


def resolve_tool(name: str) -> str:
    tool = shutil.which(name)
    if not tool:
        raise SystemExit(f"required tool not found in PATH: {name}")
    return tool


def package_name() -> str:
    data = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    return f"{data['publisher']}.{data['name']}-{data['version']}.vsix"


def clean_outputs() -> None:
    for path in (OUT_DIR, DIST_DIR):
        if path.exists():
            shutil.rmtree(path)
            print(f"[OK] removed {path}")


def cmd_deps(_: argparse.Namespace) -> int:
    run([resolve_tool("npm"), "ci", "--no-audit", "--no-fund"])
    return 0


def cmd_compile(_: argparse.Namespace) -> int:
    run([resolve_tool("npm"), "run", "compile"])
    return 0


def cmd_package(args: argparse.Namespace) -> int:
    if args.clean:
        clean_outputs()
    run([resolve_tool("npm"), "ci", "--no-audit", "--no-fund"])
    run([resolve_tool("npm"), "run", "compile"])
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DIST_DIR / package_name()
    if out_path.exists():
        out_path.unlink()
    run(
        [
            resolve_tool("npx"),
            "--yes",
            "@vscode/vsce",
            "package",
            "--no-yarn",
            "--allow-missing-repository",
            "--skip-license",
            "--out",
            str(out_path),
        ]
    )
    print(f"[OK] packaged: {out_path}")
    return 0


def cmd_clean(_: argparse.Namespace) -> int:
    clean_outputs()
    return 0


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Build helper for the Kinal VSCode extension")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("deps", help="install npm dependencies")
    sub.add_parser("compile", help="compile the extension")
    pkg = sub.add_parser("package", help="compile and package a VSIX")
    pkg.add_argument("--clean", action="store_true", help="remove old out/dist before packaging")
    sub.add_parser("clean", help="remove build outputs")
    return ap


def main() -> int:
    args = build_parser().parse_args()
    if args.cmd == "deps":
        return cmd_deps(args)
    if args.cmd == "compile":
        return cmd_compile(args)
    if args.cmd == "package":
        return cmd_package(args)
    if args.cmd == "clean":
        return cmd_clean(args)
    raise SystemExit(f"unknown command: {args.cmd}")


if __name__ == "__main__":
    raise SystemExit(main())

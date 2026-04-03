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
PACKAGE_JSON = ROOT / "package.json"
PACKAGE_LOCK_JSON = ROOT / "package-lock.json"


def run(cmd: list[str], *, cwd: Path = ROOT) -> None:
    print("+", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(cwd))


def resolve_tool(name: str) -> str:
    tool = shutil.which(name)
    if not tool:
        raise SystemExit(f"required tool not found in PATH: {name}")
    return tool


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def read_version() -> str:
    return str(read_json(PACKAGE_JSON)["version"])


def set_version(version: str) -> str:
    parts = version.split(".")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        raise SystemExit(f"invalid version '{version}', expected x.y.z")

    package_data = read_json(PACKAGE_JSON)
    package_data["version"] = version
    write_json(PACKAGE_JSON, package_data)

    if PACKAGE_LOCK_JSON.exists():
        lock_data = read_json(PACKAGE_LOCK_JSON)
        lock_data["version"] = version
        packages = lock_data.get("packages")
        if isinstance(packages, dict) and "" in packages and isinstance(packages[""], dict):
            packages[""]["version"] = version
        write_json(PACKAGE_LOCK_JSON, lock_data)

    return version


def bump_version(kind: str) -> str:
    major, minor, patch = (int(x) for x in read_version().split("."))
    if kind == "major":
        major += 1
        minor = 0
        patch = 0
    elif kind == "minor":
        minor += 1
        patch = 0
    elif kind == "patch":
        patch += 1
    else:
        raise SystemExit(f"unknown bump kind: {kind}")
    version = f"{major}.{minor}.{patch}"
    set_version(version)
    return version


def package_name() -> str:
    data = read_json(PACKAGE_JSON)
    return f"{data['publisher']}.{data['name']}-{data['version']}.vsix"


def clean_outputs() -> None:
    for path in (OUT_DIR, DIST_DIR):
        if path.exists():
            shutil.rmtree(path)
            print(f"[OK] removed {path}")


def ensure_deps_installed() -> None:
    if not (ROOT / "node_modules").exists():
        run([resolve_tool("npm"), "ci", "--no-audit", "--no-fund"])


def bundle_extension() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    run([resolve_tool("npx"), "tsc", "-p", "./", "--noEmit"])
    run(
        [
            resolve_tool("npx"),
            "esbuild",
            "src/extension.ts",
            "--bundle",
            "--platform=node",
            "--format=cjs",
            "--target=node18",
            "--external:vscode",
            "--outfile=out/extension.js",
            "--sourcemap",
        ]
    )


def cmd_deps(_: argparse.Namespace) -> int:
    run([resolve_tool("npm"), "ci", "--no-audit", "--no-fund"])
    return 0


def cmd_compile(_: argparse.Namespace) -> int:
    ensure_deps_installed()
    bundle_extension()
    return 0


def cmd_package(args: argparse.Namespace) -> int:
    if args.clean:
        clean_outputs()
    run([resolve_tool("npm"), "ci", "--no-audit", "--no-fund"])
    bundle_extension()
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


def cmd_version_get(_: argparse.Namespace) -> int:
    print(read_version())
    return 0


def cmd_version_set(args: argparse.Namespace) -> int:
    print(set_version(args.version))
    return 0


def cmd_version_bump(args: argparse.Namespace) -> int:
    print(bump_version(args.kind))
    return 0


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Build helper for the Kinal VSCode extension")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("deps", help="install npm dependencies")
    sub.add_parser("compile", help="typecheck and bundle the extension")
    pkg = sub.add_parser("package", help="compile and package a VSIX")
    pkg.add_argument("--clean", action="store_true", help="remove old out/dist before packaging")
    sub.add_parser("clean", help="remove build outputs")

    ver = sub.add_parser("version", help="inspect or update the extension version")
    ver_sub = ver.add_subparsers(dest="version_cmd", required=True)
    ver_sub.add_parser("get", help="print current x.y.z version")
    ver_set = ver_sub.add_parser("set", help="set exact version")
    ver_set.add_argument("version", help="new version in x.y.z format")
    ver_bump = ver_sub.add_parser("bump", help="bump semantic version")
    ver_bump.add_argument("kind", choices=["major", "minor", "patch"], help="which component to bump")
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
    if args.cmd == "version":
        if args.version_cmd == "get":
            return cmd_version_get(args)
        if args.version_cmd == "set":
            return cmd_version_set(args)
        if args.version_cmd == "bump":
            return cmd_version_bump(args)
    raise SystemExit(f"unknown command: {args.cmd}")


if __name__ == "__main__":
    raise SystemExit(main())

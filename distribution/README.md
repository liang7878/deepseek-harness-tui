# DeepSeek Harness TUI npm distribution

This directory owns the unscoped npm distribution for the standalone TUI. The generated packages carry the tested closure of the pinned official Harness submodule; users do not clone either repository or build native dependencies.

## Install and run

Node.js `^22.19` or `>=24` is required.

```sh
npx --yes deepseek-harness-tui@latest
npx --yes deepseek-harness-tui@latest --theme sakura
```

One optional leading `tui` remains accepted for compatibility:

```sh
npx --yes deepseek-harness-tui@latest tui --resume <session-id>
```

For a global installation:

```sh
npm install --global deepseek-harness-tui@latest
dsh-tui --theme sakura
deepseek-harness-tui --resume <session-id>
```

Both bins launch the same program and forward every argument.

## Package layout

`deepseek-harness-tui` is a small meta package with exact-version optional dependencies on the matching native package:

| Host | Package |
|---|---|
| macOS arm64 | `deepseek-harness-tui-darwin-arm64` |
| macOS x64 | `deepseek-harness-tui-darwin-x64` |
| Linux arm64 | `deepseek-harness-tui-linux-arm64` |
| Linux x64 | `deepseek-harness-tui-linux-x64` |
| Windows x64 | `deepseek-harness-tui-win32-x64` |

Each platform package contains a production `pnpm deploy` closure generated on that OS and architecture. The launcher executes the staged JavaScript CLI with `process.execPath`; installation performs no download, compilation, or SEA extraction.

## Build and verify

The checked-in [manifest](manifest.json) owns the public package names, version, engines, description, license, and repository metadata. Generated package directories and tarballs stay under `.artifacts/` and are not workspace members.

```sh
npm run pack:tui
npm run pack:tui -- --platform linux --arch x64 --platform-only
npm run pack:tui -- --meta-only
npm run verify:packed
```

The host default builds its platform tarball and the meta tarball. The packed-install smoke is artifact-dependent: it installs both tarballs into an isolated project, starts `dsh-tui --theme sakura` through a PTY, waits for the Sakura composer, and exits through `/quit`.

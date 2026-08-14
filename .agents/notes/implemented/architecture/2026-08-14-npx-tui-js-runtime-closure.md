# Agent Note: Unscoped npx TUI distribution with platform JavaScript closures

Status: implemented

English | [中文](2026-08-14-npx-tui-js-runtime-closure.zh.md)

## Problem

The fork needs an npm entry that runs without a repository clone, a pnpm workspace build, or publication of the fork's internal `@deepseek-ai/*` package graph. The real TUI depends on built JavaScript, configuration files, dynamic package resolution, and native `node-pty` files selected for the user's OS and CPU. A portable launcher alone cannot recover that closure from npm, while an install script that downloads or compiles it makes installation depend on mutable network and toolchain state.

## Decision

The public distribution consists of one unscoped meta package, `deepseek-harness-tui`, and five exact-version optional platform packages: `deepseek-harness-tui-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-x64}`. The meta package exposes `deepseek-harness-tui` and `dsh-tui`; both resolve the installed package for `process.platform` and `process.arch`, execute its staged `@deepseek-ai/dsh/lib/bin.js` with `process.execPath`, inject `tui`, forward every argument, and remove one optional leading `tui`.

[`distribution/manifest.json`](../../../../distribution/manifest.json) owns the public version, description, package names, engines, license, and repository metadata. Public package manifests are generated artifacts, not workspace members, so repository workspace naming rules do not turn the public packages into `@deepseek-ai` names.

This distribution complements the [single-executable Python SDK runtime](2026-07-10-single-file-executable-sdk-runtime-distribution.md). The Python carrier removes the Node prerequisite for an SDK serving process; the npm carrier assumes the Node version that runs `npx` and preserves the ordinary JavaScript module tree for the interactive CLI.

The unscoped TUI packages form a public release sequence outside the three organization-owned `@deepseek-ai` families in the [npm release decision](../process/2026-08-10-npm-release-sequences.md). They retain that decision's artifact-first, registry-integrity, and platform-before-entry ordering, but own an independent version in `distribution/manifest.json`.

## Package topology

`distribution/npm-runtime/package.json` is a private dependency-only workspace manifest rooted at `@deepseek-ai/dsh`. [`scripts/verify-runtime-closure.ts`](../../../../scripts/verify-runtime-closure.ts) traverses the app and workspace graph and rejects missing required workspace peers before deployment.

Each native builder runs `pnpm deploy --legacy --prod` with a hoisted linker, automatic peer installation disabled, and workspace linking enabled. It restores direct dependencies omitted by legacy deploy, materializes package links, removes `.bin` links that would remain symbolic, and rejects any remaining symlink. Linux copies the target-built `node-pty` addon into the closure; macOS retains the target prebuild and gives `spawn-helper` executable mode; Windows retains the x64 ConPTY addon set. The platform tarball check requires these files and the macOS helper mode.

The meta-plus-optional-package topology follows the native selection mechanism used by the [Landlock npm launcher](../process/2026-08-06-in-repository-landlock-release.md), while each TUI platform package carries a complete JavaScript runtime tree rather than one native executable.

## Build and release

[`scripts/build-npm-tui-package.ts`](../../../../scripts/build-npm-tui-package.ts) builds the native host package and meta package by default. `--platform-only` and `--meta-only` separate CI jobs; `--skip-build` reuses existing host libraries; explicit `--platform`, `--arch`, and `--output` values are validated before any generated staging directory is cleared. `pnpm pack` creates the npm tarballs after generated metadata and staged timestamps are normalized.

The manual [npm TUI release workflow](../../../../.github/workflows/npm-tui-release.yml) builds all five closures on native runners and combines them with the independently generated meta tarball. The packed Linux x64 release starts through the installed `dsh-tui` bin in a PTY before publication. Publication validates the complete six-package set, rejects version disagreement and different-content registry collisions, publishes native packages before the meta package, and uses npm provenance with trusted publishing or an `NPM_TOKEN` fallback. A dispatch with publication disabled is a credential-free pack-only run.

## Verification

Unit tests cover build argument parsing, target mapping, generated public manifests, unsafe output paths, launcher package resolution, missing-package diagnostics, argument forwarding, exit codes, and signals. [`scripts/verify-packed-npm-tui-install.ts`](../../../../scripts/verify-packed-npm-tui-install.ts) installs the host platform tarball plus the meta tarball into an isolated project, starts `dsh-tui --theme sakura` through `node-pty`, observes the Sakura composer, sends `/quit`, and requires exit code zero.

## Alternatives considered

**One package containing every platform closure.** Rejected because every user would download all five native closures, and npm's `os`/`cpu` filtering can select only at package granularity. Exact optional platform dependencies keep the launcher small and install one closure.

**A postinstall downloader.** Rejected because installation would perform an unaudited mutable network action after npm selected the package, require a separate artifact host and integrity protocol, and fail in offline or lifecycle-script-disabled environments.

**Require users to clone and build.** Rejected because it exposes repository tooling, native compilation, and workspace state as end-user prerequisites rather than shipping the tested production bytes.

**Package the TUI as a SEA executable.** Rejected because `npx` already supplies a compatible Node process, while the real CLI expects a materialized package tree for dynamic imports, configuration, and native addons. SEA adds another runtime and module-loading layer without reducing the platform package matrix.

## Consequences

Users install one tiny stable command surface and one OS/CPU-specific closure without install-time downloads or builds. The tarballs are larger than a bundled application because they preserve the production Node package tree, but that tree runs the same built CLI and package resolution exercised by the repository. Every release publishes six coordinated names at one exact version; adding another supported platform requires a native builder, package-map entry, optional dependency, native-file verification, and packed PTY coverage.

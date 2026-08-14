# Architecture

## Product boundary

DeepSeek Harness TUI owns terminal interaction, presentation, themes, and its launch adapter. DeepSeek Harness owns the agent loop, sessions, tools, providers, permissions, and plugin runtime.

The TUI does not patch or vendor Harness files. Its `cordis.patch.yml` contributes two application plugins over the official `dsh-base` profile. `launcher.mjs` creates a dedicated user profile and materializes an absolute overlay for the installed TUI modules, so the engine and interface remain separate packages at runtime.

## Upstream lifecycle

`vendor/deepseek-harness` is a build-only Git submodule pinned to an exact upstream commit. Dependabot watches the submodule and opens update pull requests. CI installs the combined workspace, builds the pinned engine, type-checks the adapter, and runs the TUI tests before the pointer can move.

The submodule is not included in the npm meta package. Release jobs deploy the tested workspace closure into platform-specific packages, remove symlinks, verify native artifacts, and run the packed package through a real PTY. The small meta package selects the package matching `process.platform` and `process.arch`.

## Compatibility policy

Each TUI release records one exact Harness commit through the submodule pointer and one immutable lockfile. Compatibility is established by CI, not by an open semver range. A Harness update that changes an imported service or event fails at build or test time in its update pull request.

When the official npm package graph becomes independently installable without unpublished peers, the build input can move from the submodule to registry packages without changing the launcher, profile, or user installation model.

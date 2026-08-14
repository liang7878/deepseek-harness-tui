# DeepSeek Harness TUI

<p align="center">
  <strong>A focused terminal workspace for the official DeepSeek Harness engine.</strong><br>
  Sessions, tools, approvals, models, themes, and durable history—without cloning the Harness monorepo.
</p>

<p align="center">
  <a href="https://github.com/liang7878/deepseek-harness-tui/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/liang7878/deepseek-harness-tui/ci.yml?branch=main"></a>
  <a href="https://www.npmjs.com/package/deepseek-harness-tui"><img alt="npm" src="https://img.shields.io/npm/v/deepseek-harness-tui"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-111827">
</p>

![DeepSeek Harness TUI demo](assets/tui-demo.gif)

## Run it

```bash
npx --yes deepseek-harness-tui@latest
```

The npm package selects a prebuilt runtime for macOS, Linux, or Windows. Users do not need the Harness source tree, a submodule, pnpm, or a native compiler.

```bash
npx deepseek-harness-tui --cwd ./project
npx deepseek-harness-tui --model deepseek-official/deepseek-v4-flash
npx deepseek-harness-tui --resume <session-id>
npx deepseek-harness-tui --theme luna
```

Configure providers with the same environment variables and settings used by DeepSeek Harness. For the official API:

```bash
export DEEPSEEK_API_KEY="your-key"
npx deepseek-harness-tui
```

OpenAI-compatible MaaS endpoints can use `DEEPSEEK_BASE_URL` together with the provider configuration in your Harness settings.

## What it includes

- Durable sessions with create, resume, switch, and transcript pagination
- Multi-turn follow-up, steering, cancellation, and model selection
- Tool calls, approvals, structured questions, todos, and command discovery
- Alternate-screen lifecycle, real PTY behavior, Unicode and ASCII fallbacks
- Eight built-in themes plus persisted custom themes
- macOS arm64/x64, Linux arm64/x64, and Windows x64 runtime packages

![Theme selector](assets/tui-themes.gif)

Use `Ctrl+T` or `/themes` to switch among Classic, Sakura Byte, Ocean, Ember, Aurora Pulse, Luna Circuit, Phosphor Grid, and Sunset Circuit.

## Independent by design

This repository does **not** fork or copy the DeepSeek Harness source tree. The TUI lives at the repository root; the official engine is pinned as a Git submodule under `vendor/deepseek-harness` only for reproducible builds.

```text
TUI source ── adapter/profile overlay ── pinned Harness engine
    │                                      │
    └──────── prebuilt platform runtime ───┘
```

The boundary has three useful properties:

1. Users install one prebuilt package and never interact with the submodule.
2. Dependabot proposes upstream commit updates automatically; CI builds the TUI against each proposed revision.
3. TUI releases pin an exact tested Harness commit, so an upstream change cannot silently break an installed version.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the update and release model.

## Develop

```bash
git clone --recurse-submodules https://github.com/liang7878/deepseek-harness-tui.git
cd deepseek-harness-tui
CI=true pnpm install --frozen-lockfile
npm run check
```

To test a new Harness revision:

```bash
git -C vendor/deepseek-harness fetch origin
git -C vendor/deepseek-harness checkout origin/master
CI=true pnpm install --no-frozen-lockfile
npm run check
```

Commit the submodule pointer and refreshed lockfile only after compatibility checks pass.

---

## 中文

DeepSeek Harness TUI 是一个独立发布、可直接通过 `npx` 使用的终端 Coding Agent。用户无需克隆 Harness、初始化 submodule、安装 pnpm 或编译原生依赖。

```bash
npx --yes deepseek-harness-tui@latest
```

仓库只保留 TUI、适配层和发行脚本；官方 DeepSeek Harness 以固定 commit 的 submodule 参与构建。Dependabot 自动提交上游升级 PR，CI 验证兼容性，最终发布物则包含经过验证的跨平台运行时。因此既能持续跟进上游，又不会把维护复杂度转嫁给用户。

MIT © DeepSeek Harness TUI contributors

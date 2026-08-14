# DeepSeek Harness TUI

[English](README.md)

<p align="center">
  <strong>基于官方 DeepSeek Harness 引擎的终端 Coding Agent。</strong><br>
  在终端内完成多轮会话、工具调用、审批、模型切换、主题定制与历史恢复。
</p>

<p align="center">
  <a href="https://github.com/liang7878/deepseek-harness-tui/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/liang7878/deepseek-harness-tui/ci.yml?branch=main"></a>
  <a href="https://www.npmjs.com/package/deepseek-harness-tui"><img alt="npm" src="https://img.shields.io/npm/v/deepseek-harness-tui"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-111827">
</p>

![DeepSeek Harness TUI 演示](assets/tui-demo.gif)

## 立即运行

```bash
npx --yes deepseek-harness-tui@latest
```

npm 包会自动选择适用于 macOS、Linux 或 Windows 的预编译运行时。用户无需克隆 Harness 源码、初始化 submodule、安装 pnpm 或配置原生编译环境。

```bash
npx deepseek-harness-tui --cwd ./project
npx deepseek-harness-tui --model deepseek-official/deepseek-v4-flash
npx deepseek-harness-tui --resume <session-id>
npx deepseek-harness-tui --theme luna
```

使用 DeepSeek 官方 API：

```bash
export DEEPSEEK_API_KEY="your-key"
npx deepseek-harness-tui
```

OpenAI-compatible MaaS 服务可以通过 `DEEPSEEK_BASE_URL` 和 Harness provider 配置接入。

## 功能

- 创建、恢复和切换持久化会话，支持 transcript 分页
- 多轮 follow-up、运行中 steering、取消任务和模型选择
- 工具调用、审批、结构化问题、Todo 和命令发现
- Alternate screen 生命周期、真实 PTY、Unicode 与 ASCII 降级
- 八套内置主题和可持久化的自定义主题
- macOS arm64/x64、Linux arm64/x64 和 Windows x64 运行时

![主题选择器](assets/tui-themes.gif)

按 `Ctrl+T` 或输入 `/themes`，即可在 Classic、Sakura Byte、Ocean、Ember、Aurora Pulse、Luna Circuit、Phosphor Grid 和 Sunset Circuit 之间切换。

## 独立架构

本仓库不复制或 fork DeepSeek Harness 源码。TUI 位于仓库根目录；官方 Harness 仅以固定 commit 的 Git submodule 参与可复现构建。

```text
TUI 源码 ── adapter/profile overlay ── 固定版本的 Harness 引擎
   │                                      │
   └────────── 跨平台预编译运行时 ────────┘
```

这种设计确保：

1. 用户只安装一个预编译包，不接触 submodule。
2. Dependabot 自动提交上游 commit 更新，CI 对每次升级进行构建和兼容性验证。
3. 每个 TUI 版本对应一个经过验证的 Harness commit，上游变更不会静默破坏已安装版本。

完整说明见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 本地开发

```bash
git clone --recurse-submodules https://github.com/liang7878/deepseek-harness-tui.git
cd deepseek-harness-tui
CI=true pnpm install --frozen-lockfile
npm run check
```

验证新的 Harness 版本：

```bash
git -C vendor/deepseek-harness fetch origin
git -C vendor/deepseek-harness checkout origin/master
CI=true pnpm install --no-frozen-lockfile
npm run check
```

兼容性检查通过后，再提交 submodule 指针和更新后的 lockfile。

MIT © [liang7878](https://github.com/liang7878)

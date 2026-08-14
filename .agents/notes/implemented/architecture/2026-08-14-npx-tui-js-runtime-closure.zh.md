# Agent Note: 通过平台 JavaScript 闭包提供非 scoped npx TUI 发行版

Status: implemented

[English](2026-08-14-npx-tui-js-runtime-closure.md) | 中文

## Problem

该 fork 需要一个 npm 入口，运行时无需克隆仓库、执行 pnpm workspace 构建，也无需发布 fork 内部的 `@deepseek-ai/*` 包图。真实 TUI 依赖构建后的 JavaScript、配置文件、动态包解析，以及按用户 OS 与 CPU 选择的原生 `node-pty` 文件。仅靠可移植 launcher 无法从 npm 恢复这份闭包，而通过安装脚本下载或编译会让安装依赖可变的网络与工具链状态。

## Decision

公开发行版由一个非 scoped meta 包 `deepseek-harness-tui` 和五个精确版本的可选平台包组成：`deepseek-harness-tui-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-x64}`。meta 包公开 `deepseek-harness-tui` 与 `dsh-tui`；两者都会根据 `process.platform` 和 `process.arch` 解析已安装的平台包，通过 `process.execPath` 执行其暂存的 `@deepseek-ai/dsh/lib/bin.js`，注入 `tui`，转发全部参数，并移除一个可选的前导 `tui`。

[`distribution/manifest.json`](../../../../distribution/manifest.json)负责公开版本、描述、包名、engines、许可证和仓库元数据。公开 package manifest 是生成产物，不是 workspace 成员，因此仓库的 workspace 命名规则不会把这些公开包改成 `@deepseek-ai` 名称。

该发行版与[单文件 Python SDK 运行时](2026-07-10-single-file-executable-sdk-runtime-distribution.md)互补。Python carrier 为 SDK 对外服务进程移除 Node 前置条件；npm carrier 则假定运行 `npx` 的 Node 版本，并为交互式 CLI 保留普通 JavaScript 模块树。

这组非 scoped TUI 包形成一条公开发布序列，位于 [npm 发布决策](../process/2026-08-10-npm-release-sequences.md)中的三组 `@deepseek-ai` 组织自有 family 之外。它保留该决策的 artifact-first、registry integrity 与 platform-before-entry 顺序，但在 `distribution/manifest.json` 中持有独立版本。

## Package topology

`distribution/npm-runtime/package.json` 是一个私有、仅含依赖的 workspace manifest，以 `@deepseek-ai/dsh` 为根。[`scripts/verify-runtime-closure.ts`](../../../../scripts/verify-runtime-closure.ts)会遍历 app 与 workspace 图，并在部署前拒绝缺失的必需 workspace peer。

每个原生构建器都会运行带有 hoisted linker、关闭自动 peer 安装并启用 workspace 链接的 `pnpm deploy --legacy --prod`。构建器会恢复 legacy deploy 遗漏的直接依赖、物化包链接、移除仍为符号链接的 `.bin` 链接，并拒绝任何剩余符号链接。Linux 会把目标平台构建的 `node-pty` addon 复制进闭包；macOS 保留目标 prebuild，并为 `spawn-helper` 设置可执行模式；Windows 保留 x64 ConPTY addon 集合。平台 tarball 检查要求这些文件存在，并校验 macOS helper 的模式。

meta + optional package 拓扑复用 [Landlock npm launcher](../process/2026-08-06-in-repository-landlock-release.md)的原生选择机制，但每个 TUI 平台包携带完整 JavaScript runtime tree，而不是单个原生可执行文件。

## Build and release

[`scripts/build-npm-tui-package.ts`](../../../../scripts/build-npm-tui-package.ts)默认构建原生宿主包与 meta 包。`--platform-only` 和 `--meta-only` 用于拆分 CI job；`--skip-build` 复用已有宿主库；显式的 `--platform`、`--arch` 和 `--output` 会在清理任何生成暂存目录前完成校验。生成元数据和暂存时间戳规范化后，由 `pnpm pack` 创建 npm tarball。

手动触发的 [npm TUI 发布工作流](../../../../.github/workflows/npm-tui-release.yml)会在原生 runner 上构建五份闭包，并与独立生成的 meta tarball 合并。发布前，打包后的 Linux x64 发行版会通过已安装的 `dsh-tui` bin 在 PTY 中启动。发布过程校验完整的六包集合，拒绝版本不一致和注册表中的异内容碰撞，先发布原生包再发布 meta 包，并使用 npm provenance 与 trusted publishing，或回退到 `NPM_TOKEN`。关闭发布选项的 dispatch 是无需凭据的 pack-only 运行。

## Verification

单元测试覆盖构建参数解析、目标映射、生成的公开 manifest、不安全输出路径、launcher 包解析、缺包诊断、参数转发、退出码和信号。[`scripts/verify-packed-npm-tui-install.ts`](../../../../scripts/verify-packed-npm-tui-install.ts)会把宿主平台 tarball 与 meta tarball 安装进隔离项目，通过 `node-pty` 启动 `dsh-tui --theme sakura`，观察 Sakura composer，发送 `/quit`，并要求退出码为零。

## Alternatives considered

**用一个包包含所有平台闭包。** 不采用，因为每位用户都会下载全部五份原生闭包，而 npm 的 `os`/`cpu` 过滤只能按包选择。精确版本的可选平台依赖让 launcher 保持小巧，并且只安装一份闭包。

**使用 postinstall 下载器。** 不采用，因为 npm 选定包后，安装还会执行一次未经独立审计的可变网络操作，并需要单独的产物主机与完整性协议；在离线环境或禁用生命周期脚本的环境中也会失败。

**要求用户克隆并构建。** 不采用，因为这会把仓库工具、原生编译和 workspace 状态暴露为最终用户前置条件，而不是交付经过测试的生产字节。

**把 TUI 打包为 SEA 可执行文件。** 不采用，因为 `npx` 已经提供兼容的 Node 进程，而真实 CLI 需要物化的包树来完成动态 import、配置与原生 addon 加载。SEA 不会减少平台包矩阵，却会增加另一层运行时与模块加载机制。

## Consequences

用户会安装一个小型稳定命令入口和一份 OS/CPU 专属闭包，安装时不下载也不构建。tarball 会比 bundled application 更大，因为它保留生产 Node 包树，但该包树运行的正是仓库所验证的构建后 CLI 与包解析。每次发布都要以同一个精确版本协调发布六个名称；新增支持平台需要同时增加原生构建器、包映射项、可选依赖、原生文件校验和 packed PTY 覆盖。

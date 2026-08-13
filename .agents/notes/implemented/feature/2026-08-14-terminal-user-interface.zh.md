# Agent Note: 终端用户界面

Status: implemented

[English](2026-08-14-terminal-user-interface.md) | 中文

## Problem

DeepSeek Harness 提供浏览器 UI 和一次性 headless runner，但没有交互式终端入口。终端用户若不启动浏览器应用或自行通过 API gateway 构建客户端，就无法监督流式任务、回答审批和提问、选择模型或恢复持久会话。

## Decision

`dsh tui` 是由 `dsh-base` 与 `dsh-tui-app` bundle 组合而成的一等 profile。应用运行在 Host 进程中，直接驱动 `ctx.agents`、`ctx.sessions`、`ctx.sessionPersistence`、`ctx.commands`、`ctx.userQuestions`、`ctx.approval` 和 `ctx.llm`，不挂载 HTTP server，也不复制 agent loop。

bundle 使用与仓库 React 18 版本线兼容的 Ink。Ink 负责终端渲染和输入解码；包自身负责应用状态机、Session 投影、窗口化、选择器、审批与提问 provider，以及终端安全关闭。

本决策满足[旧 TUI 包移除决策](../simplification/2026-08-04-remove-tui-package.md)中的重新引入条件：`dsh tui` 是具名产品组合，包含新的 Host 所有包、显式交互 provider，以及组装后的生命周期与 transcript 验收。它不会恢复或别名映射已删除的 `packages/ui/tui` 实现。

已完成的会话内容从 Session log 投影。实时 agent 状态、待处理问题、审批、选择器和编辑器状态保留在进程内。工具行调用已注册工具的纯 `presentCall` 与 `presentResult` 方法；回放时定义缺失则保留通用降级展示。

profile 支持 macOS、Linux 和 Windows，遵循 `NO_COLOR`，所有颜色状态都保留文字标签，适配窄终端，并在每条退出路径恢复终端状态。非交互调用会给出修正方法，而不是启动一个不可见的 agent。

## Ownership

`dsh-agent`、`dsh-session` 及各工具继续拥有运行时与持久事实。`dsh-tui-app` 只拥有终端呈现、输入编辑、本地导航命令和一个当前顶层 Agent handle。Harness 斜杠命令通过 `ctx.commands` 分派；本地导航命令不会进入 Session log。

## Runtime behavior

profile 支持创建、恢复和切换 Session；流式 assistant 输出与折叠 reasoning 活动；结构化工具呈现；取消与 steering；审批与用户提问；模型与命令选择；Todo 展示；transcript 分页；尺寸变化；粘贴；无颜色模式；有界关闭。终端投影保留最新 2,000 行，并明确标记被省略的持久化历史。

## Alternatives considered

**通过 localhost 复用浏览器客户端。** 这会让一个与目标服务处于同一进程的界面额外承担 HTTP server、传输序列化、信任配置和重连行为，也会让终端启动依赖构建后的浏览器资源，却没有改善隔离。

**使用 OpenTUI。** 它的原生 renderer 吞吐量更高，但会给每个发布的 CLI 增加平台专用原生产物和较新的兼容面。Ink 无需原生二进制即可支持所需 Node 与终端平台，对有界窗口化记录已经足够。

**扩展 headless runner。** 一次性 runner 有意不拥有交互生命周期，并在一个 turn 后退出。加入会话切换、模态提问、渲染和输入状态，会把其窄接口变成两个互不兼容的应用。

## Verification

包测试覆盖投影、Unicode 编辑与粘贴、控制器命令、模型选择、审批、结构化问题、切换失败恢复和资源释放。真实伪终端进程驱动 Ink 输入，并验证 inline 与备用屏幕恢复。构建后的 `dsh tui` profile 通过随附 profile 进入 composer，README 录制则执行真实火山方舟模型请求。

## Consequences

兼容 React 18 的 Ink 主版本获得的新特性少于 React 19 版本线，因此本包只使用稳定 primitive，使未来运行时升级保持机械性。2,000 行投影上限限制进程内终端历史，而完整 Session 继续持久化。同进程服务访问避免传输重复，但要求控制器只使用公开操作，且绝不修改借用的 Session 数据。

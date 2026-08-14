# Agent Note: 终端主题系统

Status: implemented

[English](2026-08-14-terminal-theme-system.md) | 中文

## Problem

[终端应用](2026-08-14-terminal-user-interface.md)发布时只有固定青色 palette。用户若不修改 renderer 代码，就无法调整视觉风格、共享自定义 palette 或选择更有表现力的欢迎状态。装饰性实现也可能破坏 TUI 对窄终端、无颜色模式和活动工作的保证。

## Decision

`dsh-tui-app` 持有终端专用 theme registry。内置 `classic`、`sakura`、`ocean`、`ember`、`aurora`、`luna`、`phosphor` 与 `sunset`；`tui` 用户 settings namespace 可以加入完整自定义主题。`--theme` 为单次调用选择初始主题，`Ctrl+T`、`/theme` 与 `/themes` 则复用同一个控制器选择器，并通过 `ctx.settings` 持久化。

解析后的主题包含 accent、success、warning、error 与 muted 语义色，以及空 transcript 的欢迎定义。自定义颜色接受有界 Ink 颜色词汇或六位十六进制值。registry 在 renderer 收到主题前校验 ID、选中引用、registry 数量与字符画尺寸。缺失引用和无效已存 section 会在启动时失败，而不是静默回退。

Sakura Byte 与 Luna Circuit 使用专为本项目创作的静态动漫风人物，均不代表任何现有角色或作品 IP。欢迎字符画不是 transcript 背景：它只在没有可见持久化行时显示，并且要求终端支持颜色、Unicode、至少 84 列及至少 14 行 transcript。活动工作、窄终端、`NO_COLOR` 与 ASCII 模式始终使用紧凑布局。

## Ownership

`ctx.settings` 持有经过校验的持久化与实时更新。`themes.ts` 持有主题词汇、内置主题、自定义主题解析与限制。控制器持有选择与持久化。Ink 组件只根据解析后的主题进行展示，不读取 settings 文档。

浏览器主题提案保持独立，因为它持有 DOM color-scheme 展示与浏览器 Settings 组合。本决策既不取代该提案，也不与其共享运行时定义。

## Alternatives considered

**绘制完整终端背景。** 终端背景色在本地终端、SSH、multiplexer、文本选择和用户无障碍设置中的行为不一致。主题继承终端背景，只改变语义前景色。

**在每个 transcript 背后或旁边持续展示字符画。** 持久装饰会减少工具输出空间，也可能遮蔽因果工作记录。有界空状态画布可以提供个性，同时不与活动工作竞争。

**加载可执行主题模块。** 用户 settings 是数据平面，而不是扩展 loader。经过校验的 YAML 让主题保持可移植，也避免外观配置执行代码。

**复用浏览器主题定义。** 浏览器主题把 light、dark 与 system 偏好解析为 DOM token。终端主题解析 ANSI 前景色和受能力约束的字符画；共享类型会耦合无关的展示环境。

## Verification

主题测试覆盖内置与自定义 registry 解析、无效引用与冲突、持久化、实时 settings 更新和未知 ID。UI 测试证明画布能力阈值。启动测试覆盖 `--theme`；伪终端测试覆盖带主题 runtime 与终端恢复。README 录制运行真实 `dsh tui` profile，并通过 `Ctrl+T` 切换主题。

## Consequences

主题 ID 与自定义字段是面向用户的 settings 词汇。新增内置主题必须保留语义色角色与紧凑降级。更丰富的展示可以扩展欢迎定义，但持久化 transcript 行始终保持权威，并且一定替换装饰字符画。

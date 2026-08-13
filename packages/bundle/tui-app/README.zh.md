# `@deepseek-ai/dsh-tui-app`

[English](README.md) | 中文

DeepSeek Harness 的第一方交互式终端应用。它的组合包 patch 叠加在 [`dsh-base`](../base/README.md) 之上，加入 Code Mode worker，并在 Host 进程中挂载命令行提供方与 Ink 渲染器。它不会启动 HTTP server 或浏览器 runtime。

通过随附 profile 运行：

```sh
dsh tui
dsh tui --resume <session-id>
dsh tui --cwd ../project --model <provider>/<model>
dsh tui --theme sakura
```

启动提供方接受 `--resume`、`--cwd`、`--model`、`--theme`、`--inline`、`--no-color` 和 `--no-unicode`。`NO_COLOR` 同样会关闭 ANSI 颜色。输入或输出被重定向时，应用会在 Agent 启动前失败；交互式渲染器要求兼容 VT、且至少为 30 列 8 行的终端。

## 主题

内置主题包括 `classic`、`sakura`、`ocean` 与 `ember`。`Ctrl+T`、`/theme` 和 `/themes` 会打开选择器并持久化选择，`/theme <id>` 可直接选择。`--theme <id>` 只覆盖当前启动，不改变已保存偏好。

`tui` settings namespace 也接受完整自定义主题：

```yaml
tui:
  theme: night-lab
  customThemes:
    night-lab:
      name: Night Lab
      description: Violet focus for late sessions.
      accent: "#bb66ff"
      success: cyan
      warning: yellow
      error: red
      muted: gray
      title: Nebula online
      subtitle: Build beyond the horizon.
      art:
        - "      *   .   *"
        - "   .    NIGHT    ."
```

颜色可以是六位十六进制值，也可以是 Ink 的 `black`、`red`、`green`、`yellow`、`blue`、`magenta`、`cyan`、`white` 和 `gray`。ID 使用小写 kebab-case。registry 最多接受 20 个自定义主题，每个字符画最多 10 行、每行最多 64 个字符；无效的已存选择会在启动时明确失败。装饰字符画是空 transcript 的欢迎画布，不会覆盖对话内容；窗口少于 84 列、transcript 区少于 14 行或禁用颜色、Unicode 时不会显示。

## 交互

| 按键 | 操作 |
|---|---|
| `Enter` | idle 时发送后续消息，running 时发送 steering（中途引导）。 |
| `Ctrl+J` | 插入换行。 |
| `Ctrl+C` | 取消活动工作，或在 idle 时退出。 |
| `Ctrl+O` | 选择持久化 Session。 |
| `Ctrl+L` | 选择已配置的提供方与模型。 |
| `Ctrl+T` | 选择并持久化终端主题。 |
| `Ctrl+P` | 浏览本地命令与已注册命令。 |
| `PageUp` / `PageDown` | 翻阅 transcript（文本记录）。 |
| `Ctrl+E` | 返回 transcript 实时末尾。 |
| `Esc` | 取消当前选择器、审批或问题。 |

本地 `/new`、`/resume`、`/sessions`、`/model`、`/models`、`/theme`、`/themes`、`/commands`、`/help`、`/quit` 与 `/exit` 命令只控制应用，绝不会进入模型 transcript。其他 slash command 通过 [`ctx.commands`](../../interaction/commands/README.md) 分发。

控制器持有一个顶层 Agent 句柄。已结算的消息、reasoning 活动、工具活动、命令结果、Todo 状态和错误都从权威 Session 日志增量投影。原始 reasoning 文本折叠为活动摘要。工具行调用各定义的 `presentCall` 与 `presentResult` 方法；回放时若定义不可用，则展示可读的原始回退内容。审批与 [`ctx.userQuestions`](../../interaction/user-questions/README.md) 会暂停当前 Agent，直至用户回答或取消。切换 Session 时，应用先 flush 并 dispose（资源释放）旧句柄，再发布新句柄。

正常退出、启动失败、渲染器失败和进程清理都会卸载 Ink、恢复光标、离开备用屏幕、flush 当前 Session，并 dispose Agent 句柄。`--inline` 将输出保留在终端普通回滚区，同时沿用相同清理流程。

## 模型体验

### 用户输入与终端控件

#### 模型可见内容

用户提交内容是普通用户消息。轮次运行期间，steering 使用 Agent inbox。TUI 本地导航、选择器、状态文本和按键提示对模型不可见；已注册 Harness 命令保留各自的日志记录与模型可见行为。

#### Token 影响

只有已提交用户消息与已注册 `ctx.commands` 效果会增加各自常规、取决于数据量的 token。终端界面、选择器、transcript 分页和折叠后的 reasoning 摘要不会增加 token。

#### KV Cache 影响

无。TUI 不添加任何请求前缀内容。

## 已知限制与暂缓事项

- 终端投影在内存中保留最新 2,000 行；更早内容仍然持久化，可恢复后通过其他 Session 消费方查看。
- 应用展示一个当前顶层 Agent。subagent 工作通过父 Session 已记录的工具活动保持可见，而不会打开独立窗格。
- Windows 需要 VT 输入。没有 ANSI/VT 支持的旧式控制台必须使用 Windows Terminal、现代 PowerShell host 或 Web 界面。

<div align="center">

# DeepSeek Harness TUI

**A production-grade coding agent that lives where you work: the terminal.**

[中文](README.zh.md)

[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](package.json) [![macOS](https://img.shields.io/badge/macOS-supported-111111?logo=apple)](packages/bundle/tui-app/README.md) [![Linux](https://img.shields.io/badge/Linux-supported-FCC624?logo=linux&logoColor=111111)](packages/bundle/tui-app/README.md) [![Windows](https://img.shields.io/badge/Windows-supported-0078D4?logo=windows)](packages/bundle/tui-app/README.md) [![License: MIT](https://img.shields.io/badge/License-MIT-6E56CF.svg)](LICENSE)

Supervise streaming work, inspect every tool action, answer approvals, switch models, and resume durable sessions without leaving your shell.

</div>

![DeepSeek Harness TUI running a real conversation through the Volcengine Ark API](assets/tui-demo.gif)

## Why this TUI

Most terminal agents are a separate client wrapped around a remote protocol. DeepSeek Harness TUI runs inside the same plugin-composed Host as the Agent, Session, tools, approvals, commands, and persistence services. There is no browser, localhost server, or reduced agent implementation between you and the runtime.

- **Real coding workflow** — multi-turn sessions, live steering, cancellation, tools, diffs, Todo progress, commands, approvals, and structured questions.
- **Durable by design** — settled output is projected from the authoritative Session log; resume work after closing the terminal.
- **Transparent but focused** — tool actions and failures stay visible while raw reasoning and internal runtime context remain collapsed.
- **Terminal-native** — Unicode editing, multiline input, paste, history, transcript paging, narrow panes, `NO_COLOR`, ASCII fallback, and reliable terminal restoration.
- **Provider-flexible** — use DeepSeek, Volcengine Ark, OpenAI-compatible gateways, or any provider supported by the Harness model registry.
- **Cross-platform** — macOS, Linux, Windows Terminal, SSH, tmux, and other VT-compatible terminals.

<a id="run"></a> <a id="run-from-source"></a>

## Quick start

Prerequisites: Node.js `^22.19` or `>=24`, pnpm, and a model-provider credential.

```sh
git clone https://github.com/liang7878/deepseek-harness-tui.git
cd deepseek-harness-tui
pnpm install
pnpm run build

export DEEPSEEK_API_KEY="your-key"
pnpm dsh tui
```

The current directory becomes the workspace. Use another directory or model explicitly:

```sh
pnpm dsh tui --cwd ../your-project
pnpm dsh tui --model deepseek-official/deepseek-v4-flash
pnpm dsh tui --resume <session-id>
```

## Volcengine Ark

Add an OpenAI-compatible route to `~/.dsh/settings.yaml`. The base URL stops at `/api/v3`; the adapter appends the request path.

```yaml
llm-pi-ai:
  providers:
    volcengine:
      name: Volcengine Ark
      apiKeyEnv: ARK_API_KEY
      api: openai-completions
      baseURL: https://ark.cn-beijing.volces.com/api/v3
      models:
        - id: your-endpoint-or-model-id
```

```sh
export ARK_API_KEY="your-key"
pnpm dsh tui --model volcengine/your-endpoint-or-model-id
```

Secrets remain in the environment or the Harness credential store; settings contain only credential references.

## Keyboard workflow

| Key | Action |
|---|---|
| `Enter` | Send a follow-up, or steer the running Agent. |
| `Ctrl+J` | Insert a newline. |
| `Ctrl+C` | Cancel active work; exit while idle. |
| `Ctrl+O` | Browse persisted sessions. |
| `Ctrl+L` | Select a provider and model. |
| `Ctrl+P` | Browse commands. |
| `PageUp` / `PageDown` | Page the transcript. |
| `Ctrl+E` | Return to the live tail. |
| `Esc` | Close or cancel the active interaction. |

Local commands include `/new`, `/resume`, `/sessions`, `/model`, `/models`, `/commands`, `/help`, and `/quit`. Plugin-contributed slash commands appear in the same command palette.

## Architecture

DeepSeek Harness is built on [Cordis](https://github.com/cordiverse/cordis): **everything is a plugin**. The TUI is a first-party profile over `dsh-base`, not a fork of the agent loop. It consumes public services directly and adds one Host-owned presentation layer:

```text
dsh tui
  └─ profile: dsh-base + dsh-tui-app
       ├─ Agent / Session / model registry
       ├─ tools / commands / approvals / questions
       ├─ persistence / sandbox / shell / filesystem
       └─ Ink renderer + TUI controller
```

Read the [TUI package contract](packages/bundle/tui-app/README.md), [product specification](apps/cli/PRODUCT.md), [interaction design](apps/cli/DESIGN.md), and [Harness architecture](docs/architecture.md).

## Quality

The release path exercises focused unit and integration tests, a real Loader composition, a real pseudo-terminal process with Unicode input, terminal-state restoration, TypeScript strict mode, lint, package hygiene, documentation synchronization, and built-profile smokes. The animated screenshot above is recorded from the real application and Volcengine model flow.

## Project status

This repository tracks a production-oriented TUI distribution on top of the pre-release DeepSeek Harness codebase. Harness storage and package formats may still change before the first stable upstream release; the TUI fails loudly rather than silently translating obsolete formats.

## Credits

Built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), developed by [DeepSeek AI](https://deepseek.com), and rendered with [Ink](https://github.com/vadimdemedes/ink). Cordis composability is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## License

[MIT](LICENSE). Third-party notices are available in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

# `@deepseek-ai/dsh-tui-app`

English | [中文](README.zh.md)

The first-party interactive terminal application for DeepSeek Harness. Its bundle patch composes over [`dsh-base`](../base/README.md), adds the Code Mode worker, and mounts a command-line provider plus an Ink renderer in the Host process. It does not start an HTTP server or browser runtime.

Run it through the shipped profile:

```sh
dsh tui
dsh tui --resume <session-id>
dsh tui --cwd ../project --model <provider>/<model>
dsh tui --theme sakura
```

The startup provider accepts `--resume`, `--cwd`, `--model`, `--theme`, `--inline`, `--no-color`, and `--no-unicode`. `NO_COLOR` also disables ANSI color. Redirected input or output fails before an Agent starts; the interactive renderer requires a VT-compatible terminal at least 30 columns by 8 rows.

## Themes

`classic`, `sakura`, `ocean`, and `ember` are built in. `Ctrl+T`, `/theme`, and `/themes` open the selector and persist its choice. `/theme <id>` selects directly. `--theme <id>` overrides startup without changing the saved preference.

The `tui` settings namespace also accepts complete custom themes:

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

Colors are six-digit hex values or Ink's `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, and `gray`. IDs use lowercase kebab-case. The registry accepts at most 20 custom themes and 10 art lines of at most 64 characters each; invalid stored selections fail during startup. Decorative art is an empty-transcript welcome canvas, not a layer over conversation content. It is suppressed below 84 columns or 14 transcript rows and whenever color or Unicode is disabled.

## Interaction

| Key | Action |
|---|---|
| `Enter` | Send a follow-up while idle or steering while running. |
| `Ctrl+J` | Insert a newline. |
| `Ctrl+C` | Cancel active work, or exit while idle. |
| `Ctrl+O` | Select a persisted Session. |
| `Ctrl+L` | Select a configured provider and model. |
| `Ctrl+T` | Select and persist a terminal theme. |
| `Ctrl+P` | Browse local and registered commands. |
| `PageUp` / `PageDown` | Page the transcript. |
| `Ctrl+E` | Return to the live transcript tail. |
| `Esc` | Cancel the active selector, approval, or question. |

Local `/new`, `/resume`, `/sessions`, `/model`, `/models`, `/theme`, `/themes`, `/commands`, `/help`, `/quit`, and `/exit` commands control the application and never enter the model transcript. Other slash commands dispatch through [`ctx.commands`](../../interaction/commands/README.md).

The controller owns one top-level Agent handle. Settled messages, reasoning activity, tool activity, command outcomes, Todo state, and errors are projected incrementally from the authoritative Session log. Raw reasoning text stays collapsed to an activity summary. Tool rows use each definition's `presentCall` and `presentResult` methods, with readable raw fallbacks for definitions unavailable during replay. Approvals and [`ctx.userQuestions`](../../interaction/user-questions/README.md) pause the current Agent until the user answers or cancels. Session switches flush and dispose the previous handle before publishing the next one.

Normal exit, startup failure, renderer failure, and process teardown unmount Ink, reveal the cursor, leave the alternate screen, flush the current Session, and dispose the Agent handle. `--inline` keeps output in the terminal's ordinary scrollback while retaining the same cleanup.

## Model Experience

### User input and terminal controls

#### What the model sees

User submissions are ordinary user messages. Steering uses the Agent inbox while a turn is running. TUI-local navigation, selectors, status text, and key hints are not model-visible; registered Harness commands retain their own logging and model-visible behavior.

#### Token effect

Only submitted user messages and registered `ctx.commands` effects add their ordinary data-dependent tokens. Terminal chrome, selectors, transcript paging, and collapsed reasoning summaries add none.

#### KV Cache effect

None. The TUI adds no request prefix content.

## Known Limitations and Deferred Work

- The terminal projection retains the newest 2,000 rows in memory; older rows remain durable and are available after resuming through other Session consumers.
- The application presents one current top-level Agent. Subagent work remains visible through the parent Session's logged tool activity rather than opening independent panes.
- VT input is required on Windows. Legacy consoles without ANSI/VT support must use Windows Terminal, a modern PowerShell host, or the Web interface.

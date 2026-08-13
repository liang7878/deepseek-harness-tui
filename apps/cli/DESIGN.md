# DeepSeek Harness TUI Design

## Intent

A developer runs the TUI inside a local terminal, SSH session, or multiplexer while reading code and supervising long-running agent work. The terminal background and ambient light are unknown, so every theme inherits the background and remaps a restrained semantic ANSI palette rather than imposing a dark or light canvas.

## Layout

The default view has four stable regions:

1. A one-line header shows the product name, workspace, model, session identity, and current agent state.
2. The transcript consumes available height and shows durable messages, tool calls, Todo state, and live streaming output in order.
3. A contextual status line shows key hints, pending work, paging position, or the current error.
4. The composer stays at the bottom and grows to a bounded number of lines.

Selectors and human decisions replace the transcript region temporarily instead of opening nested boxes. The header and status line remain visible so the user retains location and escape instructions.

At widths below 84 columns or transcript heights below 14 rows, decorative welcome art disappears. Below 80 columns, the header collapses to model and state, tool details abbreviate paths, and secondary shortcut hints disappear. Below 50 columns, the interface keeps only the transcript, modal prompt, and composer. Height limits reduce the retained transcript window rather than hiding the active prompt.

## Visual Language

The terminal background is never painted. Primary text uses the terminal foreground. Each resolved theme supplies accent, success, warning, error, and muted colors; every state also carries a word or symbol. Borders use single-cell rules only where they separate persistent regions.

The empty transcript may show a bounded static welcome canvas. Sakura Byte's original anime-inspired figure belongs to this project and references no existing character or franchise. The canvas disappears as soon as durable conversation rows exist and is suppressed by narrow dimensions, `NO_COLOR`, or ASCII mode. User-defined themes use the same limits.

Typography is the terminal's monospace face. Hierarchy comes from weight, spacing, and concise labels; uppercase is reserved for conventional status tokens such as `ESC` and `NO_COLOR`.

## Interaction

- `Enter` submits; `Ctrl+J` inserts a newline.
- `Ctrl+C` cancels active agent work; a second `Ctrl+C` while idle exits.
- `Ctrl+O` opens persisted sessions; `Ctrl+L` opens models; `Ctrl+T` opens themes; `Ctrl+P` opens commands.
- `PageUp` and `PageDown` page the transcript; `End` returns to the live tail.
- `Up` and `Down` navigate composer history when the cursor is on the first or last line.
- `Esc` closes a selector or rejects an interruptible prompt without changing the current session.
- Slash commands use the composed `ctx.commands` registry; TUI-owned navigation commands remain local and never enter the model transcript.

Approvals show the tool title and reason with explicit Allow once and Reject choices. User questions preserve caller labels, descriptions, multi-select behavior, custom text, and plan-review detail. Abort settles the owning request instead of leaving a hidden pending promise.

## Transcript

Human messages, assistant text, reasoning activity, tool calls, results, command outcomes, Todo snapshots, and turn failures have distinct prefixes. Raw reasoning text remains collapsed to an activity summary. Settled assistant content replaces its raw chunk stream. Tool cards use `ToolDefinition.presentCall` and `presentResult`; unknown or unloaded tools retain a generic name, parsed arguments, and raw result fallback.

Large logs are windowed. Paging changes the visible window without mutating the Session or pausing event capture. Streaming keeps the live tail pinned only while the user remains at the tail.

## Lifecycle and Failure

The application waits for Loader settlement before creating or resuming an Agent. One controller owns the current `AgentHandle`, question provider, approval listener, Ink renderer, and process signal hooks. Switching sessions drains and disposes the old handle before publishing the next one.

Terminal restoration runs for normal exit, startup rejection, renderer failure, `SIGINT`, and `SIGTERM`. A missing TTY, unsupported terminal size, unavailable persisted session, missing model, or absent credential produces a concrete correction. Secrets never enter TUI state, diagnostics, or snapshots.

## Compatibility

The supported runtime is Node.js 22 or newer on macOS, Linux, and Windows terminals with VT input. Color is optional. Unicode symbols have ASCII equivalents. Tests exercise resize, paste, cancellation, approvals, questions, long output, and process teardown through a pseudo-terminal.

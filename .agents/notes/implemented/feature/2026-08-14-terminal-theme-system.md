# Agent Note: Terminal theme system

Status: implemented

English | [中文](2026-08-14-terminal-theme-system.zh.md)

## Problem

The [terminal application](2026-08-14-terminal-user-interface.md) shipped one fixed cyan palette. Users could not adapt its visual identity, share a custom palette, or choose an expressive welcome state without editing renderer code. A decorative implementation could also compromise the TUI's narrow-terminal, monochrome, and active-work guarantees.

## Decision

`dsh-tui-app` owns a terminal-specific theme registry. `classic`, `sakura`, `ocean`, and `ember` are built in; the `tui` user-settings namespace can add complete custom themes. `--theme` selects an initial theme for one invocation, while `Ctrl+T`, `/theme`, and `/themes` use the same controller selector and persist through `ctx.settings`.

A resolved theme contains semantic accent, success, warning, error, and muted colors plus an empty-transcript welcome definition. Custom colors accept the bounded Ink color vocabulary or six-digit hexadecimal values. Registration validates ids, selected references, registry size, and art dimensions before the renderer receives a theme. Missing references and invalid stored sections fail during startup rather than falling back silently.

Sakura Byte's static anime-inspired figure is original project artwork and does not represent an existing character or franchise. Welcome art is not transcript background: it appears only while no durable rows are visible, and only when the terminal has color, Unicode, at least 84 columns, and at least 14 transcript rows. Active work, narrow terminals, `NO_COLOR`, and ASCII mode always use the compact layout.

## Ownership

`ctx.settings` owns validated persistence and live updates. `themes.ts` owns theme vocabulary, built-ins, custom-theme resolution, and limits. The controller owns selection and persistence. Ink components own presentation from the resolved theme and do not read the settings document.

The browser theme proposal remains independent because it owns DOM color-scheme presentation and browser Settings composition. This decision neither supersedes nor shares runtime definitions with that proposal.

## Alternatives considered

**Paint a full terminal background.** Terminal background colors behave inconsistently across local terminals, SSH, multiplexers, selection, and user accessibility settings. Themes inherit the terminal background and change semantic foreground colors only.

**Show artwork behind or beside every transcript.** Persistent decoration reduces the space available for tool output and can obscure the causal work record. The bounded empty-state canvas provides personality without competing with active work.

**Load executable theme modules.** User settings are a data plane, not an extension loader. Validated YAML keeps themes portable and prevents appearance configuration from executing code.

**Reuse browser theme definitions.** Browser themes resolve light, dark, and system preferences into DOM tokens. Terminal themes resolve ANSI foreground colors and capability-sensitive text art; sharing a type would couple unrelated presentation environments.

## Verification

Theme tests cover built-in and custom registry resolution, invalid references and collisions, persistence, live settings updates, and unknown ids. UI tests prove the canvas capability thresholds. Startup tests cover `--theme`; the pseudo-terminal suite covers the themed runtime and terminal restoration. The README recording runs the real `dsh tui` profile and switches themes through `Ctrl+T`.

## Consequences

Theme ids and custom fields are user-facing settings vocabulary. New built-ins must preserve semantic color roles and compact fallbacks. Richer presentation may extend the welcome definition, but durable transcript rows remain authoritative and always displace decorative art.

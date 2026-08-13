# DeepSeek Harness CLI Product

## Register

product

## Platform

adaptive

## Users

The primary users are software engineers who spend most of their workday in a terminal and need an agent to inspect, modify, and validate a local repository without switching to a browser. The interface must remain dependable over long sessions, remote shells, narrow panes, and terminals with limited color support.

## Product Purpose

The CLI provides a complete interactive terminal client over the same Agent, Session, tool, approval, command, and persistence services used by other DeepSeek Harness entry points. Success means a user can start, resume, supervise, and finish real coding work from one terminal process without losing durable history or bypassing safety decisions.

## Positioning

DeepSeek Harness exposes its plugin-composed agent runtime directly in the terminal instead of placing a separate protocol or reduced agent implementation between the user and the running composition.

## Brand Personality

Focused, transparent, and precise. The interface gives active work priority, explains blocked states in concrete language, and avoids decorative terminal effects.

## Anti-references

The CLI must not resemble a dashboard compressed into character cells, a chat transcript with hidden tool activity, or a full-screen application that assumes color, mouse input, or a large local terminal. It must not animate for decoration or replace standard terminal navigation with novel gestures.

## Design Principles

1. Keep authoritative work visible: model output, tool activity, approvals, questions, cancellation, and failures occupy the transcript in causal order.
2. Preserve terminal ownership: restore input mode, cursor state, and alternate-screen state on every exit path.
3. Make keyboard paths complete: every action works without a mouse and exposes its shortcut where the action appears.
4. Degrade without ambiguity: narrow, monochrome, non-Unicode, and non-interactive environments retain meaning rather than silently dropping controls.
5. Render from durable facts: settled conversation content comes from the Session log; live state supplements it without becoming a second history.

## Accessibility & Inclusion

Meaning never depends on color alone. Focus, status, and selection use text and symbols as well as color; `NO_COLOR` is honored. The interface supports terminal zoom and reflow, avoids timed interactions, limits motion to the terminal cursor, and provides a plain transcript fallback when interactive TTY capabilities are unavailable.

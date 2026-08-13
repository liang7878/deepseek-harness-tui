# Agent Note: Terminal user interface

Status: implemented

English | [中文](2026-08-14-terminal-user-interface.zh.md)

## Problem

DeepSeek Harness has a browser UI and a one-shot headless runner, but no interactive terminal entry point. A terminal user cannot supervise streaming work, answer approval and question requests, select a model, or resume durable sessions without starting the browser application or building a separate client over the API gateway.

## Decision

`dsh tui` is a first-party profile composed from `dsh-base` and a `dsh-tui-app` bundle. The app runs in the Host process and drives `ctx.agents`, `ctx.sessions`, `ctx.sessionPersistence`, `ctx.commands`, `ctx.userQuestions`, `ctx.approval`, and `ctx.llm` directly. It does not mount an HTTP server or duplicate the agent loop.

The bundle uses Ink with the repository's React 18 line. Ink owns terminal rendering and input decoding; the package owns the application state machine, Session projection, windowing, selectors, approval and question providers, and terminal-safe shutdown.

This decision satisfies the reintroduction condition in [the former TUI package removal](../simplification/2026-08-04-remove-tui-package.md): `dsh tui` is a named product composition with a new Host-owned package, explicit interaction providers, and assembled lifecycle and transcript acceptance. It does not restore or alias the deleted `packages/ui/tui` implementation.

Settled transcript content is projected from the Session log. Live agent status, pending questions, approvals, selectors, and editor state remain process-local. Tool rows call the registered tool's pure `presentCall` and `presentResult` methods and retain generic fallbacks when a definition is absent during replay.

The profile supports macOS, Linux, and Windows, honors `NO_COLOR`, retains text labels for every color state, adapts to narrow terminals, and restores terminal state on every exit path. A non-interactive invocation fails with a correction instead of starting a hidden agent.

The [terminal theme system](2026-08-14-terminal-theme-system.md) extends presentation through validated user settings while preserving these monochrome, narrow-terminal, and active-transcript guarantees.

## Ownership

`dsh-agent`, `dsh-session`, and each tool remain authoritative for runtime and durable facts. `dsh-tui-app` owns only terminal presentation, input editing, local navigation commands, and one current top-level Agent handle. Harness slash commands dispatch through `ctx.commands`; local navigation commands never enter the Session log.

## Runtime behavior

The profile supports creating, resuming, and switching sessions; streaming assistant output and collapsed reasoning activity; structured tool presentation; cancellation and steering; approvals and user questions; model and command selection; Todo display; transcript paging; resize; paste; monochrome operation; and bounded teardown. The terminal projection retains the newest 2,000 rows and marks omitted durable history explicitly.

## Alternatives considered

**Reuse the browser client over localhost.** This would add an HTTP server, transport serialization, trust configuration, and reconnection behavior to an interface running in the same process as the services it needs. It also makes terminal startup depend on built browser assets without improving isolation.

**Use OpenTUI.** Its native renderer offers higher throughput, but adds platform-specific native artifacts and a younger compatibility surface to every published CLI. Ink is sufficient for a bounded, windowed transcript and already supports the required Node and terminal platforms without native binaries.

**Extend the headless runner.** The one-shot runner intentionally owns no interactive lifecycle and exits after one turn. Adding session switching, modal questions, rendering, and input state would turn its narrow contract into two incompatible applications.

## Verification

Package tests cover projection, Unicode editing and paste, controller commands, model selection, approvals, structured questions, switch failure recovery, and disposal. A real pseudo-terminal process drives Ink input and verifies inline and alternate-screen restoration. The built `dsh tui` profile reaches the composer through the shipped profile, and the README recording exercises a real Volcengine model request.

## Consequences

Ink's React 18-compatible major receives fewer new features than its React 19 line, so the package uses stable primitives to keep a later runtime upgrade mechanical. The 2,000-row projection bound limits in-process terminal history while the complete Session remains durable. Same-process service access avoids transport duplication but requires the controller to use public operations and never mutate borrowed Session data.

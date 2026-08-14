/**
 * Incremental terminal projection of one Session log.
 * @module @deepseek-ai/dsh-tui-app/projection
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, TodoItem } from '@deepseek-ai/dsh-session'
import type { ToolRuntime, ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
// Type-only imports activate plugin-owned SessionEventMap entries.
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-user-approval'

/** One terminal transcript row. */
export interface TranscriptRow {
  key: string
  kind: 'user' | 'context' | 'assistant' | 'reasoning' | 'tool' | 'command' | 'error'
  label: string
  text: string
  status?: 'running' | 'success' | 'error'
}

interface ToolRowState {
  index: number
  name: string
  args: unknown
  callView: ToolCallView | undefined
}

const MAX_TRANSCRIPT_ROWS = 2_000

/**
 * Extract readable text from merge-extensible content blocks.
 * @param blocks - Model content to flatten for terminal display.
 * @returns Text with explicit placeholders for non-text content.
 */
export function contentText(blocks: readonly ContentBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
      case 'reasoning':
        parts.push(block.text)
        break
      case 'image':
        parts.push(`[image ${block.attachment.mediaType}]`)
        break
      case 'tool-call':
        break
      case 'tool-result':
        parts.push(contentText(block.content))
        break
      default: {
        // ContentBlockMap is merge-extensible; unknown blocks remain visible.
        const type = (block as { type?: unknown }).type
        parts.push(`[${typeof type === 'string' ? type : 'content'}]`)
      }
    }
  }
  return parts.join('')
}

/** Parse model-produced tool arguments without treating invalid JSON as empty. */
function parseArguments(source: string): unknown {
  try {
    return JSON.parse(source)
  } catch {
    return source
  }
}

function pretty(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function callText(view: ToolCallView | undefined, args: unknown): { label: string; text: string } {
  if (view === undefined) return { label: 'Tool', text: pretty(args) }
  switch (view.card) {
    case 'generic':
      return {
        label: view.title,
        text: [
          view.rawInput === undefined ? '' : pretty(view.rawInput),
          view.content === undefined ? '' : contentText(view.content),
        ].filter(Boolean).join('\n'),
      }
    case 'terminal':
      return {
        label: view.title,
        text: [view.description, view.cwd === undefined ? undefined : `cwd: ${view.cwd}`]
          .filter((value): value is string => value !== undefined).join('\n'),
      }
    case 'diff':
      return {
        label: view.title,
        text: view.diffs.map(diff => `${diff.oldText === null ? 'create' : 'edit'} ${diff.path}`).join('\n'),
      }
  }
}

function resultText(view: ToolResultView | undefined, fallback: string): string {
  if (view === undefined) return fallback
  switch (view.card) {
    case 'generic':
      return view.content === undefined ? fallback : contentText(view.content)
    case 'terminal':
      return [
        view.output ?? fallback,
        view.exitCode === undefined ? undefined : `exit ${view.exitCode}`,
        view.signal === undefined ? undefined : `signal ${view.signal}`,
      ].filter((value): value is string => value !== undefined && value !== '').join('\n')
    case 'diff':
      return view.diffs.map((diff) => {
        if (diff.oldText === null) return `+++ ${diff.path}\n${diff.newText.split('\n').map(line => `+ ${line}`).join('\n')}`
        return `--- ${diff.path}\n+++ ${diff.path}\n${diff.newText}`
      }).join('\n')
    case 'search':
      if (view.shape === 'paths') {
        return [...view.paths, view.truncated ? `… ${view.total - view.paths.length} more` : '']
          .filter(Boolean).join('\n')
      }
      return [
        ...view.files.flatMap(file => [
          file.path,
          ...file.matches.map(match => `  ${match.lineNumber}: ${match.line}`),
        ]),
        view.truncated ? `… ${view.total} matches total` : '',
      ].filter(Boolean).join('\n')
    case 'read':
      return view.lines.map(line => `${String(line.number).padStart(5)}  ${line.text}`).join('\n')
    case 'web':
      return pretty(view)
  }
}

/** Incrementally folds log events into terminal rows and the latest Todo list. */
export class TranscriptProjection {
  private rows: TranscriptRow[] = []
  private omittedRows = 0
  private todos: readonly TodoItem[] = []
  private readonly drafts = new Map<string, number>()
  private readonly toolsByCall = new Map<string, ToolRowState>()
  private readonly commands = new Map<string, number>()

  constructor(
    events: readonly SessionEvent[],
    private readonly tools: ToolRuntime | undefined,
    private readonly agent: Agent,
  ) {
    for (const event of events) this.apply(event)
  }

  /**
   * Read the current stable projection.
   * @returns Transcript rows and the latest durable Todo list.
   */
  snapshot(): { rows: readonly TranscriptRow[]; todos: readonly TodoItem[] } {
    return {
      rows: this.omittedRows === 0
        ? this.rows
        : [{
          key: 'transcript-omitted',
          kind: 'context',
          label: 'Earlier transcript',
          text: `${this.omittedRows} rows remain available in the persisted session.`,
          status: 'success',
        }, ...this.rows],
      todos: this.todos,
    }
  }

  /**
   * Fold one newly committed event.
   * @param event - Durable Session event to project.
   */
  apply(event: SessionEvent): void {
    switch (event.type) {
      case 'user/message': {
        const human = event.data.source.kind === 'user'
        if (!human) return
        this.push({
          key: `event-${event.seq}`,
          kind: 'user',
          label: 'You',
          text: contentText(event.data.content),
        })
        return
      }
      case 'assistant/chunk': {
        const chunk = event.data.chunk
        if (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta') return
        const key = `${event.data.turn}:${event.data.step}:${chunk.type}`
        const existing = this.drafts.get(key)
        if (existing === undefined) {
          this.drafts.set(key, this.rows.length)
          this.push({
            key: `draft-${key}`,
            kind: chunk.type === 'text-delta' ? 'assistant' : 'reasoning',
            label: chunk.type === 'text-delta' ? 'Assistant' : 'Thinking',
            text: chunk.text,
            status: 'running',
          })
        } else {
          const row = this.rows[existing]
          if (row !== undefined) this.replace(existing, { ...row, text: row.text + chunk.text })
        }
        return
      }
      case 'assistant/message': {
        const text = contentText(event.data.message.content.filter(block => block.type === 'text'))
        const reasoning = contentText(event.data.message.content.filter(block => block.type === 'reasoning'))
        this.settleDraft(`${event.data.turn}:${event.data.step}:reasoning-delta`, reasoning)
        this.settleDraft(`${event.data.turn}:${event.data.step}:text-delta`, text)
        if (text === '' && reasoning === '') {
          this.push({
            key: `event-${event.seq}`,
            kind: 'assistant',
            label: 'Assistant',
            text: '(tool call)',
            status: 'success',
          })
        }
        return
      }
      case 'tool/call': {
        const args = parseArguments(event.data.arguments)
        const definition = this.tools?.get(event.data.name, this.agent)
        let callView: ToolCallView | undefined
        try {
          callView = definition?.presentCall?.(args)
        } catch {
          callView = undefined
        }
        const rendered = callText(callView, args)
        const index = this.rows.length
        this.toolsByCall.set(String(event.data.callId), { index, name: event.data.name, args, callView })
        this.push({
          key: `tool-${event.data.callId}`,
          kind: 'tool',
          label: rendered.label === 'Tool' ? event.data.name : rendered.label,
          text: rendered.text,
          status: 'running',
        })
        return
      }
      case 'tool/result': {
        const block = event.data.message.content[0]
        const state = this.toolsByCall.get(String(block.toolCallId))
        if (state === undefined) {
          this.push({
            key: `event-${event.seq}`,
            kind: 'tool',
            label: 'Tool result',
            text: contentText(block.content),
            status: block.isError === true ? 'error' : 'success',
          })
          return
        }
        const definition = this.tools?.get(state.name, this.agent)
        let view: ToolResultView | undefined
        try {
          view = definition?.presentResult?.(state.args, {
            content: block.content,
            isError: block.isError === true,
            ...event.data.meta === undefined ? {} : { meta: event.data.meta },
          })
        } catch {
          view = undefined
        }
        const old = this.rows[state.index]
        if (old !== undefined) {
          this.replace(state.index, {
            ...old,
            label: view?.title ?? old.label,
            text: resultText(view, contentText(block.content)) || old.text,
            status: block.isError === true ? 'error' : 'success',
          })
        }
        return
      }
      case 'todo/write':
        this.todos = event.data.todos
        return
      case 'command/run': {
        const index = this.rows.length
        this.commands.set(String(event.data.commandId), index)
        this.push({
          key: `command-${event.data.commandId}`,
          kind: 'command',
          label: `/${event.data.name}`,
          text: event.data.args?.trim() ?? '',
          status: 'running',
        })
        return
      }
      case 'command/done': {
        const index = this.commands.get(String(event.data.commandId))
        const row = index === undefined ? undefined : this.rows[index]
        if (index !== undefined && row !== undefined) {
          this.replace(index, {
            ...row,
            text: event.data.text ?? row.text,
            status: event.data.kind === 'success' ? 'success' : 'error',
          })
        }
        return
      }
      case 'turn/end':
        if (event.data.reason.kind === 'error') {
          this.push({
            key: `event-${event.seq}`,
            kind: 'error',
            label: event.data.reason.error.code,
            text: event.data.reason.error.message,
            status: 'error',
          })
        }
        return
      default:
        return
    }
  }

  private settleDraft(key: string, text: string): void {
    const index = this.drafts.get(key)
    if (index === undefined) {
      if (text !== '') {
        const reasoning = key.endsWith(':reasoning-delta')
        this.push({
          key: `settled-${key}`,
          kind: reasoning ? 'reasoning' : 'assistant',
          label: reasoning ? 'Thinking' : 'Assistant',
          text,
          status: 'success',
        })
      }
      return
    }
    const row = this.rows[index]
    if (row !== undefined) this.replace(index, { ...row, text: text || row.text, status: 'success' })
    this.drafts.delete(key)
  }

  private push(row: TranscriptRow): void {
    this.rows = [...this.rows, row]
    const overflow = this.rows.length - MAX_TRANSCRIPT_ROWS
    if (overflow <= 0) return
    this.rows = this.rows.slice(overflow)
    this.omittedRows += overflow
    this.reindex(this.drafts, overflow)
    this.reindex(this.commands, overflow)
    for (const [callId, state] of this.toolsByCall) {
      if (state.index < overflow) this.toolsByCall.delete(callId)
      else this.toolsByCall.set(callId, { ...state, index: state.index - overflow })
    }
  }

  private replace(index: number, row: TranscriptRow): void {
    this.rows = [...this.rows.slice(0, index), row, ...this.rows.slice(index + 1)]
  }

  private reindex(map: Map<string, number>, removed: number): void {
    for (const [key, index] of map) {
      if (index < removed) map.delete(key)
      else map.set(key, index - removed)
    }
  }
}

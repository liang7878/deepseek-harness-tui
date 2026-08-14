/** Durable Session events projected into terminal transcript rows. */

import type { Agent } from '@deepseek-ai/dsh-agent'
import { createAssistantMessage, MessageId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { CommandId } from '@deepseek-ai/dsh-commands'
import { describe, expect, it } from 'vitest'
import { contentText, TranscriptProjection } from '../src/projection.ts'

function event<T extends SessionEvent['type']>(
  seq: number,
  type: T,
  data: Extract<SessionEvent, { type: T }>['data'],
): Extract<SessionEvent, { type: T }> {
  return { seq, time: seq, type, data } as Extract<SessionEvent, { type: T }>
}

describe('terminal transcript projection', () => {
  it('renders known and merge-extensible model content without hiding unknown blocks', () => {
    const blocks = [
      { type: 'text', text: 'answer ' },
      {
        type: 'image',
        attachment: {
          attachmentId: 'attachment-a',
          mediaType: 'image/png',
          bytes: 1,
          width: 1,
          height: 1,
        },
      },
      { type: 'future-block' },
    ] as unknown as ContentBlock[]
    expect(contentText(blocks)).toBe('answer [image image/png][future-block]')
  })

  it('settles streamed rows, commands, todos, and durable errors incrementally', () => {
    const projection = new TranscriptProjection([], undefined, {} as Agent)
    projection.apply(event(0, 'user/message', {
      role: 'user',
      id: MessageId('message-a'),
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'Fix it' }],
    }))
    projection.apply(event(1, 'assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'Work' },
    }))
    projection.apply(event(2, 'assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'ing' },
    }))
    projection.apply(event(3, 'assistant/message', {
      turn: 1,
      step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: 'Working' }],
        source: { provider: 'test', model: 'test' },
      }),
    }))
    projection.apply(event(4, 'todo/write', {
      todos: [{ content: 'Run tests', status: 'in_progress' }],
    }))
    projection.apply(event(5, 'command/run', {
      commandId: CommandId('command-a'),
      name: 'help',
      args: '  all  ',
      source: { kind: 'user' },
    }))
    projection.apply(event(6, 'command/done', {
      commandId: CommandId('command-a'),
      kind: 'success',
      text: 'Available commands',
    }))
    projection.apply(event(7, 'turn/end', {
      turn: 1,
      reason: { kind: 'error', error: { code: 'MODEL', message: 'provider failed' } },
    }))

    expect(projection.snapshot()).toEqual({
      rows: [
        expect.objectContaining({ kind: 'user', text: 'Fix it' }),
        expect.objectContaining({ kind: 'assistant', text: 'Working', status: 'success' }),
        expect.objectContaining({ kind: 'command', text: 'Available commands', status: 'success' }),
        expect.objectContaining({ kind: 'error', label: 'MODEL', text: 'provider failed' }),
      ],
      todos: [{ content: 'Run tests', status: 'in_progress' }],
    })

  })

  it('keeps model-only runtime context out of the human transcript', () => {
    const projection = new TranscriptProjection([
      event(0, 'user/message', {
        role: 'user',
        id: MessageId('context-a'),
        source: { kind: 'plugin', plugin: 'runtime-context' },
        content: [{ type: 'text', text: 'internal runtime context' }],
      }),
    ], undefined, {} as Agent)
    expect(projection.snapshot().rows).toEqual([])
  })

  it('bounds terminal memory while preserving an explicit durable-history marker', () => {
    const events = Array.from({ length: 2_001 }, (_, seq) => event(seq, 'user/message', {
      role: 'user',
      id: MessageId(`message-${seq}`),
      source: { kind: 'user' },
      content: [{ type: 'text', text: `message ${seq}` }],
    }))
    const projection = new TranscriptProjection(events, undefined, {} as Agent)
    const snapshot = projection.snapshot()
    expect(snapshot.rows).toHaveLength(2_001)
    expect(snapshot.rows[0]).toMatchObject({
      key: 'transcript-omitted',
      text: '1 rows remain available in the persisted session.',
    })
    expect(snapshot.rows.at(-1)?.text).toBe('message 2000')
  })
})

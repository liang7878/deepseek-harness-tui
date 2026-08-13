/** Self-executing scripted Host used only by the pseudo-terminal process test. */

import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox, type Agent, type AgentHandle, type CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import AgentDefaultModel from '@deepseek-ai/dsh-agent-default-model'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { apply } from '../src/index.ts'

class MemorySettings extends SettingsProvider {
  readonly writable = true

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve({})
  }

  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

const ctx = new Context()
await ctx.plugin(MemorySettings)
await ctx.plugin(SessionStore)
await ctx.plugin(AgentRegistry)
await ctx.plugin(AgentDefaultModel, { provider: 'demo', model: 'scripted' })

ctx.agents.setFactory({
  async createAgent(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle> {
    const session = ctx.sessions.create(options.sessionId, {
      ...options.meta === undefined ? {} : { meta: options.meta },
    })
    const agent = {} as Agent
    const agentCtx = ownerCtx.extend({ agent })
    Object.assign(agent, {
      id: session.id,
      options: options.agentOptions ?? {},
      session,
      inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
      status: 'idle',
      ctx: agentCtx,
      cancel: () => {},
      runMaintenance: () => Promise.reject(new Error('not used')),
      send: () => {},
      steer: (message) =>{  agent.followup(message) },
      inject: () => {},
      followup: (message) => {
        session.append('turn/start', { turn: 1 })
        session.append('step/start', { turn: 1, step: 1 })
        session.append('user/message', message, { surfaceOp: 'append' })
        session.append('assistant/message', {
          turn: 1,
          step: 1,
          message: createAssistantMessage({
            content: [{ type: 'text', text: 'Scripted response from the real TUI process.' }],
            source: { provider: 'demo', model: 'scripted' },
          }),
        }, { surfaceOp: 'append' })
        session.append('step/end', { turn: 1, step: 1 })
        session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      },
      whenIdle: () => Promise.resolve(),
    } satisfies Partial<Agent>)
    await options.setup?.(agentCtx)
    const unregister = ctx.agents.register(agent)
    return {
      agent,
      dispose: async () => {
        unregister()
        await agentCtx.fiber.dispose()
      },
    }
  },
  resume: () => Promise.reject(new Error('not used')),
})

ctx.provide('appExit', (code: number) => {
  process.exitCode = code
  setImmediate(() => void ctx.fiber.dispose())
})

apply(ctx, {
  cwd: process.cwd(),
  model: 'demo/scripted',
  inline: process.argv.includes('--inline'),
  color: false,
  unicode: !process.argv.includes('--no-unicode'),
})

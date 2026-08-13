/** Controller integration over real Agent, Session, approval, and question services. */

import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox, type Agent, type AgentHandle, type CreateAgentOptions, type ResumeAgentOptions } from '@deepseek-ai/dsh-agent'
import AgentDefaultModel from '@deepseek-ai/dsh-agent-default-model'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TuiController } from '../src/runtime.ts'

interface Bench {
  ctx: Context
  controller: TuiController
  agents: Agent[]
  followup: ReturnType<typeof vi.fn>
  steer: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
  flush: ReturnType<typeof vi.fn>
  saveSelection: ReturnType<typeof vi.fn>
  inspect: ReturnType<typeof vi.fn>
}

const benches: Bench[] = []

afterEach(async () => {
  for (const bench of benches.splice(0)) {
    await bench.controller.dispose()
    await bench.ctx.fiber.dispose()
  }
})

async function mounted(): Promise<Bench> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentDefaultModel, { provider: 'demo', model: 'default' })
  await ctx.plugin(ApprovalService)
  await ctx.plugin(UserQuestionService)
  const followup = vi.fn()
  const steer = vi.fn()
  const cancel = vi.fn()
  const flush = vi.spyOn(ctx.sessions, 'flush')
  const saveSelection = vi.spyOn(ctx.agentDefaultModel, 'saveSelection')
  const inspect = vi.fn(() => Promise.resolve({
    meta: { id: SessionId('resumed'), version: 0, createdAt: 1, cwd: '/resumed' },
    events: [],
  }))
  const agents: Agent[] = []

  const make = async (
    ownerCtx: Context,
    id: string,
    options: Pick<CreateAgentOptions, 'meta' | 'agentOptions' | 'setup'>,
  ): Promise<AgentHandle> => {
    const session = ctx.sessions.create(SessionId(id), {
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
      cancel,
      runMaintenance: () => Promise.reject(new Error('not used')),
      send: () => {},
      followup,
      steer,
      inject: () => {},
      whenIdle: () => Promise.resolve(),
    } satisfies Partial<Agent>)
    await options.setup?.(agentCtx)
    const unregister = ctx.agents.register(agent)
    agents.push(agent)
    return {
      agent,
      dispose: async () => {
        unregister()
        await agentCtx.fiber.dispose()
      },
    }
  }

  ctx.agents.setFactory({
    createAgent: (ownerCtx, options) => make(ownerCtx, String(options.sessionId), options),
    resume: (ownerCtx, options: ResumeAgentOptions) => make(ownerCtx, String(options.resumeSessionId), {
      ...options.agentOptions === undefined ? {} : { agentOptions: options.agentOptions },
      ...options.setup === undefined ? {} : { setup: options.setup },
      meta: { cwd: '/resumed' },
    }),
  })
  ctx.provide('sessionPersistence', {
    list: () => Promise.resolve([]),
    inspect,
  } as never)
  ctx.provide('llm', {
    listProviders: () => [{ id: 'demo', name: 'Demo Provider' }],
    listModels: () => Promise.resolve([{ id: 'next', name: 'Next Model' }]),
    resolveModelInfo: () => Promise.resolve({ id: 'next' }),
  } as never)
  ctx.provide('commands', {
    list: () => [{ name: 'inspect', description: 'Inspect state' }],
    execute: () => Promise.resolve(undefined),
  } as never)

  const controller = new TuiController(ctx, {
    cwd: '/workspace',
    model: 'demo/default',
    inline: true,
    color: false,
    unicode: false,
  })
  const bench = { ctx, controller, agents, followup, steer, cancel, flush, saveSelection, inspect }
  benches.push(bench)
  await controller.start()
  return bench
}

describe('TUI controller', () => {
  it('routes follow-up, steering, cancellation, and local exit without logging navigation', async () => {
    const bench = await mounted()
    await bench.controller.submit('first task')
    expect(bench.followup).toHaveBeenCalledOnce()
    Object.assign(bench.agents[0]!, { status: 'running' })
    await bench.controller.submit('change direction')
    expect(bench.steer).toHaveBeenCalledOnce()
    bench.controller.cancelWork()
    expect(bench.cancel).toHaveBeenCalledWith({ kind: 'user' })
    await bench.controller.submit('/quit')
    expect(bench.controller.getSnapshot().exitRequested).toBe(true)
    expect(bench.agents[0]!.session.events).toEqual([])
  })

  it('selects and persists a configured model', async () => {
    const bench = await mounted()
    const choosing = bench.controller.openModels()
    await vi.waitFor(() => {
      expect(bench.controller.getSnapshot().modal).toBeDefined()
    })
    expect(bench.controller.getSnapshot().modal).toMatchObject({
      kind: 'models',
      options: [{ value: 'demo/next', label: 'Next Model', description: 'Demo Provider' }],
    })
    bench.controller.submitModal(['demo/next'])
    await choosing
    expect(bench.controller.getSnapshot()).toMatchObject({ provider: 'demo', model: 'next' })
    expect(bench.saveSelection).toHaveBeenCalledWith({ provider: 'demo', model: 'next' })
  })

  it('answers approvals and structured multi-select questions', async () => {
    const bench = await mounted()
    const agent = bench.agents[0]!
    agent.session.append('turn/start', { turn: 1 })
    const approval = bench.ctx.approval.request({ agent, toolName: 'bash', reason: 'Run a build' })
    await vi.waitFor(() => {
      expect(bench.controller.getSnapshot().modal).toBeDefined()
    })
    expect(bench.controller.getSnapshot().modal).toMatchObject({ kind: 'approval', title: 'Approve bash?' })
    bench.controller.submitModal(['allowed-once'])
    await expect(approval).resolves.toBe('allowed-once')

    const question = bench.ctx.userQuestions.ask({
      agent,
      questions: [{
        id: 'targets',
        question: 'Which targets?',
        options: [{ label: 'unit' }, { label: 'e2e' }],
        multiSelect: true,
      }],
    })
    await vi.waitFor(() => {
      expect(bench.controller.getSnapshot().modal).toBeDefined()
    })
    expect(bench.controller.getSnapshot().modal).toMatchObject({ kind: 'question', multiSelect: true })
    bench.controller.submitModal(['unit', 'e2e'], 'plus smoke')
    await expect(question).resolves.toEqual({
      answers: [{ id: 'targets', selected: ['unit', 'e2e'], custom: 'plus smoke' }],
    })
  })

  it('restores the current state when a session switch fails', async () => {
    const bench = await mounted()
    bench.inspect.mockRejectedValueOnce(new Error('session is corrupt'))
    await bench.controller.submit('/resume broken')
    expect(bench.controller.getSnapshot()).toMatchObject({
      status: 'idle',
      notice: { kind: 'error', text: 'session is corrupt' },
    })
  })

  it('flushes the current Session before disposal', async () => {
    const bench = await mounted()
    const session = bench.agents[0]!.session
    await bench.controller.dispose()
    expect(bench.flush).toHaveBeenCalledWith(session)
  })
})

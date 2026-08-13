/**
 * Same-process controller for one interactive terminal application.
 * @module @deepseek-ai/dsh-tui-app/runtime
 */

import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  installModelSelection,
  type Agent,
  type AgentHandle,
  type AgentRegistry,
  type ModelSelection,
  type ModelSelectionRef,
} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionAnswerItem,
  AskUserQuestionItem,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import { TranscriptProjection, type TranscriptRow } from './projection.ts'

/** Startup configuration transferred from the command-line provider. */
export interface TuiConfig {
  /** Persisted Session identifier to resume instead of creating one. */
  resume?: string
  /** Absolute or invocation-relative workspace directory. */
  cwd: string
  /** Initial provider/model pair. */
  model?: string
  /** Whether rendering stays in ordinary terminal scrollback. */
  inline: boolean
  /** Whether ANSI color is enabled. */
  color: boolean
  /** Whether Unicode status symbols are enabled. */
  unicode: boolean
}

/** One option in a terminal decision or selector. */
export interface ModalOption {
  value: string
  label: string
  description?: string
}

/** Active modal state rendered over the transcript. */
export interface TuiModal {
  id: number
  kind: 'approval' | 'question' | 'sessions' | 'models' | 'commands' | 'help'
  title: string
  detail?: string
  options: readonly ModalOption[]
  multiSelect: boolean
  allowCustom: boolean
}

/** Immutable render snapshot. */
export interface TuiSnapshot {
  revision: number
  sessionId: string
  cwd: string
  provider: string
  model: string
  status: 'starting' | 'idle' | 'running' | 'switching' | 'error'
  rows: readonly TranscriptRow[]
  todos: readonly { content: string; status: 'pending' | 'in_progress' | 'completed' }[]
  modal: TuiModal | undefined
  notice: { kind: 'info' | 'error'; text: string } | undefined
  exitRequested: boolean
}

interface ModalSettlement {
  resolve(values: readonly string[], custom?: string): void
  cancel(): void
}

function splitModel(value: string): ModelSelection {
  const slash = value.indexOf('/')
  if (slash <= 0 || slash === value.length - 1) {
    throw new Error(`model must be provider/model, got ${JSON.stringify(value)}`)
  }
  return { provider: value.slice(0, slash), model: value.slice(slash + 1) }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function dateLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

/** Controller that owns the current Agent handle and every human interaction promise. */
export class TuiController {
  private readonly listeners = new Set<() => void>()
  private readonly disposers: Array<() => unknown> = []
  private snapshot: TuiSnapshot
  private handle: AgentHandle | undefined
  private agent: Agent | undefined
  private projection: TranscriptProjection | undefined
  private selection: (ModelSelectionRef & { current: ModelSelection }) | undefined
  private modalSettlement: ModalSettlement | undefined
  private modalSequence = 0
  private commandAbort: AbortController | undefined
  private disposed = false

  constructor(private readonly ctx: Context, private readonly config: TuiConfig) {
    const initial = config.model === undefined
      ? { provider: '', model: '' }
      : splitModel(config.model)
    this.snapshot = {
      revision: 0,
      sessionId: '',
      cwd: config.cwd,
      provider: initial.provider,
      model: initial.model,
      status: 'starting',
      rows: [],
      todos: [],
      modal: undefined,
      notice: undefined,
      exitRequested: false,
    }
  }

  /** Subscribe one renderer to immutable snapshot changes. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Read the current immutable render snapshot. */
  getSnapshot = (): TuiSnapshot => this.snapshot

  /** Register interaction providers and open the initial session. */
  async start(): Promise<void> {
    const sessionEventDispose = this.ctx.on('session/event', (session, event) => {
      if (session !== this.agent?.session) return
      this.projection?.apply(event)
      this.publishProjection()
    })
    const statusDispose = this.ctx.on('agent/status', ({ agent, status }) => {
      if (agent !== this.agent) return
      this.update({ status })
    })
    const errorDispose = this.ctx.on('agent/error', ({ agent, error }) => {
      if (agent !== this.agent) return
      this.update({ notice: { kind: 'error', text: errorMessage(error) } })
    })
    const approvalDispose = this.ctx.on('approval/request', async (request, next) => {
      if (request.agent !== this.agent) return next()
      return await this.requestApproval(request)
    })
    this.disposers.push(sessionEventDispose, statusDispose, errorDispose, approvalDispose)

    const questions = this.ctx.get('userQuestions')
    if (questions !== undefined) {
      this.disposers.push(questions.registerProvider({
        ask: (request) => {
          if (request.agent !== undefined && request.agent !== this.agent) {
            throw new Error('the terminal can answer questions only for its current root agent')
          }
          return this.requestQuestions(request)
        },
      }))
    }

    if (this.config.resume === undefined) await this.create(this.config.cwd, this.config.model)
    else await this.resume(this.config.resume)
  }

  /**
   * Submit user input as a local command, Harness command, follow-up, or steering message.
   * @param line - Composer contents to route.
   */
  async submit(line: string): Promise<void> {
    const text = line.trim()
    if (text === '') return
    try {
      if (text.startsWith('/')) {
        if (await this.localCommand(text)) return
        const agent = this.requireAgent()
        this.commandAbort?.abort(new Error('replaced by a newer command'))
        const controller = new AbortController()
        this.commandAbort = controller
        const execution = await this.ctx.get('commands')?.execute(agent, text, controller.signal)
        if (execution === undefined) {
          this.update({ notice: { kind: 'error', text: `Unknown command ${text.split(/\s/u, 1)[0]}. Use /help.` } })
        }
        return
      }
      const agent = this.requireAgent()
      const message = createUserMessage({
        content: [{ type: 'text', text: line }],
        source: { kind: 'user' },
      })
      if (agent.status === 'running') agent.steer(message)
      else agent.followup(message)
      this.update({ notice: undefined })
    } catch (error) {
      this.update({ notice: { kind: 'error', text: errorMessage(error) } })
    }
  }

  /** Cancel current agent work or an active command. */
  cancelWork(): void {
    this.commandAbort?.abort(new Error('cancelled by user'))
    this.commandAbort = undefined
    const agent = this.agent
    if (agent?.status === 'running') {
      agent.cancel({ kind: 'user' })
      this.update({ notice: { kind: 'info', text: 'Cancellation requested.' } })
    }
  }

  /** Open the persisted-session selector. */
  async openSessions(): Promise<void> {
    try {
      const headers = await this.requirePersistence().list()
      const options = headers
        .filter(header => header.id !== this.agent?.id)
        .sort((left, right) => right.createdAt - left.createdAt)
        .map(header => ({
          value: String(header.id),
          label: `${dateLabel(header.createdAt)}  ${basename(header.cwd ?? '(no workspace)')}`,
          description: `${header.id}${header.cwd === undefined ? '' : ` — ${header.cwd}`}`,
        }))
      if (options.length === 0) {
        this.update({ notice: { kind: 'info', text: 'No other persisted sessions.' } })
        return
      }
      const selected = await this.choose({
        kind: 'sessions', title: 'Resume session', options, multiSelect: false, allowCustom: false,
      })
      const id = selected.values[0]
      if (id !== undefined) await this.resume(id)
    } catch (error) {
      this.update({ notice: { kind: 'error', text: errorMessage(error) } })
    }
  }

  /** Open the provider/model selector. */
  async openModels(): Promise<void> {
    try {
      const llm = this.ctx.get('llm')
      if (llm === undefined) throw new Error('no LLM registry is configured')
      const options: ModalOption[] = []
      for (const provider of llm.listProviders()) {
        for (const model of await llm.listModels(provider.id)) {
          options.push({
            value: `${provider.id}/${model.id}`,
            label: model.name,
            description: provider.name,
          })
        }
      }
      if (options.length === 0) throw new Error('no configured models are available')
      const selected = await this.choose({
        kind: 'models', title: 'Select model', options, multiSelect: false, allowCustom: false,
      })
      const value = selected.values[0]
      if (value !== undefined) await this.selectModel(value)
    } catch (error) {
      this.update({ notice: { kind: 'error', text: errorMessage(error) } })
    }
  }

  /** Open local and registered command discovery. */
  async openCommands(): Promise<void> {
    const local: ModalOption[] = [
      { value: '/new', label: '/new [cwd]', description: 'Start a new session.' },
      { value: '/sessions', label: '/sessions', description: 'Resume persisted work.' },
      { value: '/models', label: '/models', description: 'Select a model.' },
      { value: '/help', label: '/help', description: 'Show keybindings and commands.' },
      { value: '/quit', label: '/quit', description: 'Exit after flushing the session.' },
    ]
    const commands: readonly CommandDescriptor[] = this.agent === undefined
      ? []
      : this.ctx.get('commands')?.list(this.agent) ?? []
    const options = [
      ...local,
      ...commands.map(command => ({
        value: `/${command.name}`,
        label: `/${command.name}${command.input === undefined ? '' : ` ${command.input.hint}`}`,
        description: command.description,
      })),
    ]
    const selected = await this.choose({
      kind: 'commands', title: 'Commands', options, multiSelect: false, allowCustom: false,
    }).catch(() => undefined)
    const value = selected?.values[0]
    if (value !== undefined) {
      this.update({ notice: { kind: 'info', text: `Type ${value} in the composer${value === '/new' ? ' followed by an optional directory' : ''}.` } })
    }
  }

  /**
   * Resolve the active modal from keyboard input.
   * @param values - Selected option values.
   * @param custom - Optional free-form answer.
   */
  submitModal(values: readonly string[], custom?: string): void {
    const settlement = this.modalSettlement
    if (settlement === undefined) return
    this.modalSettlement = undefined
    this.update({ modal: undefined })
    settlement.resolve(values, custom)
  }

  /** Cancel the active modal without leaving a pending provider request. */
  cancelModal(): void {
    const settlement = this.modalSettlement
    if (settlement === undefined) return
    this.modalSettlement = undefined
    this.update({ modal: undefined })
    settlement.cancel()
  }

  /** Ask the renderer to finish and let the process owner flush and dispose. */
  requestExit(): void {
    this.cancelModal()
    this.update({ exitRequested: true })
  }

  /** Flush and release every resource owned by this application controller. */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.cancelModal()
    this.commandAbort?.abort(new Error('TUI disposed'))
    if (this.agent !== undefined) {
      await this.ctx.get('sessions')?.flush(this.agent.session)
    }
    await this.handle?.dispose()
    this.handle = undefined
    this.agent = undefined
    for (const dispose of this.disposers.splice(0).reverse()) await dispose()
  }

  private async localCommand(line: string): Promise<boolean> {
    const [command, ...rest] = line.split(/\s+/u)
    switch (command) {
      case '/quit':
      case '/exit':
        this.requestExit()
        return true
      case '/new':
        await this.create(rest.join(' ') || this.snapshot.cwd)
        return true
      case '/resume': {
        const id = rest[0]
        if (id === undefined) await this.openSessions()
        else await this.resume(id)
        return true
      }
      case '/sessions':
        await this.openSessions()
        return true
      case '/models':
        await this.openModels()
        return true
      case '/model': {
        const value = rest[0]
        if (value === undefined) await this.openModels()
        else await this.selectModel(value)
        return true
      }
      case '/commands':
        await this.openCommands()
        return true
      case '/help':
        await this.showHelp()
        return true
      default:
        return false
    }
  }

  private async showHelp(): Promise<void> {
    await this.choose({
      kind: 'help',
      title: 'Keyboard and local commands',
      detail: [
        'Enter send  ·  Ctrl+J newline  ·  Ctrl+C cancel/exit',
        'Ctrl+O sessions  ·  Ctrl+L models  ·  Ctrl+P commands',
        'PageUp/PageDown transcript  ·  End live tail  ·  Esc close',
        '',
        '/new [cwd]  /resume [id]  /sessions  /model [provider/model]  /commands  /quit',
      ].join('\n'),
      options: [{ value: 'close', label: 'Close' }],
      multiSelect: false,
      allowCustom: false,
    }).catch(() => undefined)
  }

  private async create(cwd: string, model?: string): Promise<void> {
    const previousStatus = this.agent?.status
    this.update({ status: 'switching', notice: { kind: 'info', text: 'Starting a new session…' } })
    try {
      const selection = model === undefined
        ? this.requireDefaultModel().currentSelection()
        : splitModel(model)
      let newSelection: (ModelSelectionRef & { current: ModelSelection }) | undefined
      const handle = await this.requireAgents().create({
        sessionId: SessionId(`session-${randomUUID()}`),
        meta: { cwd },
        agentOptions: { provider: selection.provider, model: selection.model },
        setup: (agentCtx) => {
          const agent = agentCtx.agent
          if (agent === undefined) throw new Error('TUI agent setup has no scoped agent')
          let picked: ModelSelection | undefined = selection
          newSelection = {
            get current() {
              if (picked !== undefined) return picked
              const logged = agent.session.requestHeader()?.config
              return logged === undefined
                ? selection
                : {
                  provider: logged.provider,
                  model: logged.model,
                  ...logged.reasoningEffort === undefined ? {} : { reasoningEffort: logged.reasoningEffort },
                }
            },
            set current(next: ModelSelection) { picked = next },
            assembled: undefined,
          }
          installModelSelection(agentCtx, newSelection)
        },
      })
      await this.adopt(handle, newSelection)
    } catch (error) {
      if (previousStatus !== undefined) this.update({ status: previousStatus })
      throw error
    }
  }

  private async resume(id: string): Promise<void> {
    const previousStatus = this.agent?.status
    this.update({ status: 'switching', notice: { kind: 'info', text: `Resuming ${id}…` } })
    try {
      const inspection = await this.requirePersistence().inspect(SessionId(id))
      let newSelection: (ModelSelectionRef & { current: ModelSelection }) | undefined
      const fallback = this.requireDefaultModel().currentSelection()
      const handle = await this.requireAgents().resume({
        resumeSessionId: SessionId(id),
        agentOptions: this.agentOptionsFrom(inspection.meta, inspection.events),
        setup: (agentCtx) => {
          const agent = agentCtx.agent
          if (agent === undefined) throw new Error('TUI resume setup has no scoped agent')
          let picked: ModelSelection | undefined
          newSelection = {
            get current() {
              if (picked !== undefined) return picked
              const logged = agent.session.requestHeader()?.config
              return logged === undefined
                ? fallback
                : {
                  provider: logged.provider,
                  model: logged.model,
                  ...logged.reasoningEffort === undefined ? {} : { reasoningEffort: logged.reasoningEffort },
                }
            },
            set current(next: ModelSelection) { picked = next },
            assembled: undefined,
          }
          installModelSelection(agentCtx, newSelection)
        },
      })
      await this.adopt(handle, newSelection)
    } catch (error) {
      if (previousStatus !== undefined) this.update({ status: previousStatus })
      throw error
    }
  }

  private agentOptionsFrom(
    _meta: SessionHeader,
    events: readonly import('@deepseek-ai/dsh-session').SessionEvent[],
  ): { provider: string; model: string } {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event?.type === 'request/header') {
        return { provider: event.data.header.config.provider, model: event.data.header.config.model }
      }
    }
    const fallback = this.requireDefaultModel().currentSelection()
    return { provider: fallback.provider, model: fallback.model }
  }

  private async adopt(
    handle: AgentHandle,
    selection: (ModelSelectionRef & { current: ModelSelection }) | undefined,
  ): Promise<void> {
    const previousHandle = this.handle
    const previousAgent = this.agent
    try {
      if (previousAgent !== undefined) await this.ctx.get('sessions')?.flush(previousAgent.session)
      if (previousHandle !== undefined) await previousHandle.dispose()
    } catch (error) {
      await handle.dispose()
      throw error
    }
    this.handle = handle
    this.agent = handle.agent
    this.selection = selection
    this.projection = new TranscriptProjection(
      handle.agent.session.events,
      this.ctx.get('tools'),
      handle.agent,
    )
    const current = selection?.current ?? this.requireDefaultModel().currentSelection()
    const projection = this.projection.snapshot()
    this.update({
      sessionId: String(handle.agent.id),
      cwd: handle.agent.session.header.cwd ?? this.config.cwd,
      provider: current.provider,
      model: current.model,
      status: handle.agent.status,
      rows: projection.rows,
      todos: projection.todos,
      notice: undefined,
    })
  }

  private async selectModel(value: string): Promise<void> {
    const selected = splitModel(value)
    const llm = this.ctx.get('llm')
    if (llm === undefined) throw new Error('no LLM registry is configured')
    await llm.resolveModelInfo(selected.provider, selected.model)
    if (this.selection === undefined) throw new Error('current session has no model selection')
    this.selection.current = selected
    await this.requireDefaultModel().saveSelection(selected)
    this.update({
      provider: selected.provider,
      model: selected.model,
      notice: { kind: 'info', text: `Model set to ${value}; the next request records the change.` },
    })
  }

  private async requestApproval(request: ApprovalRequest): Promise<ApprovalOutcome> {
    if (request.signal?.aborted === true) return 'cancelled'
    const selected = await this.choose({
      kind: 'approval',
      title: `Approve ${request.toolName}?`,
      ...request.reason === undefined ? {} : { detail: request.reason },
      options: [
        { value: 'allowed-once', label: 'Allow once', description: 'Permit this action only.' },
        { value: 'rejected', label: 'Reject', description: 'Keep the current safety policy.' },
      ],
      multiSelect: false,
      allowCustom: false,
      ...request.signal === undefined ? {} : { signal: request.signal },
    }).catch(() => ({ values: ['cancelled'] as const }))
    const outcome = selected.values[0]
    return outcome === 'allowed-once' || outcome === 'rejected' ? outcome : 'cancelled'
  }

  private async requestQuestions(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> {
    const answers: AskUserQuestionAnswerItem[] = []
    for (const question of request.questions) {
      const answer = await this.requestQuestion(question, request.signal)
      answers.push(answer)
    }
    return { answers }
  }

  private async requestQuestion(
    question: AskUserQuestionItem,
    signal?: AbortSignal,
  ): Promise<AskUserQuestionAnswerItem> {
    const options = (question.options ?? []).map(option => ({
      value: option.label,
      label: option.label,
      ...option.description === undefined ? {} : { description: option.description },
    }))
    const detail = question.header === undefined
      ? question.detail
      : [question.question, question.detail].filter(Boolean).join('\n\n')
    const selected = await this.choose({
      kind: 'question',
      title: question.header ?? question.question,
      ...detail === undefined || detail === '' ? {} : { detail },
      options,
      multiSelect: question.multiSelect ?? false,
      allowCustom: true,
      ...signal === undefined ? {} : { signal },
    })
    return {
      id: question.id,
      selected: [...selected.values],
      ...selected.custom === undefined || selected.custom === '' ? {} : { custom: selected.custom },
    }
  }

  private choose(input: Omit<TuiModal, 'id'> & { signal?: AbortSignal }): Promise<{
    values: readonly string[]
    custom?: string
  }> {
    if (this.modalSettlement !== undefined) {
      return Promise.reject(new Error('another terminal interaction is already active'))
    }
    if (input.signal?.aborted === true) {
      return Promise.reject(input.signal.reason instanceof Error ? input.signal.reason : new Error('interaction aborted'))
    }
    const modal: TuiModal = { ...input, id: ++this.modalSequence }
    delete (modal as TuiModal & { signal?: AbortSignal }).signal
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        if (this.snapshot.modal?.id !== modal.id) return
        this.modalSettlement = undefined
        this.update({ modal: undefined })
        reject(input.signal?.reason instanceof Error ? input.signal.reason : new Error('interaction aborted'))
      }
      input.signal?.addEventListener('abort', onAbort, { once: true })
      const settle = (operation: () => void): void => {
        input.signal?.removeEventListener('abort', onAbort)
        operation()
      }
      this.modalSettlement = {
        resolve: (values, custom) => {
          settle(() =>{  resolve({ values, ...custom === undefined ? {} : { custom } }) })
        },
        cancel: () => {
          settle(() =>{  reject(new Error('interaction cancelled')) })
        },
      }
      this.update({ modal })
    })
  }

  private publishProjection(): void {
    const projection = this.projection?.snapshot()
    if (projection !== undefined) this.update({ rows: projection.rows, todos: projection.todos })
  }

  private update(patch: Partial<Omit<TuiSnapshot, 'revision'>>): void {
    this.snapshot = { ...this.snapshot, ...patch, revision: this.snapshot.revision + 1 }
    for (const listener of this.listeners) listener()
  }

  private requireAgent(): Agent {
    if (this.agent === undefined) throw new Error('the TUI has no active session')
    return this.agent
  }

  private requireAgents(): AgentRegistry {
    const service = this.ctx.get('agents')
    if (service === undefined) throw new Error('agent service is unavailable')
    return service
  }

  private requireDefaultModel(): Context['agentDefaultModel'] {
    const service = this.ctx.get('agentDefaultModel')
    if (service === undefined) throw new Error('default model service is unavailable')
    return service
  }

  private requirePersistence(): Context['sessionPersistence'] {
    const service = this.ctx.get('sessionPersistence')
    if (service === undefined) throw new Error('session persistence is unavailable')
    return service
  }
}

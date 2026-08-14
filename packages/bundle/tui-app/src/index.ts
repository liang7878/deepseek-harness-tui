/**
 * Interactive terminal application bundle runtime.
 * @module @deepseek-ai/dsh-tui-app
 */

import { render, type Instance } from 'ink'
import { createElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-cmdline'
import { TuiController, type TuiConfig } from './runtime.ts'
import { TuiApp } from './ui.tsx'

/** Stable Cordis plugin name. */
export const name = 'tui-runtime'
/** Startup values must exist before the runtime row resolves. */
export const inject = ['tuiStartup', 'settings']

/** Runtime configuration populated by the startup provider. */
export interface Config extends TuiConfig {}

/** Runtime schema. */
export const Config: z<Config> = z.object({
  resume: z.string(),
  cwd: z.string().required(),
  model: z.string(),
  theme: z.string(),
  inline: z.boolean().default(false),
  color: z.boolean().default(true),
  unicode: z.boolean().default(true),
})

interface TuiIo {
  stdin: NodeJS.ReadStream
  stdout: NodeJS.WriteStream
  stderr: NodeJS.WriteStream
}

/** Process streams; tests replace these before mounting the plugin. */
export const internals: TuiIo = {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
}

class TerminalOwner {
  private entered = false

  constructor(private readonly stdout: NodeJS.WriteStream, private readonly inline: boolean) {}

  enter(): void {
    if (this.entered) return
    this.entered = true
    if (!this.inline) this.stdout.write('\u001B[?1049h')
    this.stdout.write('\u001B[?25l')
  }

  leave(): void {
    if (!this.entered) return
    this.entered = false
    this.stdout.write('\u001B[?25h')
    if (!this.inline) this.stdout.write('\u001B[?1049l')
  }
}

interface RunningTui {
  controller?: TuiController
  instance?: Instance
  terminal: TerminalOwner
  stopped: boolean
}

function startupDiagnostic(stage: string): void {
  if (process.env.DSH_TUI_STARTUP_DIAGNOSTICS === '1') {
    internals.stderr.write(`[dsh-tui-startup] ${stage}\n`)
  }
}

async function stop(running: RunningTui): Promise<void> {
  if (running.stopped) return
  running.stopped = true
  running.instance?.unmount()
  running.terminal.leave()
  await running.controller?.dispose()
}

function isStopped(running: RunningTui): boolean {
  return running.stopped
}

async function run(ctx: Context, config: Config, running: RunningTui): Promise<void> {
  const loader: { await(): Promise<void> } | undefined = ctx.get('loader')
  await loader?.await()
  startupDiagnostic('loader ready')
  if (running.stopped) return
  if (!internals.stdin.isTTY || !internals.stdout.isTTY) {
    throw new Error('tui requires an interactive terminal; use `dsh --profile headless \"task\"` for redirected input or output')
  }
  if (internals.stdout.columns < 30 || internals.stdout.rows < 8) {
    throw new Error('tui requires a terminal at least 30 columns wide and 8 rows high')
  }

  running.terminal.enter()
  startupDiagnostic('terminal entered')
  const controller = new TuiController(ctx, config)
  running.controller = controller
  await controller.start()
  startupDiagnostic('controller ready')
  if (isStopped(running)) return
  const instance = render(createElement(TuiApp, {
    controller,
    color: config.color,
    unicode: config.unicode,
  }), {
    stdin: internals.stdin,
    stdout: internals.stdout,
    stderr: internals.stderr,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  startupDiagnostic('renderer mounted')
  running.instance = instance
  await instance.waitUntilExit()
  await stop(running)
  ctx.get('appExit')?.(0)
}

/** Mount the terminal application and bind its cleanup to the plugin fiber. */
export function apply(ctx: Context, config: Config): void {
  const running: RunningTui = {
    terminal: new TerminalOwner(internals.stdout, config.inline),
    stopped: false,
  }
  ctx.effect(() => () => stop(running), 'tui terminal lifecycle')
  void run(ctx, config, running).catch(async (error: unknown) => {
    await stop(running)
    internals.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`)
    ctx.get('appExit')?.(1)
  })
}

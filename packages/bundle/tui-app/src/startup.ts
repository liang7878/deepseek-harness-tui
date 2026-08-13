/**
 * Command-line provider for the interactive terminal profile.
 * @module @deepseek-ai/dsh-tui-app/startup
 */

import { resolve } from 'node:path'
import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'tui-startup'
/** Service required before profile arguments can be parsed. */
export const inject = ['cmdlineArgs']
/** Service provided to the TUI runtime row. */
export const TUI_STARTUP_SERVICE = 'tuiStartup'

/** Immutable values resolved from the terminal invocation. */
export interface TuiStartupValues {
  resume?: string
  cwd: string
  model?: string
  inline: boolean
  color: boolean
  unicode: boolean
}

interface TuiOptions {
  resume?: string
  cwd?: string
  model?: string
  inline?: boolean
  color?: boolean
  unicode?: boolean
}

/** Build a fresh parser for tests and process startup. */
function tuiCommand(): Command {
  return new Command()
    .name('dsh tui')
    .description('Run the interactive DeepSeek Harness terminal interface.')
    .helpOption('-h, --help', 'show this help')
    .option('-r, --resume <session>', 'resume a persisted session')
    .option('-C, --cwd <path>', 'working directory for a new session')
    .option('-m, --model <provider/model>', 'model for a new session')
    .option('--inline', 'render in terminal scrollback instead of the alternate screen')
    .option('--no-color', 'disable ANSI colors')
    .option('--no-unicode', 'use ASCII status symbols')
    .addHelpText('after', `
Examples:
  dsh tui
  dsh tui --resume session-abc
  dsh tui --cwd ../project --model deepseek-official/deepseek-v4-flash
`)
}

/** Parse and publish the TUI invocation. */
export function apply(ctx: Context): void {
  const program = tuiCommand()
  program.action(() => {
    const options = program.opts<TuiOptions>()
    if (options.resume === '') program.error('error: --resume needs a session id')
    if (options.model !== undefined && !/^[^/\s]+\/[^/\s]+$/u.test(options.model)) {
      program.error(`error: --model must be provider/model, got ${JSON.stringify(options.model)}`)
    }
    ctx.provide(TUI_STARTUP_SERVICE, {
      ...options.resume === undefined ? {} : { resume: options.resume },
      cwd: resolve(options.cwd ?? process.cwd()),
      ...options.model === undefined ? {} : { model: options.model },
      inline: options.inline ?? false,
      color: options.color !== false && process.env.NO_COLOR === undefined,
      unicode: options.unicode !== false,
    } satisfies TuiStartupValues)
  })
  parseCmdline(ctx, program)
}

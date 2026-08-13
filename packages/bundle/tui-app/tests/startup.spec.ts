/** Real Loader composition for the TUI command-line provider. */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { internals, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, TUI_STARTUP_SERVICE, type TuiStartupValues } from '../src/startup.ts'

interface Observed {
  exits: number[]
  out: string
  runtimeConfig?: unknown
}

const disposers: (() => Promise<void>)[] = []
const originalNoColor = process.env.NO_COLOR

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
  internals.stdout = process.stdout
  internals.stderr = process.stderr
  if (originalNoColor === undefined) delete process.env.NO_COLOR
  else process.env.NO_COLOR = originalNoColor
})

async function bootStartup(args: string[]): Promise<{
  startup: TuiStartupValues | undefined
  observed: Observed
}> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-tui-startup-'))
  const observed: Observed = { exits: [], out: '' }
  writeFileSync(join(dir, 'runtime.mjs'), 'export function apply(_ctx, config) { globalThis.__tuiObserved.runtimeConfig = config }\n')
  writeFileSync(join(dir, 'startup.mjs'), `
export const name = 'tui-startup'
export const inject = ['cmdlineArgs']
export const apply = ctx => globalThis.__tuiStartupApply(ctx)
`)
  writeFileSync(join(dir, 'cordis.yml'), [
    '- id: tui-runtime',
    `  name: ${pathToFileURL(join(dir, 'runtime.mjs')).href}`,
    `  inject: [${TUI_STARTUP_SERVICE}]`,
    '  config:',
    '    resume: !!js ctx.tuiStartup.resume',
    '    cwd: !!js ctx.tuiStartup.cwd',
    '    model: !!js ctx.tuiStartup.model',
    '    theme: !!js ctx.tuiStartup.theme',
    '    inline: !!js ctx.tuiStartup.inline',
    '    color: !!js ctx.tuiStartup.color',
    '    unicode: !!js ctx.tuiStartup.unicode',
    '- id: tui-startup',
    `  name: ${pathToFileURL(join(dir, 'startup.mjs')).href}`,
    '',
  ].join('\n'))
  const output = { write: (chunk: string) => { observed.out += chunk; return true } }
  internals.stdout = output
  internals.stderr = output
  const globals = globalThis as unknown as {
    __tuiStartupApply: typeof apply
    __tuiObserved: Observed
  }
  globals.__tuiStartupApply = apply
  globals.__tuiObserved = observed

  const ctx = new Context()
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  provideCmdline(ctx, { args, exit: code => void observed.exits.push(code) })
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(join(dir, 'cordis.yml')).href },
  })
  await ctx.loader.await()
  disposers.push(async () => { await ctx.fiber.dispose() })
  return {
    startup: ctx.get(TUI_STARTUP_SERVICE) as TuiStartupValues | undefined,
    observed,
  }
}

describe('TUI command-line provider', () => {
  it('projects validated options through the real Loader tree', async () => {
    process.env.NO_COLOR = '1'
    const { startup, observed } = await bootStartup([
      '--resume', 'session-a',
      '--cwd', '.',
      '--model', 'ark/deepseek-v4',
      '--theme', 'sakura',
      '--inline',
      '--no-unicode',
    ])
    expect(startup).toEqual({
      resume: 'session-a',
      cwd: process.cwd(),
      model: 'ark/deepseek-v4',
      theme: 'sakura',
      inline: true,
      color: false,
      unicode: false,
    })
    expect(observed.runtimeConfig).toEqual(startup)
    expect(observed.exits).toEqual([])
  })

  it('supplies terminal-friendly defaults without optional arguments', async () => {
    delete process.env.NO_COLOR
    const { startup, observed } = await bootStartup([])
    expect(startup).toEqual({
      cwd: process.cwd(),
      inline: false,
      color: true,
      unicode: true,
    })
    expect(observed.runtimeConfig).toEqual(startup)
    expect(observed.exits).toEqual([])
  })

  it.each([
    { args: ['--model', 'bare-model'], message: '--model must be provider/model' },
    { args: ['--resume='], message: '--resume needs a session id' },
    { args: ['--theme', 'Sakura'], message: '--theme must be a lowercase id' },
  ])('rejects invalid options before activating the runtime', async ({ args, message }) => {
    const { startup, observed } = await bootStartup(args)
    expect(observed.out).toContain(message)
    expect(startup).toBeUndefined()
    expect(observed.runtimeConfig).toBeUndefined()
    expect(observed.exits).toEqual([1])
  })

  it('prints app help without activating the runtime', async () => {
    const { startup, observed } = await bootStartup(['--help'])
    expect(observed.out).toContain('dsh tui')
    expect(startup).toBeUndefined()
    expect(observed.runtimeConfig).toBeUndefined()
    expect(observed.exits).toEqual([0])
  })
})

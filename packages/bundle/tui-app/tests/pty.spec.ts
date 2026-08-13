/** Real Ink input/output and terminal restoration through a pseudo-terminal. */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type IPty } from 'node-pty'
import { afterEach, describe, expect, it } from 'vitest'

const processes = new Set<IPty>()
const packageDir = fileURLToPath(new URL('..', import.meta.url))
const root = resolve(packageDir, '../../..')

afterEach(() => {
  for (const process of processes) process.kill()
  processes.clear()
})

function start(args: readonly string[] = []): {
  process: IPty
  output: () => string
  waitFor(text: string): Promise<void>
  type(text: string): Promise<void>
  exited: Promise<number>
} {
  const executable = process.execPath
  const child = spawn(executable, [
    '--import', 'tsx/esm',
    resolve(packageDir, 'tests/pty-entry.ts'),
    ...args,
  ], {
    name: 'xterm-256color',
    cols: 100,
    rows: 28,
    cwd: root,
    env: { ...process.env, NO_COLOR: '1' },
  })
  processes.add(child)
  let captured = ''
  const waiters = new Set<{ text: string; resolve(): void }>()
  child.onData((data) => {
    captured += data
    for (const waiter of waiters) {
      if (captured.includes(waiter.text)) {
        waiters.delete(waiter)
        waiter.resolve()
      }
    }
  })
  const exited = new Promise<number>((resolveExit) => {
    child.onExit(({ exitCode }) => {
      processes.delete(child)
      resolveExit(exitCode)
    })
  })
  return {
    process: child,
    output: () => captured,
    type: async (text) => {
      for (const character of Array.from(text)) {
        child.write(character)
        await new Promise(resolveWait => setTimeout(resolveWait, 100))
      }
    },
    waitFor: text => captured.includes(text)
      ? Promise.resolve()
      : new Promise<void>((resolveWait, reject) => {
        const waiter = { text, resolve: resolveWait }
        waiters.add(waiter)
        setTimeout(() => {
          if (!waiters.delete(waiter)) return
          reject(new Error(`timed out waiting for ${JSON.stringify(text)} in ${JSON.stringify(captured.slice(-500))}`))
        }, 30_000)
      }),
    exited,
  }
}

describe('TUI pseudo-terminal process', () => {
  it('accepts Unicode input, renders durable output, and restores an inline terminal', async () => {
    const terminal = start(['--inline', '--no-unicode'])
    await terminal.waitFor('Ready in')
    await terminal.type('请检查项目')
    terminal.process.write('\r')
    await terminal.waitFor('Scripted response from the real TUI process.')
    await terminal.type('/quit')
    terminal.process.write('\r')
    expect(await terminal.exited).toBe(0)
    expect(terminal.output()).toContain('请检查项目')
    expect(terminal.output()).toContain('\u001B[?25l')
    expect(terminal.output()).toContain('\u001B[?25h')
    expect(terminal.output()).not.toContain('\u001B[?1049h')
  }, 40_000)

  it('enters and leaves the alternate screen on normal exit', async () => {
    const terminal = start()
    await terminal.waitFor('Ready in')
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
    await terminal.type('/quit')
    terminal.process.write('\r')
    expect(await terminal.exited).toBe(0)
    expect(terminal.output()).toContain('\u001B[?1049h')
    expect(terminal.output()).toContain('\u001B[?1049l')
  }, 40_000)
})

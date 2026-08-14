/**
 * Install the generated host platform and meta tarballs into an isolated
 * project, then drive the installed dsh-tui bin through a real PTY.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  platformTarget,
  readDistributionManifest,
  resolveSafeOutputDirectory,
} from './build-npm-tui-package.ts'

const root = resolve(import.meta.dirname, '..')
const STARTUP_TIMEOUT_MS = 120_000

interface PtyProcess {
  readonly pid: number
  write(data: string): void
  kill(signal?: string): void
  onData(listener: (data: string) => void): void
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void
}

interface NodePty {
  spawn(
    file: string,
    args: readonly string[],
    options: {
      name: string
      cols: number
      rows: number
      cwd: string
      env: Record<string, string>
    },
  ): PtyProcess
}

function npmBin(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function tarballName(name: string, version: string): string {
  return `${name.replaceAll('/', '-')}-${version}.tgz`
}

function run(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, [...args], {
    cwd,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${String(result.status)}.`)
  }
}

async function type(process: PtyProcess, text: string): Promise<void> {
  for (const character of Array.from(text)) {
    process.write(character)
    await new Promise(resolveWait => setTimeout(resolveWait, 50))
  }
}

async function driveInstalledTui(project: string): Promise<void> {
  const packageRequire = createRequire(join(
    root,
    'packages',
    'subprocess',
    'subprocess-local',
    'package.json',
  ))
  const nodePty = packageRequire('node-pty') as NodePty
  const bin = join(
    project,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'dsh-tui.cmd' : 'dsh-tui',
  )
  if (!existsSync(bin)) throw new Error(`installed dsh-tui bin is missing at ${bin}.`)
  const dshHome = join(project, '.dsh')
  await mkdir(dshHome, { recursive: true })
  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      DSH_HOME: dshHome,
      DSH_TELEMETRY_DISABLED: '1',
      DSH_TUI_STARTUP_DIAGNOSTICS: '1',
      TERM: 'xterm-256color',
      NO_COLOR: undefined,
    }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
  const child = nodePty.spawn(bin, ['--theme', 'sakura'], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: project,
    env,
  })
  let output = ''
  const waiters = new Set<{
    readonly text: string
    readonly resolve: () => void
    readonly reject: (error: Error) => void
    readonly timer: NodeJS.Timeout
  }>()
  child.onData((data) => {
    output += data
    for (const waiter of waiters) {
      if (!output.includes(waiter.text)) continue
      clearTimeout(waiter.timer)
      waiters.delete(waiter)
      waiter.resolve()
    }
  })
  const exited = new Promise<number>((resolveExit) => {
    child.onExit((event) => {
      resolveExit(event.exitCode)
      for (const waiter of waiters) {
        clearTimeout(waiter.timer)
        waiters.delete(waiter)
        waiter.reject(new Error(
          `packed dsh-tui exited ${String(event.exitCode)} before `
          + `${JSON.stringify(waiter.text)} appeared: ${JSON.stringify(output.slice(-1_000))}`,
        ))
      }
    })
  })
  const waitFor = (text: string): Promise<void> => {
    if (output.includes(text)) return Promise.resolve()
    return new Promise<void>((resolveWait, reject) => {
      const timer = setTimeout(() => {
        const waiter = [...waiters].find(candidate => candidate.timer === timer)
        if (waiter !== undefined) waiters.delete(waiter)
        reject(new Error(
          `timed out waiting for ${JSON.stringify(text)} in packed TUI output: `
          + JSON.stringify(output.slice(-1_000)),
        ))
      }, STARTUP_TIMEOUT_MS)
      waiters.add({ text, resolve: resolveWait, reject, timer })
    })
  }

  try {
    await Promise.all([
      waitFor('SAKURA BYTE'),
      waitFor('Ctrl+P commands · Ctrl+T themes'),
    ])
    await type(child, '/quit')
    child.write('\r')
    let exitTimer: NodeJS.Timeout | undefined
    const exitCode = await Promise.race([
      exited,
      new Promise<number>((_, reject) => {
        exitTimer = setTimeout(() => {
          reject(new Error('packed dsh-tui did not exit after /quit.'))
        }, 15_000)
      }),
    ])
    if (exitTimer !== undefined) clearTimeout(exitTimer)
    if (exitCode !== 0) throw new Error(`packed dsh-tui exited ${String(exitCode)}, expected 0.`)
  } finally {
    for (const waiter of waiters) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('packed TUI process stopped before its expected output appeared.'))
    }
    waiters.clear()
    try {
      child.kill()
    } catch {
      // The PTY already exited; node-pty has no separate closed-state query.
    }
  }
}

/** Run the packed-install smoke against tarballs under --from. */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      from: { type: 'string', default: '.artifacts/npm-tui' },
    },
    allowPositionals: false,
    strict: true,
  })
  const manifest = await readDistributionManifest()
  const target = platformTarget(manifest, process.platform, process.arch)
  const artifacts = resolveSafeOutputDirectory(root, values.from)
  const metaTarball = join(artifacts, tarballName(manifest.metaPackage, manifest.version))
  const platformTarball = join(artifacts, tarballName(target.packageName, manifest.version))
  for (const tarball of [platformTarball, metaTarball]) {
    if (!existsSync(tarball)) {
      throw new Error(`required tarball is missing: ${tarball}; run pnpm run pack:npm-tui first.`)
    }
  }

  await mkdir(artifacts, { recursive: true })
  const project = await mkdtemp(join(artifacts, '.packed-install-'))
  try {
    await writeFile(join(project, 'package.json'), `${JSON.stringify({
      name: 'deepseek-harness-tui-packed-install-smoke',
      version: '0.0.0',
      private: true,
    }, null, 2)}\n`)
    run(npmBin(), [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      platformTarball,
      metaTarball,
    ], project)
    const installedManifest = JSON.parse(
      await readFile(join(project, 'node_modules', manifest.metaPackage, 'package.json'), 'utf8'),
    ) as { version?: unknown }
    if (installedManifest.version !== manifest.version) {
      throw new Error(
        `installed meta version ${String(installedManifest.version)} does not match ${manifest.version}.`,
      )
    }
    await driveInstalledTui(project)
    console.log(`verify-packed-npm-tui-install: ${target.key} packed install passed.`)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

await main()

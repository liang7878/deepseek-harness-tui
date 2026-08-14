#!/usr/bin/env node
/** Standalone launcher over the versioned official DeepSeek Harness engine. */

import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  DEFAULT_PROFILE_BUNDLES,
  initProfile,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'

const require = createRequire(import.meta.url)
const packageRoot = dirname(fileURLToPath(import.meta.url))
const profileName = 'deepseek-harness-tui'

/** Accept the old compatibility spelling without exposing Harness internals. */
export function normalizeLauncherArgs(args) {
  return args[0] === 'tui' ? args.slice(1) : [...args]
}

/** Resolve the official Harness CLI installed as this package's dependency. */
export function resolveHarnessCli(resolvePackageJson = name => require.resolve(`${name}/package.json`)) {
  return join(dirname(resolvePackageJson('@deepseek-ai/dsh')), 'lib', 'bin.js')
}

/** Replace package imports with immutable file URLs for this installed copy. */
export function createRuntimeOverlay(source, root = packageRoot) {
  const startup = pathToFileURL(join(root, 'dist', 'startup.js')).href
  const runtime = pathToFileURL(join(root, 'dist', 'index.js')).href
  return source
    .replace("name: 'deepseek-harness-tui/startup'", `name: ${JSON.stringify(startup)}`)
    .replace("name: 'deepseek-harness-tui'", `name: ${JSON.stringify(runtime)}`)
}

/** Initialize the dedicated user profile and materialize this run's overlay. */
export function prepareProfile(options = {}) {
  const root = options.packageRoot ?? packageRoot
  const name = options.profileName ?? profileName
  const dir = resolveProfileDir(name, options.home)
  initProfile(dir, DEFAULT_PROFILE_BUNDLES)
  const source = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  const overlay = join(dir, 'tui.runtime.patch.yml')
  writeFileSync(overlay, createRuntimeOverlay(source, root))
  return { name, overlay }
}

/** Run the standalone TUI and return the official engine's exit status. */
export function runLauncher(args, options = {}) {
  const writeError = options.writeError ?? (message => process.stderr.write(`${message}\n`))
  try {
    const profile = prepareProfile(options)
    const result = (options.spawn ?? spawnSync)(options.execPath ?? process.execPath, [
      options.cli ?? resolveHarnessCli(),
      '--profile',
      profile.name,
      '--patch',
      profile.overlay,
      ...normalizeLauncherArgs(args),
    ], {
      stdio: 'inherit',
      env: options.env ?? process.env,
    })
    if (result.error !== undefined) throw result.error
    if (result.status !== null) return result.status
    if (result.signal !== null) {
      const raiseSignal = options.raiseSignal ?? (signal => process.kill(process.pid, signal))
      raiseSignal(result.signal)
    }
    return 1
  } catch (error) {
    writeError(`deepseek-harness-tui: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

function isEntry() {
  const invoked = process.argv[1]
  if (invoked === undefined) return false
  try {
    return realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isEntry()) process.exitCode = runLauncher(process.argv.slice(2))

#!/usr/bin/env node
/** Launch the platform runtime carried by the optional package for this host. */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'))

/** Strip the compatibility subcommand accepted by the underlying dsh CLI. */
export function normalizeLauncherArgs(args) {
  return args[0] === 'tui' ? args.slice(1) : [...args]
}

/** Resolve the optional package name for one Node platform and architecture. */
export function platformPackageName(distribution, platform, arch) {
  const key = `${platform}-${arch}`
  const packageName = distribution.platformPackages?.[key]
  if (typeof packageName !== 'string') {
    const supported = Object.keys(distribution.platformPackages ?? {}).sort().join(', ')
    throw new Error(`unsupported platform ${key}; supported platforms: ${supported}`)
  }
  return packageName
}

/** Locate the standalone launcher inside the installed platform closure. */
export function resolveRuntimeCli(options = {}) {
  const distribution = options.manifest ?? manifest
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const packageName = platformPackageName(distribution, platform, arch)
  const resolvePackageJson = options.resolvePackageJson
    ?? (name => require.resolve(`${name}/package.json`))
  let packageJson
  try {
    packageJson = resolvePackageJson(packageName)
  } catch {
    throw new Error(
      `required optional package ${packageName} is not installed; `
      + 'reinstall deepseek-harness-tui without disabling optional dependencies',
    )
  }
  const cli = join(dirname(packageJson), 'runtime', 'node_modules', 'deepseek-harness-tui', 'launcher.mjs')
  const fileExists = options.fileExists ?? existsSync
  if (!fileExists(cli)) {
    throw new Error(`platform package ${packageName} is incomplete: missing ${cli}`)
  }
  return { packageName, cli }
}

/** Run the packaged standalone TUI and return the child exit status. */
export function runLauncher(args, options = {}) {
  const writeError = options.writeError ?? (message => process.stderr.write(`${message}\n`))
  let resolved
  try {
    resolved = resolveRuntimeCli(options)
  } catch (error) {
    writeError(`deepseek-harness-tui: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }

  const spawn = options.spawn ?? spawnSync
  const result = spawn(options.execPath ?? process.execPath, [
    resolved.cli,
    ...normalizeLauncherArgs(args),
  ], {
    stdio: 'inherit',
    env: options.env ?? process.env,
  })
  if (result.error !== undefined) {
    writeError(`deepseek-harness-tui: failed to start ${resolved.packageName}: ${result.error.message}`)
    return 1
  }
  if (result.status !== null) return result.status
  if (result.signal !== null) {
    const raiseSignal = options.raiseSignal ?? (signal => process.kill(process.pid, signal))
    raiseSignal(result.signal)
  }
  return 1
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

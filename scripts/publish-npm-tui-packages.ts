/**
 * Validate and publish one complete DeepSeek Harness TUI npm artifact set.
 * Native packages publish before the meta package; matching remote bytes make
 * retries idempotent, while an existing different tarball is a collision.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  readDistributionManifest,
  resolveSafeOutputDirectory,
} from './build-npm-tui-package.ts'

const root = resolve(import.meta.dirname, '..')

interface PackedPackage {
  readonly name: string
  readonly version: string
  readonly tarball: string
  readonly integrity: string
}

type RegistryState =
  | { readonly kind: 'absent' }
  | { readonly kind: 'present'; readonly integrity: string }

function capture(command: string, args: readonly string[]): {
  readonly status: number
  readonly stdout: string
  readonly stderr: string
} {
  const result = spawnSync(command, [...args], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  })
  if (result.error !== undefined) throw result.error
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

async function packedPackage(path: string): Promise<PackedPackage> {
  const result = capture('tar', ['-xOzf', path, 'package/package.json'])
  if (result.status !== 0) throw new Error(`cannot read ${path}:\n${result.stdout}\n${result.stderr}`)
  const manifest: unknown = JSON.parse(result.stdout)
  if (manifest === null || typeof manifest !== 'object') throw new Error(`${path} has no package manifest.`)
  const { name, version } = manifest as Record<string, unknown>
  if (typeof name !== 'string' || typeof version !== 'string') {
    throw new Error(`${path} manifest lacks a string name and version.`)
  }
  const integrity = `sha512-${createHash('sha512').update(await readFile(path)).digest('base64')}`
  return { name, version, tarball: path, integrity }
}

function registryState(pkg: PackedPackage): RegistryState {
  const result = capture('npm', ['view', `${pkg.name}@${pkg.version}`, 'dist.integrity', '--json'])
  if (result.status !== 0) {
    const output = `${result.stdout}${result.stderr}`
    if (output.includes('E404') || output.includes('404 Not Found')) return { kind: 'absent' }
    throw new Error(`npm view ${pkg.name}@${pkg.version} failed:\n${output}`)
  }
  const integrity: unknown = JSON.parse(result.stdout)
  if (typeof integrity !== 'string' || integrity === '') {
    throw new Error(`npm returned no integrity for ${pkg.name}@${pkg.version}.`)
  }
  return { kind: 'present', integrity }
}

function publish(pkg: PackedPackage): void {
  const result = spawnSync('npm', [
    'publish',
    pkg.tarball,
    '--access',
    'public',
    '--tag',
    'latest',
    '--provenance',
  ], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`npm publish ${pkg.name}@${pkg.version} exited with status ${String(result.status)}.`)
  }
}

/** Validate the complete artifact set and optionally publish it. */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      'check-only': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  })
  if (values.from === undefined) {
    throw new Error('usage: publish-npm-tui-packages.ts --from <artifact-directory> [--check-only]')
  }
  const manifest = await readDistributionManifest()
  const directory = resolveSafeOutputDirectory(root, values.from)
  const expectedNames = new Set([
    manifest.metaPackage,
    ...Object.values(manifest.platformPackages),
  ])
  const filenames = (await readdir(directory)).filter(name => name.endsWith('.tgz')).sort()
  const packages = await Promise.all(filenames.map(name => packedPackage(join(directory, name))))
  const actualNames = new Set(packages.map(pkg => pkg.name))
  if (
    packages.length !== expectedNames.size
    || actualNames.size !== expectedNames.size
    || [...expectedNames].some(name => !actualNames.has(name))
  ) {
    throw new Error(
      `artifact set must contain exactly ${[...expectedNames].sort().join(', ')}; `
      + `found ${[...actualNames].sort().join(', ') || '(none)'}.`,
    )
  }
  for (const pkg of packages) {
    if (pkg.version !== manifest.version) {
      throw new Error(`${pkg.name} version ${pkg.version} does not match distribution version ${manifest.version}.`)
    }
  }
  const ordered = packages.sort((left, right) => {
    if (left.name === manifest.metaPackage) return 1
    if (right.name === manifest.metaPackage) return -1
    return left.name.localeCompare(right.name)
  })

  const pending: PackedPackage[] = []
  for (const pkg of ordered) {
    const state = registryState(pkg)
    if (state.kind === 'absent') {
      pending.push(pkg)
      continue
    }
    if (state.integrity !== pkg.integrity) {
      throw new Error(
        `${pkg.name}@${pkg.version} collides with different registry content`
        + `\n  registry: ${state.integrity}\n  artifact: ${pkg.integrity}`,
      )
    }
    console.log(`publish-npm-tui-packages: ${pkg.name}@${pkg.version} already matches; skipping.`)
  }
  console.log(
    `publish-npm-tui-packages: validated ${String(ordered.length)} package(s), `
    + `${String(pending.length)} pending publication.`,
  )
  if (values['check-only']) return
  for (const pkg of pending) {
    publish(pkg)
    console.log(`publish-npm-tui-packages: published ${pkg.name}@${pkg.version}.`)
  }
}

await main()

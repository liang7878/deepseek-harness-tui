/**
 * Build the unscoped DeepSeek Harness TUI npm meta package and one native
 * platform closure. Public package metadata comes from distribution/manifest.json.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  chmod,
  copyFile,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { gunzipSync, gzipSync } from 'node:zlib'

const root = resolve(import.meta.dirname, '..')
const distributionRoot = join(root, 'distribution')
const distributionManifestPath = join(distributionRoot, 'manifest.json')
const deployManifestPath = join(distributionRoot, 'npm-runtime', 'package.json')
const deploySourceNodeModules = join(distributionRoot, 'npm-runtime', 'node_modules')
const defaultOutputDirectory = '.artifacts/npm-tui'
const deployRootPackage = 'dsh-tui-npm-runtime'
const fixedTimestamp = new Date('2000-01-01T00:00:00.000Z')

/** Supported native build target. */
export interface PlatformTarget {
  readonly key: string
  readonly platform: NodeJS.Platform
  readonly arch: 'arm64' | 'x64'
  readonly packageName: string
}

/** Checked-in metadata shared by every generated public package. */
export interface DistributionManifest {
  readonly version: string
  readonly description: string
  readonly metaPackage: string
  readonly platformPackages: Readonly<Record<string, string>>
  readonly engines: Readonly<Record<string, string>>
  readonly license: string
  readonly repository: {
    readonly type: string
    readonly url: string
    readonly directory: string
  }
}

/** Parsed build mode and output selection. */
export type BuildPlan =
  | {
    readonly mode: 'meta'
    readonly skipBuild: boolean
    readonly outputDirectory: string
  }
  | {
    readonly mode: 'both' | 'platform'
    readonly skipBuild: boolean
    readonly outputDirectory: string
    readonly target: PlatformTarget
  }

const supportedPairs = [
  ['darwin', 'arm64'],
  ['darwin', 'x64'],
  ['linux', 'arm64'],
  ['linux', 'x64'],
  ['win32', 'x64'],
] as const satisfies readonly (readonly [NodeJS.Platform, PlatformTarget['arch']])[]

/**
 * Resolve pnpm through the JavaScript entrypoint supplied by the invoking
 * package script so Windows does not need to spawn a `.cmd` shim.
 * @param entrypoint - pnpm's current JavaScript entrypoint.
 * @param args - pnpm arguments.
 * @returns A shell-free Node invocation.
 */
export function resolvePnpmInvocation(
  entrypoint: string | undefined,
  args: readonly string[],
): { command: string; args: string[] } {
  if (entrypoint === undefined || entrypoint === '') {
    throw new Error('pnpm entrypoint is unavailable; invoke the builder through a pnpm package script.')
  }
  return { command: process.execPath, args: [entrypoint, ...args] }
}

/**
 * Read and validate the distribution manifest.
 * @param path - manifest path, primarily injectable for tests.
 * @returns Validated distribution metadata.
 */
export async function readDistributionManifest(path = distributionManifestPath): Promise<DistributionManifest> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (parsed === null || typeof parsed !== 'object') throw new Error(`${path} must contain an object.`)
  const manifest = parsed as Partial<DistributionManifest>
  if (
    typeof manifest.version !== 'string'
    || typeof manifest.description !== 'string'
    || typeof manifest.metaPackage !== 'string'
    || manifest.platformPackages === undefined
    || typeof manifest.platformPackages !== 'object'
    || manifest.engines === undefined
    || typeof manifest.engines !== 'object'
    || typeof manifest.license !== 'string'
    || manifest.repository === undefined
    || typeof manifest.repository.type !== 'string'
    || typeof manifest.repository.url !== 'string'
    || typeof manifest.repository.directory !== 'string'
  ) {
    throw new Error(`${path} is missing required distribution metadata.`)
  }
  if (manifest.metaPackage.startsWith('@')) throw new Error(`${path}: metaPackage must be unscoped.`)
  const expectedKeys = new Set(supportedPairs.map(([platform, arch]) => `${platform}-${arch}`))
  const actualKeys = Object.keys(manifest.platformPackages)
  if (actualKeys.length !== expectedKeys.size || actualKeys.some(key => !expectedKeys.has(key))) {
    throw new Error(`${path}: platformPackages must define exactly ${[...expectedKeys].join(', ')}.`)
  }
  const names = [manifest.metaPackage, ...Object.values(manifest.platformPackages)]
  if (names.some(name => typeof name !== 'string' || name.startsWith('@'))) {
    throw new Error(`${path}: every public package name must be an unscoped string.`)
  }
  if (new Set(names).size !== names.length) throw new Error(`${path}: public package names must be unique.`)
  return manifest as DistributionManifest
}

/**
 * Map one Node platform pair to its generated package.
 * @param manifest - checked-in distribution metadata.
 * @param platform - Node platform identifier.
 * @param arch - Node CPU architecture.
 * @returns The supported platform target.
 */
export function platformTarget(
  manifest: DistributionManifest,
  platform: NodeJS.Platform,
  arch: string,
): PlatformTarget {
  const supported = supportedPairs.some(([candidatePlatform, candidateArch]) => (
    candidatePlatform === platform && candidateArch === arch
  ))
  if (!supported) {
    throw new Error(
      `unsupported platform ${platform}-${arch}; supported platforms: `
      + supportedPairs.map(pair => pair.join('-')).join(', '),
    )
  }
  const key = `${platform}-${arch}`
  const packageName = manifest.platformPackages[key]
  if (packageName === undefined) throw new Error(`distribution manifest has no package for ${key}.`)
  return { key, platform, arch: arch as PlatformTarget['arch'], packageName }
}

/**
 * Parse the package builder's command-line arguments.
 * @param argv - raw command arguments.
 * @param manifest - distribution metadata.
 * @param host - host platform used for defaults and native-build validation.
 * @returns A validated build plan.
 */
export function parseBuildArguments(
  argv: readonly string[],
  manifest: DistributionManifest,
  host: { readonly platform: NodeJS.Platform; readonly arch: string } = process,
): BuildPlan {
  const args = argv[0] === '--' ? argv.slice(1) : argv
  const { values } = parseArgs({
    args: [...args],
    options: {
      platform: { type: 'string' },
      arch: { type: 'string' },
      'skip-build': { type: 'boolean', default: false },
      'platform-only': { type: 'boolean', default: false },
      'meta-only': { type: 'boolean', default: false },
      output: { type: 'string', default: defaultOutputDirectory },
    },
    allowPositionals: false,
    strict: true,
  })
  if (values['platform-only'] && values['meta-only']) {
    throw new Error('--platform-only and --meta-only are mutually exclusive.')
  }
  const outputDirectory = values.output
  if (values['meta-only']) {
    if (values.platform !== undefined || values.arch !== undefined) {
      throw new Error('--platform and --arch do not apply to --meta-only.')
    }
    return { mode: 'meta', skipBuild: values['skip-build'], outputDirectory }
  }
  const platform = (values.platform ?? host.platform) as NodeJS.Platform
  const arch = values.arch ?? host.arch
  return {
    mode: values['platform-only'] ? 'platform' : 'both',
    skipBuild: values['skip-build'],
    outputDirectory,
    target: platformTarget(manifest, platform, arch),
  }
}

/**
 * Generate the public meta package manifest.
 * @param manifest - checked-in distribution metadata.
 * @returns An npm-ready package manifest.
 */
export function generateMetaPackageManifest(manifest: DistributionManifest): Record<string, unknown> {
  return {
    name: manifest.metaPackage,
    version: manifest.version,
    description: manifest.description,
    license: manifest.license,
    repository: manifest.repository,
    type: 'module',
    engines: manifest.engines,
    publishConfig: { access: 'public' },
    keywords: ['deepseek', 'coding-agent', 'terminal', 'tui'],
    bin: {
      'deepseek-harness-tui': 'launcher.mjs',
      'dsh-tui': 'launcher.mjs',
    },
    files: ['launcher.mjs', 'manifest.json', 'README.md', 'LICENSE'],
    optionalDependencies: Object.fromEntries(
      Object.values(manifest.platformPackages).sort().map(name => [name, manifest.version]),
    ),
  }
}

/**
 * Generate one public native platform package manifest.
 * @param manifest - checked-in distribution metadata.
 * @param target - target OS and CPU.
 * @returns An npm-ready package manifest.
 */
export function generatePlatformPackageManifest(
  manifest: DistributionManifest,
  target: PlatformTarget,
): Record<string, unknown> {
  return {
    name: target.packageName,
    version: manifest.version,
    description: `${manifest.description} (${target.key})`,
    license: manifest.license,
    repository: manifest.repository,
    type: 'module',
    engines: manifest.engines,
    publishConfig: { access: 'public' },
    os: [target.platform],
    cpu: [target.arch],
    files: ['runtime', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'],
  }
}

/**
 * Reject output directories whose staging child cannot be cleared safely.
 * @param repositoryRoot - absolute repository root.
 * @param requested - user-provided output path.
 * @returns The absolute safe output directory.
 */
export function resolveSafeOutputDirectory(repositoryRoot: string, requested: string): string {
  const output = resolve(repositoryRoot, requested)
  const pathFromRoot = relative(repositoryRoot, output)
  if (
    pathFromRoot === '.artifacts'
    || !pathFromRoot.startsWith(`.artifacts${sep}`)
    || pathFromRoot.startsWith(`..${sep}`)
    || isAbsolute(pathFromRoot)
  ) {
    throw new Error(`refusing non-generated output directory ${output}; use a child of .artifacts`)
  }
  return output
}

function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args].map(part => (part.includes(' ') ? JSON.stringify(part) : part)).join(' ')
}

function run(command: string, args: readonly string[], cwd = root): void {
  console.log(`build-npm-tui-package: ${formatCommand(command, args)}`)
  const result = spawnSync(command, [...args], {
    cwd,
    env: { ...process.env, CI: 'true' },
    stdio: 'inherit',
    shell: false,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${formatCommand(command, args)} exited with status ${String(result.status)}.`)
  }
}

function capture(command: string, args: readonly string[], cwd = root): string {
  const result = spawnSync(command, [...args], {
    cwd,
    env: { ...process.env, CI: 'true' },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    shell: false,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    const output = `${result.stdout}\n${result.stderr}`.slice(-8_000)
    throw new Error(
      `${formatCommand(command, args)} exited with status ${String(result.status)}:\n${output}`,
    )
  }
  return result.stdout
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function copyPackageFiles(stage: string, platform: boolean): Promise<void> {
  await copyFile(join(distributionRoot, 'README.md'), join(stage, 'README.md'))
  await copyFile(join(root, 'LICENSE'), join(stage, 'LICENSE'))
  if (platform) {
    await copyFile(join(root, 'THIRD_PARTY_NOTICES.md'), join(stage, 'THIRD_PARTY_NOTICES.md'))
  }
}

async function restoreLegacyHoists(runtime: string): Promise<void> {
  const deployed = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  const restored: string[] = []
  for (const dependency of Object.keys(deployed.dependencies ?? {}).sort()) {
    const destination = join(runtime, 'node_modules', dependency)
    if (existsSync(destination)) continue
    const source = join(deploySourceNodeModules, dependency)
    if (!existsSync(source)) {
      throw new Error(`deployed dependency ${dependency} is missing from ${destination} and ${source}.`)
    }
    await mkdir(dirname(destination), { recursive: true })
    const nestedNodeModules = join(source, 'node_modules')
    await cp(source, destination, {
      recursive: true,
      dereference: true,
      preserveTimestamps: true,
      filter: path => path !== nestedNodeModules && !path.startsWith(`${nestedNodeModules}${sep}`),
    })
    restored.push(dependency)
  }
  const missing = Object.keys(deployed.dependencies ?? {})
    .filter(dependency => !existsSync(join(runtime, 'node_modules', dependency)))
  if (missing.length > 0) throw new Error(`deployed dependencies remain missing: ${missing.join(', ')}.`)
  if (restored.length > 0) console.log(`build-npm-tui-package: restored deploy hoists: ${restored.join(', ')}`)
}

async function findSymlink(directory: string): Promise<string | undefined> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) return path
    if (metadata.isDirectory()) {
      const nested = await findSymlink(path)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

async function materializeSymlinks(runtime: string): Promise<void> {
  const nodeModules = join(runtime, 'node_modules')
  let link = await findSymlink(nodeModules)
  while (link !== undefined) {
    const segments = link.slice(nodeModules.length + 1).split(sep)
    const binIndex = segments.lastIndexOf('.bin')
    if (binIndex >= 0) {
      await rm(join(nodeModules, ...segments.slice(0, binIndex + 1)), { recursive: true, force: true })
      link = await findSymlink(nodeModules)
      continue
    }
    const source = await realpath(link)
    const nestedNodeModules = join(source, 'node_modules')
    await rm(link, { recursive: true, force: true })
    await cp(source, link, {
      recursive: true,
      dereference: true,
      preserveTimestamps: true,
      filter: path => path !== nestedNodeModules && !path.startsWith(`${nestedNodeModules}${sep}`),
    })
    link = await findSymlink(nodeModules)
  }
  await rm(join(nodeModules, '.modules.yaml'), { force: true })
  await rm(join(nodeModules, '.pnpm'), { recursive: true, force: true })
  const remaining = await findSymlink(runtime)
  if (remaining !== undefined) throw new Error(`staged runtime still contains symbolic link ${remaining}.`)
}

function nativeRuntimePaths(target: PlatformTarget): string[] {
  if (target.platform === 'darwin') {
    return [
      `prebuilds/${target.key}/pty.node`,
      `prebuilds/${target.key}/spawn-helper`,
    ]
  }
  if (target.platform === 'linux') return ['build/Release/pty.node']
  return [
    'prebuilds/win32-x64/pty.node',
    'prebuilds/win32-x64/conpty.node',
    'prebuilds/win32-x64/conpty_console_list.node',
  ]
}

async function prepareNativeRuntime(runtime: string, target: PlatformTarget): Promise<void> {
  const nodePty = join(runtime, 'node_modules', 'node-pty')
  if (target.platform === 'linux') {
    const source = join(
      root,
      'packages',
      'subprocess',
      'subprocess-local',
      'node_modules',
      'node-pty',
      'build',
      'Release',
      'pty.node',
    )
    const destination = join(nodePty, 'build', 'Release', 'pty.node')
    if (!existsSync(source)) {
      throw new Error(`host node-pty addon is missing at ${source}; run pnpm install on the target platform.`)
    }
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(source, destination)
    await chmod(destination, (await stat(source)).mode & 0o777)
  }
  if (target.platform === 'darwin') {
    await chmod(join(nodePty, 'prebuilds', target.key, 'spawn-helper'), 0o755)
  }
  for (const relativePath of nativeRuntimePaths(target)) {
    const path = join(nodePty, relativePath)
    const metadata = await stat(path)
    if (!metadata.isFile()) throw new Error(`required node-pty native file is not a file: ${path}`)
    if (relativePath.endsWith('spawn-helper') && (metadata.mode & 0o111) === 0) {
      throw new Error(`node-pty spawn helper is not executable: ${path}`)
    }
  }
}

async function normalizeTimestamps(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await normalizeTimestamps(path)
    await utimes(path, fixedTimestamp, fixedTimestamp)
  }
  await utimes(directory, fixedTimestamp, fixedTimestamp)
}

function tarballName(name: string, version: string): string {
  return `${name.replaceAll('/', '-')}-${version}.tgz`
}

function tarString(header: Buffer, offset: number, length: number): string {
  const field = header.subarray(offset, offset + length)
  const terminator = field.indexOf(0)
  return field.subarray(0, terminator < 0 ? field.length : terminator).toString('utf8')
}

function writeTarMode(header: Buffer, mode: number): void {
  header.write(`${mode.toString(8).padStart(7, '0')}\0`, 100, 8, 'ascii')
  header.fill(0x20, 148, 156)
  let checksum = 0
  for (const byte of header) checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
}

async function preserveTarExecutableModes(tarball: string, entries: readonly string[]): Promise<void> {
  if (entries.length === 0) return
  const archive = gunzipSync(await readFile(tarball))
  const pending = new Set(entries)
  for (let offset = 0; offset + 512 <= archive.length; ) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const name = tarString(header, 0, 100)
    const prefix = tarString(header, 345, 155)
    const path = prefix === '' ? name : `${prefix}/${name}`
    const sizeText = tarString(header, 124, 12).trim()
    const size = sizeText === '' ? 0 : Number.parseInt(sizeText, 8)
    if (!Number.isFinite(size)) throw new Error(`${tarball} has an invalid tar size for ${path}.`)
    if (pending.delete(path)) writeTarMode(header, 0o755)
    offset += 512 + Math.ceil(size / 512) * 512
  }
  if (pending.size > 0) {
    throw new Error(`${tarball} omits executable tar entries: ${[...pending].join(', ')}.`)
  }
  await writeFile(tarball, gzipSync(archive, { level: 9 }))
}

async function packStage(
  stage: string,
  output: string,
  name: string,
  version: string,
  executableTarEntries: readonly string[] = [],
): Promise<string> {
  const filename = tarballName(name, version)
  const tarball = join(output, filename)
  await rm(tarball, { force: true })
  await normalizeTimestamps(stage)
  const args = ['--silent', '--dir', stage, 'pack', '--pack-destination', output]
  const invocation = resolvePnpmInvocation(process.env.npm_execpath, args)
  console.log(`build-npm-tui-package: ${formatCommand(invocation.command, invocation.args)}`)
  capture(invocation.command, invocation.args, root)
  if (!existsSync(tarball)) throw new Error(`${name} produced no tarball at ${tarball}.`)
  await preserveTarExecutableModes(tarball, executableTarEntries)
  const digest = createHash('sha256').update(await readFile(tarball)).digest('hex')
  console.log(`build-npm-tui-package: ${filename} sha256 ${digest}`)
  return tarball
}

function verifyPlatformTarball(tarball: string, target: PlatformTarget): void {
  const files = new Set(capture('tar', ['-tzf', tarball]).trim().split(/\r?\n/u))
  for (const nativePath of nativeRuntimePaths(target)) {
    const path = `package/runtime/node_modules/node-pty/${nativePath}`
    if (!files.has(path)) throw new Error(`${tarball} omits required native file ${path}.`)
  }
  if (target.platform !== 'darwin') return
  const listing = capture('tar', ['-tvzf', tarball])
  const helper = listing.split(/\r?\n/u)
    .find(line => line.endsWith(`package/runtime/node_modules/node-pty/prebuilds/${target.key}/spawn-helper`))
  if (helper === undefined || !helper.slice(0, 10).includes('x')) {
    throw new Error(`${tarball} does not preserve the executable mode on node-pty's spawn-helper.`)
  }
}

async function buildMetaPackage(
  manifest: DistributionManifest,
  stageRoot: string,
  output: string,
): Promise<string> {
  const stage = join(stageRoot, manifest.metaPackage)
  await rm(stage, { recursive: true, force: true })
  await mkdir(stage, { recursive: true })
  await writeJson(join(stage, 'package.json'), generateMetaPackageManifest(manifest))
  await copyFile(join(distributionRoot, 'launcher.mjs'), join(stage, 'launcher.mjs'))
  await chmod(join(stage, 'launcher.mjs'), 0o755)
  await copyFile(distributionManifestPath, join(stage, 'manifest.json'))
  await copyPackageFiles(stage, false)
  return packStage(stage, output, manifest.metaPackage, manifest.version)
}

async function buildPlatformPackage(
  manifest: DistributionManifest,
  target: PlatformTarget,
  stageRoot: string,
  output: string,
  skipBuild: boolean,
): Promise<string> {
  if (target.platform !== process.platform || target.arch !== process.arch) {
    throw new Error(
      `platform packages must be built natively; target ${target.key} does not match host `
      + `${process.platform}-${process.arch}.`,
    )
  }
  let invocation = resolvePnpmInvocation(process.env.npm_execpath, [
    'exec',
    'tsx',
    'scripts/verify-runtime-closure.ts',
    '--manifest',
    relative(root, deployManifestPath),
  ])
  run(invocation.command, invocation.args)
  if (!skipBuild) {
    invocation = resolvePnpmInvocation(process.env.npm_execpath, ['run', 'build:lib:host'])
    run(invocation.command, invocation.args)
  }
  else console.log('build-npm-tui-package: skipping host library build (--skip-build)')

  const stage = join(stageRoot, target.packageName)
  const runtime = join(stage, 'runtime')
  await rm(stage, { recursive: true, force: true })
  await mkdir(stage, { recursive: true })
  let failure: unknown
  let product: string
  try {
    invocation = resolvePnpmInvocation(process.env.npm_execpath, [
      '--filter',
      deployRootPackage,
      'deploy',
      '--legacy',
      '--prod',
      '--config.node-linker=hoisted',
      '--config.auto-install-peers=false',
      '--config.link-workspace-packages=true',
      '--config.confirmModulesPurge=false',
      runtime,
    ])
    run(invocation.command, invocation.args)
    await restoreLegacyHoists(runtime)
    await materializeSymlinks(runtime)
    await prepareNativeRuntime(runtime, target)
    const cli = join(runtime, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    if (!existsSync(cli)) throw new Error(`deployed dsh CLI is missing at ${cli}; build the host libraries first.`)
    await writeJson(join(stage, 'package.json'), generatePlatformPackageManifest(manifest, target))
    await copyPackageFiles(stage, true)
    if (await findSymlink(stage) !== undefined) throw new Error(`platform stage ${stage} contains a symbolic link.`)
    const executableTarEntries = target.platform === 'darwin'
      ? [`package/runtime/node_modules/node-pty/prebuilds/${target.key}/spawn-helper`]
      : []
    product = await packStage(
      stage,
      output,
      target.packageName,
      manifest.version,
      executableTarEntries,
    )
    verifyPlatformTarball(product, target)
  } catch (error) {
    failure = error
    throw error
  } finally {
    try {
      invocation = resolvePnpmInvocation(process.env.npm_execpath, [
        'install',
        '--frozen-lockfile',
        '--config.confirmModulesPurge=false',
      ])
      run(invocation.command, invocation.args)
    } catch (restoreError) {
      if (failure === undefined) throw restoreError
      const message = restoreError instanceof Error ? restoreError.message : String(restoreError)
      console.error('build-npm-tui-package: failed to restore the workspace install after packaging: ' + message)
    }
  }
  return product
}

/** Build the selected package set. */
async function main(): Promise<void> {
  const manifest = await readDistributionManifest()
  const plan = parseBuildArguments(process.argv.slice(2), manifest)
  const output = resolveSafeOutputDirectory(root, plan.outputDirectory)
  const stageRoot = join(output, '.stage')
  await mkdir(output, { recursive: true })
  await rm(stageRoot, { recursive: true, force: true })
  await mkdir(stageRoot, { recursive: true })
  const products: string[] = []
  try {
    if (plan.mode !== 'meta') {
      products.push(await buildPlatformPackage(
        manifest,
        plan.target,
        stageRoot,
        output,
        plan.skipBuild,
      ))
    }
    if (plan.mode !== 'platform') products.push(await buildMetaPackage(manifest, stageRoot, output))
  } finally {
    await rm(stageRoot, { recursive: true, force: true })
  }
  console.log('build-npm-tui-package: products:')
  for (const product of products) console.log(`  ${relative(root, product)}`)
}

function isEntry(): boolean {
  const invoked = process.argv[1]
  if (invoked === undefined) return false
  return resolve(invoked) === fileURLToPath(import.meta.url)
}

if (isEntry()) await main()

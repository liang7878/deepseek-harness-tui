import { describe, expect, it } from 'vitest'
import {
  generateMetaPackageManifest,
  generatePlatformPackageManifest,
  parseBuildArguments,
  platformTarget,
  resolvePnpmInvocation,
  resolveSafeOutputDirectory,
  type DistributionManifest,
} from './build-npm-tui-package.ts'

const manifest: DistributionManifest = {
  version: '0.1.0-rc.1',
  description: 'DeepSeek Harness TUI',
  metaPackage: 'deepseek-harness-tui',
  platformPackages: {
    'darwin-arm64': 'deepseek-harness-tui-darwin-arm64',
    'darwin-x64': 'deepseek-harness-tui-darwin-x64',
    'linux-arm64': 'deepseek-harness-tui-linux-arm64',
    'linux-x64': 'deepseek-harness-tui-linux-x64',
    'win32-x64': 'deepseek-harness-tui-win32-x64',
  },
  engines: { node: '^22.19.0 || >=24.0.0' },
  license: 'MIT',
  repository: {
    type: 'git',
    url: 'git+https://github.com/liang7878/deepseek-harness-tui.git',
    directory: 'distribution',
  },
}

describe('npm TUI package builder', () => {
  it('defaults to the host platform and builds both package kinds', () => {
    expect(parseBuildArguments([], manifest, { platform: 'darwin', arch: 'arm64' })).toEqual({
      mode: 'both',
      skipBuild: false,
      outputDirectory: '.artifacts/npm-tui',
      target: {
        key: 'darwin-arm64',
        platform: 'darwin',
        arch: 'arm64',
        packageName: 'deepseek-harness-tui-darwin-arm64',
      },
    })
  })

  it('keeps meta-only independent of native target selection', () => {
    expect(parseBuildArguments(['--', '--meta-only', '--skip-build'], manifest, {
      platform: 'freebsd',
      arch: 'riscv64',
    })).toEqual({
      mode: 'meta',
      skipBuild: true,
      outputDirectory: '.artifacts/npm-tui',
    })
    expect(() => parseBuildArguments(['--meta-only', '--platform', 'linux'], manifest))
      .toThrow(/do not apply/)
    expect(() => parseBuildArguments(['--meta-only', '--platform-only'], manifest))
      .toThrow(/mutually exclusive/)
  })

  it('maps every supported platform and rejects unsupported pairs', () => {
    expect(platformTarget(manifest, 'win32', 'x64').packageName)
      .toBe('deepseek-harness-tui-win32-x64')
    expect(() => platformTarget(manifest, 'win32', 'arm64')).toThrow(/unsupported platform/)
    expect(() => platformTarget(manifest, 'linux', 'riscv64')).toThrow(/unsupported platform/)
  })

  it('generates exact optional dependencies and native os/cpu constraints', () => {
    const meta = generateMetaPackageManifest(manifest)
    expect(meta).toMatchObject({
      name: 'deepseek-harness-tui',
      version: '0.1.0-rc.1',
      bin: {
        'deepseek-harness-tui': 'launcher.mjs',
        'dsh-tui': 'launcher.mjs',
      },
      optionalDependencies: {
        'deepseek-harness-tui-darwin-arm64': '0.1.0-rc.1',
        'deepseek-harness-tui-darwin-x64': '0.1.0-rc.1',
        'deepseek-harness-tui-linux-arm64': '0.1.0-rc.1',
        'deepseek-harness-tui-linux-x64': '0.1.0-rc.1',
        'deepseek-harness-tui-win32-x64': '0.1.0-rc.1',
      },
    })
    expect(generatePlatformPackageManifest(manifest, platformTarget(manifest, 'linux', 'arm64')))
      .toMatchObject({
        name: 'deepseek-harness-tui-linux-arm64',
        version: '0.1.0-rc.1',
        os: ['linux'],
        cpu: ['arm64'],
      })
  })

  it('refuses output clears outside generated repository areas', () => {
    expect(resolveSafeOutputDirectory('/repo', '.artifacts/npm-tui')).toBe('/repo/.artifacts/npm-tui')
    expect(() => resolveSafeOutputDirectory('/repo', '.')).toThrow(/refusing/)
    expect(() => resolveSafeOutputDirectory('/repo', '../elsewhere')).toThrow(/refusing/)
    expect(() => resolveSafeOutputDirectory('/repo', 'distribution/generated')).toThrow(/non-generated/)
    expect(() => resolveSafeOutputDirectory('/repo', '.artifacts')).toThrow(/non-generated/)
  })

  it('runs pnpm through its JavaScript entrypoint without a command shim', () => {
    expect(resolvePnpmInvocation('/tools/pnpm.cjs', ['run', 'build'])).toEqual({
      command: process.execPath,
      args: ['/tools/pnpm.cjs', 'run', 'build'],
    })
    expect(() => resolvePnpmInvocation(undefined, [])).toThrow(/pnpm entrypoint is unavailable/)
  })
})

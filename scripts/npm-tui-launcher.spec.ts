import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  normalizeLauncherArgs,
  resolveRuntimeCli,
  runLauncher,
  type LauncherManifest,
} from '../distribution/launcher.mjs'

const manifest: LauncherManifest = {
  platformPackages: {
    'darwin-arm64': 'deepseek-harness-tui-darwin-arm64',
  },
}

describe('npm TUI launcher', () => {
  it('strips only one optional leading tui argument', () => {
    expect(normalizeLauncherArgs(['tui', '--theme', 'sakura'])).toEqual(['--theme', 'sakura'])
    expect(normalizeLauncherArgs(['tui', 'tui'])).toEqual(['tui'])
    expect(normalizeLauncherArgs(['--theme', 'sakura'])).toEqual(['--theme', 'sakura'])
  })

  it('resolves the standalone launcher inside the native optional package', () => {
    expect(resolveRuntimeCli({
      manifest,
      platform: 'darwin',
      arch: 'arm64',
      resolvePackageJson: () => '/install/node_modules/deepseek-harness-tui-darwin-arm64/package.json',
      fileExists: () => true,
    })).toEqual({
      packageName: 'deepseek-harness-tui-darwin-arm64',
      cli: join(
        '/install/node_modules/deepseek-harness-tui-darwin-arm64',
        'runtime',
        'node_modules',
        'deepseek-harness-tui',
        'launcher.mjs',
      ),
    })
  })

  it('reports unsupported and missing platform packages', () => {
    const errors: string[] = []
    expect(runLauncher([], {
      manifest,
      platform: 'linux',
      arch: 'x64',
      writeError: message => errors.push(message),
    })).toBe(1)
    expect(errors[0]).toMatch(/unsupported platform linux-x64/)

    errors.length = 0
    expect(runLauncher([], {
      manifest,
      platform: 'darwin',
      arch: 'arm64',
      resolvePackageJson: () => { throw new Error('missing') },
      writeError: message => errors.push(message),
    })).toBe(1)
    expect(errors[0]).toMatch(/required optional package .* is not installed/)
  })

  it('forwards TUI arguments through process.execPath and propagates exits', () => {
    const spawn = vi.fn(() => ({
      pid: 123,
      output: [],
      stdout: null,
      stderr: null,
      status: 7,
      signal: null,
    }))
    expect(runLauncher(['tui', '--theme', 'sakura'], {
      manifest,
      platform: 'darwin',
      arch: 'arm64',
      resolvePackageJson: () => '/install/platform/package.json',
      fileExists: () => true,
      execPath: '/node',
      spawn,
    })).toBe(7)
    expect(spawn).toHaveBeenCalledWith('/node', [
      join('/install/platform', 'runtime', 'node_modules', 'deepseek-harness-tui', 'launcher.mjs'),
      '--theme',
      'sakura',
    ], expect.objectContaining({ stdio: 'inherit' }))
  })

  it('relays a terminating signal from the child', () => {
    const signals: NodeJS.Signals[] = []
    expect(runLauncher([], {
      manifest,
      platform: 'darwin',
      arch: 'arm64',
      resolvePackageJson: () => '/install/platform/package.json',
      fileExists: () => true,
      spawn: () => ({
        pid: 123,
        output: [],
        stdout: null,
        stderr: null,
        status: null,
        signal: 'SIGTERM',
      }),
      raiseSignal: signal => signals.push(signal),
    })).toBe(1)
    expect(signals).toEqual(['SIGTERM'])
  })
})

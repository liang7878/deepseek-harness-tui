import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  createRuntimeOverlay,
  normalizeLauncherArgs,
  prepareProfile,
  resolveHarnessCli,
  runLauncher,
} from '../launcher.mjs'

describe('standalone launcher', () => {
  it('resolves the official engine without exposing an internal subcommand', () => {
    expect(normalizeLauncherArgs(['tui', '--inline'])).toEqual(['--inline'])
    expect(normalizeLauncherArgs(['--inline'])).toEqual(['--inline'])
    expect(resolveHarnessCli(() => '/engine/package.json')).toBe('/engine/lib/bin.js')
  })

  it('creates a dedicated profile and absolute runtime overlay', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-tui-home-'))
    const root = new URL('..', import.meta.url).pathname
    const profile = prepareProfile({ home, packageRoot: root })
    expect(profile.name).toBe('deepseek-harness-tui')
    expect(readFileSync(join(home, 'profiles', profile.name, 'package.json'), 'utf8'))
      .toContain('@deepseek-ai/dsh-base')
    const overlay = readFileSync(profile.overlay, 'utf8')
    expect(overlay).toContain('file://')
    expect(overlay).not.toContain("name: 'deepseek-harness-tui'")
  })

  it('preserves unrelated patch text while replacing both local modules', () => {
    const source = [
      "- id: untouched",
      "  name: '@scope/plugin'",
      "- id: startup",
      "  name: 'deepseek-harness-tui/startup'",
      "- id: runtime",
      "  name: 'deepseek-harness-tui'",
    ].join('\n')
    expect(createRuntimeOverlay(source, '/app')).toContain("name: '@scope/plugin'")
    expect(createRuntimeOverlay(source, '/app')).toContain('file:///app/dist/startup.js')
    expect(createRuntimeOverlay(source, '/app')).toContain('file:///app/dist/index.js')
  })

  it('spawns the pinned Harness CLI with the generated profile', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-tui-home-'))
    const spawn = vi.fn(() => ({ status: 0, signal: null }))
    const root = new URL('..', import.meta.url).pathname
    expect(runLauncher(['--inline'], {
      home,
      packageRoot: root,
      cli: '/engine/lib/bin.js',
      spawn,
    })).toBe(0)
    expect(spawn).toHaveBeenCalledWith(process.execPath, [
      '/engine/lib/bin.js',
      '--profile',
      'deepseek-harness-tui',
      '--patch',
      join(home, 'profiles', 'deepseek-harness-tui', 'tui.runtime.patch.yml'),
      '--inline',
    ], expect.objectContaining({ stdio: 'inherit' }))
  })
})

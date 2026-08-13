/** Theme registry resolution and persisted-settings constraints. */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TUI_THEME_SETTINGS,
  resolveTheme,
  themeRegistry,
  validateThemeSettings,
} from '../src/themes.ts'
import type { CustomThemeConfig } from '../src/themes.ts'

const customTheme: CustomThemeConfig = {
  name: 'Custom',
  description: 'A custom theme.',
  accent: 'cyan',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  muted: 'gray',
  title: 'Ready',
  subtitle: 'Build something.',
  art: [],
}

describe('TUI themes', () => {
  it('ships distinct classic and anime-inspired built-in themes', () => {
    const registry = themeRegistry(DEFAULT_TUI_THEME_SETTINGS)
    expect(resolveTheme(registry, 'classic').welcome.art).toEqual([])
    expect(resolveTheme(registry, 'sakura')).toMatchObject({
      name: 'Sakura Byte',
      custom: false,
      palette: { accent: 'magenta' },
    })
    expect(resolveTheme(registry, 'sakura').welcome.art).not.toHaveLength(0)
  })

  it('resolves a complete custom theme without mutating stored settings', () => {
    const art = ['custom canvas']
    const settings = {
      theme: 'night-lab',
      customThemes: {
        'night-lab': {
          name: 'Night Lab',
          description: 'A custom theme.',
          accent: '#9966ff',
          success: 'green',
          warning: 'yellow',
          error: 'red',
          muted: 'gray',
          title: 'Night shift',
          subtitle: 'Ready.',
          art,
        },
      },
    }
    validateThemeSettings(settings)
    const resolved = resolveTheme(themeRegistry(settings), 'night-lab')
    expect(resolved).toMatchObject({ id: 'night-lab', custom: true, welcome: { art: ['custom canvas'] } })
    expect(resolved.welcome.art).not.toBe(art)
  })

  it.each([
    {
      settings: {
        theme: 'classic',
        customThemes: Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`custom-${index}`, customTheme])),
      },
      message: 'at most 20 custom themes',
    },
    {
      settings: { theme: 'classic', customThemes: { 'Invalid ID': customTheme } },
      message: 'must match',
    },
    {
      settings: {
        theme: 'classic',
        customThemes: { oversized: { ...customTheme, art: Array.from({ length: 11 }, () => 'line') } },
      },
      message: 'art must fit 10 lines',
    },
    {
      settings: {
        theme: 'classic',
        customThemes: { oversized: { ...customTheme, art: ['x'.repeat(65)] } },
      },
      message: 'art must fit 10 lines',
    },
    {
      settings: { theme: 'missing', customThemes: {} },
      message: 'is not built in or defined',
    },
    {
      settings: {
        theme: 'classic',
        customThemes: {
          classic: {
            name: 'Collision',
            description: '',
            accent: 'cyan',
            success: 'green',
            warning: 'yellow',
            error: 'red',
            muted: 'gray',
            title: '',
            subtitle: '',
            art: [],
          },
        },
      },
      message: 'conflicts with a built-in theme',
    },
  ])('rejects invalid persisted registries', ({ settings, message }) => {
    expect(() => { validateThemeSettings(settings) }).toThrow(message)
  })

  it('reports available ids for an unknown command-line theme', () => {
    expect(() => resolveTheme(themeRegistry(DEFAULT_TUI_THEME_SETTINGS), 'missing'))
      .toThrow('available: classic, sakura, ocean, ember')
  })
})

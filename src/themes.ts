/**
 * Built-in and user-defined terminal themes.
 * @module @deepseek-ai/dsh-tui-app/themes
 */

import z from '@deepseek-ai/schemastery'

/** Stable identifier accepted by `--theme` and `/theme`. */
export type ThemeId = string

/** Terminal colors used by one resolved theme. */
export interface ThemePalette {
  /** Primary brand and user-input color. */
  accent: string
  /** Successful operation color. */
  success: string
  /** Active or cautionary operation color. */
  warning: string
  /** Failure color. */
  error: string
  /** Secondary text and border color. */
  muted: string
}

/** Empty-transcript presentation for one resolved theme. */
export interface ThemeWelcome {
  /** Primary welcome line. */
  title: string
  /** Secondary usage hint. */
  subtitle: string
  /** Optional wide-terminal canvas. */
  art: readonly string[]
}

/** Complete immutable theme consumed by the renderer. */
export interface ThemeDefinition {
  /** Stable selection identifier. */
  id: ThemeId
  /** Human-facing selector label. */
  name: string
  /** Short selector description. */
  description: string
  /** Semantic terminal colors. */
  palette: ThemePalette
  /** Empty-transcript presentation. */
  welcome: ThemeWelcome
  /** Whether the theme came from user settings. */
  custom: boolean
}

/** User-authored theme fields stored in `settings.yaml`. */
export interface CustomThemeConfig {
  /** Human-facing selector label. */
  name: string
  /** Short selector description. */
  description: string
  /** Primary brand and user-input color. */
  accent: string
  /** Successful operation color. */
  success: string
  /** Active or cautionary operation color. */
  warning: string
  /** Failure color. */
  error: string
  /** Secondary text and border color. */
  muted: string
  /** Primary welcome line. */
  title: string
  /** Secondary usage hint. */
  subtitle: string
  /** Optional wide-terminal canvas. */
  art: string[]
}

/** Persisted settings for the terminal interface. */
export interface TuiThemeSettings {
  /** Selected built-in or custom theme id. */
  theme: ThemeId
  /** User-authored themes keyed by selection id. */
  customThemes: Readonly<Record<string, CustomThemeConfig>>
}

const COLOR_PATTERN = /^(?:#[0-9a-fA-F]{6}|black|red|green|yellow|blue|magenta|cyan|white|gray)$/u
const THEME_ID_PATTERN = /^[a-z][a-z0-9-]*$/u

const color = () => z.string().required().pattern(COLOR_PATTERN)
const customThemeSchema: z<CustomThemeConfig> = z.object({
  name: z.string().required(),
  description: z.string().default('Custom terminal theme.'),
  accent: color(),
  success: color(),
  warning: color(),
  error: color(),
  muted: color(),
  title: z.string().default('Ready to build'),
  subtitle: z.string().default('Describe a task, or press Ctrl+P for commands.'),
  art: z.array(z.string()).default([]),
})

/** Schema for the `tui` user-settings namespace. */
export const TuiThemeSettingsSchema: z<TuiThemeSettings> = z.object({
  theme: z.string().default('classic'),
  customThemes: z.dict(customThemeSchema).default({}),
})

/** Resolved values used when the user has no `tui` settings section. */
export const DEFAULT_TUI_THEME_SETTINGS: TuiThemeSettings = {
  theme: 'classic',
  customThemes: {},
}

const builtInThemes: readonly ThemeDefinition[] = [
  {
    id: 'classic',
    name: 'Classic Cyan',
    description: 'The focused DeepSeek Harness terminal palette.',
    palette: { accent: 'cyan', success: 'green', warning: 'yellow', error: 'red', muted: 'gray' },
    welcome: {
      title: 'Ready to build',
      subtitle: 'Describe a task, or press Ctrl+P for commands.',
      art: [],
    },
    custom: false,
  },
  {
    id: 'sakura',
    name: 'Sakura Byte',
    description: 'An original anime-inspired welcome canvas in neon pink.',
    palette: { accent: 'magenta', success: 'cyan', warning: 'yellow', error: 'red', muted: 'gray' },
    welcome: {
      title: 'Sakura Byte is online',
      subtitle: 'Ship something beautiful. Ctrl+T changes the scene.',
      art: [
        '       ✦       .        ✦',
        '            ╭───୨୧───╮',
        '           ╱╲╱╲╱╲╱╲╱╲',
        '          ╱   ◕   ◕   ╲',
        '         │      ᴗ      │',
        '         │   ╰────╯    │',
        '          ╲╭────────╮╱',
        '       ╭───┴────────┴───╮',
        '       │   SAKURA BYTE   │',
      ],
    },
    custom: false,
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    description: 'Cool blue focus for long coding sessions.',
    palette: { accent: 'blue', success: 'cyan', warning: 'yellow', error: 'red', muted: 'gray' },
    welcome: {
      title: 'Dive into the code',
      subtitle: 'Durable sessions, calm terminal, full control.',
      art: [
        '             ~      ~',
        '        ~       ◇       ~',
        '             ╱   ╲',
        '        ────╱  DSH  ╲────',
        '           ╱_______╲',
      ],
    },
    custom: false,
  },
  {
    id: 'ember',
    name: 'Ember Forge',
    description: 'Warm amber contrast for a high-energy workspace.',
    palette: { accent: 'yellow', success: 'green', warning: 'magenta', error: 'red', muted: 'gray' },
    welcome: {
      title: 'The forge is ready',
      subtitle: 'Turn intent into working code.',
      art: [
        '             .  *  .',
        '          *    /\\    *',
        '             /  \\',
        '            /____\\',
        '          EMBER FORGE',
      ],
    },
    custom: false,
  },
  {
    id: 'aurora',
    name: 'Aurora Pulse',
    description: 'Electric cyan and green under a quiet polar sky.',
    palette: {
      accent: '#67E8F9',
      success: '#86EFAC',
      warning: '#FDE68A',
      error: '#FB7185',
      muted: '#64748B',
    },
    welcome: {
      title: 'Aurora systems aligned',
      subtitle: 'Follow the signal from idea to shipped code.',
      art: [
        '        ·      ✦        ·',
        '    ╭────╮       ╭──────╮',
        '  ╭─╯    ╰───────╯      ╰─╮',
        ' ╱    ╱╲      ╱╲      ╱╲    ╲',
        '     ╱  ╲    ╱  ╲    ╱  ╲',
        '        AURORA PULSE',
      ],
    },
    custom: false,
  },
  {
    id: 'luna',
    name: 'Luna Circuit',
    description: 'An original moonlit navigator in soft violet.',
    palette: {
      accent: '#C4A7FF',
      success: '#72E6C1',
      warning: '#FFD166',
      error: '#FF6B81',
      muted: '#7F849C',
    },
    welcome: {
      title: 'Luna Circuit is listening',
      subtitle: 'Plot a route through the codebase.',
      art: [
        '          ⋆｡°✩       ☾',
        '             ╭──────╮',
        '            ╱  ◕  ◕  ╲',
        '           │    ᴗ     │',
        '           ╰─╮ ╱╲ ╭──╯',
        '         ╭───┴─╲╱─┴───╮',
        '         │ LUNA CIRCUIT │',
        '         ╰──────────────╯',
      ],
    },
    custom: false,
  },
  {
    id: 'phosphor',
    name: 'Phosphor Grid',
    description: 'High-legibility green for a classic operations console.',
    palette: {
      accent: '#7CFF6B',
      success: '#B6FF9C',
      warning: '#F4D35E',
      error: '#FF6B6B',
      muted: '#5C7A62',
    },
    welcome: {
      title: 'Console standing by',
      subtitle: 'Build, inspect, and ship with a clear signal.',
      art: [
        '        > SYSTEM // READY',
        '        ┌────────────────┐',
        '        │ 01 10 01  DSH  │',
        '        │ BUILD · TEST   │',
        '        │ SHIP  · REPEAT │',
        '        └────────────────┘',
      ],
    },
    custom: false,
  },
  {
    id: 'sunset',
    name: 'Sunset Circuit',
    description: 'Coral light and teal status colors for late sessions.',
    palette: {
      accent: '#FF8A65',
      success: '#80CBC4',
      warning: '#FFD54F',
      error: '#EF5350',
      muted: '#8D6E63',
    },
    welcome: {
      title: 'One more great build',
      subtitle: 'Close the day with working code.',
      art: [
        '             ╲  │  ╱',
        '           ───  ◉  ───',
        '             ╱  │  ╲',
        '        ▂▃▅▇▆▅▃▂▃▅▇▆▅▃',
        '          SUNSET CIRCUIT',
      ],
    },
    custom: false,
  },
]

/**
 * Validate cross-field and terminal-budget constraints for persisted themes.
 * @param settings - Resolved terminal-theme settings to validate.
 */
export function validateThemeSettings(settings: TuiThemeSettings): void {
  const entries = Object.entries(settings.customThemes)
  if (entries.length > 20) throw new Error('tui settings support at most 20 custom themes')
  for (const [id, theme] of entries) {
    if (!THEME_ID_PATTERN.test(id)) {
      throw new Error(`custom theme id ${JSON.stringify(id)} must match ${String(THEME_ID_PATTERN)}`)
    }
    if (builtInThemes.some(candidate => candidate.id === id)) {
      throw new Error(`custom theme id ${JSON.stringify(id)} conflicts with a built-in theme`)
    }
    if (theme.art.length > 10 || theme.art.some(line => Array.from(line).length > 64)) {
      throw new Error(`custom theme ${JSON.stringify(id)} art must fit 10 lines of 64 characters`)
    }
  }
  if (!builtInThemes.some(theme => theme.id === settings.theme) && settings.customThemes[settings.theme] === undefined) {
    throw new Error(`selected theme ${JSON.stringify(settings.theme)} is not built in or defined under customThemes`)
  }
}

/**
 * Build the complete registry for one resolved settings section.
 * @param settings - Resolved terminal-theme settings.
 * @returns Built-in themes followed by validated custom themes.
 */
export function themeRegistry(settings: TuiThemeSettings): readonly ThemeDefinition[] {
  const custom = Object.entries(settings.customThemes).map(([id, theme]): ThemeDefinition => ({
    id,
    name: theme.name,
    description: theme.description,
    palette: {
      accent: theme.accent,
      success: theme.success,
      warning: theme.warning,
      error: theme.error,
      muted: theme.muted,
    },
    welcome: { title: theme.title, subtitle: theme.subtitle, art: [...theme.art] },
    custom: true,
  }))
  return [...builtInThemes, ...custom]
}

/**
 * Resolve one id from a complete registry.
 * @param registry - Built-in and user-authored themes.
 * @param id - Requested theme identifier.
 * @returns The complete renderer theme.
 */
export function resolveTheme(registry: readonly ThemeDefinition[], id: ThemeId): ThemeDefinition {
  const theme = registry.find(candidate => candidate.id === id)
  if (theme !== undefined) return theme
  throw new Error(`unknown TUI theme ${JSON.stringify(id)}; available: ${registry.map(candidate => candidate.id).join(', ')}`)
}

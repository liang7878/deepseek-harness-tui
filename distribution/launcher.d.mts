export interface LauncherManifest {
  readonly platformPackages: Readonly<Record<string, string>>
}

export interface LauncherSpawnResult {
  readonly error?: Error
  readonly status: number | null
  readonly signal: NodeJS.Signals | null
}

export interface LauncherOptions {
  readonly manifest?: LauncherManifest
  readonly platform?: NodeJS.Platform
  readonly arch?: string
  readonly resolvePackageJson?: (packageName: string) => string
  readonly fileExists?: (path: string) => boolean
  readonly spawn?: (
    command: string,
    args: string[],
    options: { stdio: 'inherit'; env: NodeJS.ProcessEnv },
  ) => LauncherSpawnResult
  readonly execPath?: string
  readonly env?: NodeJS.ProcessEnv
  readonly writeError?: (message: string) => void
  readonly raiseSignal?: (signal: NodeJS.Signals) => void
}

export function normalizeLauncherArgs(args: readonly string[]): string[]
export function platformPackageName(
  manifest: LauncherManifest,
  platform: NodeJS.Platform,
  arch: string,
): string
export function resolveRuntimeCli(options?: LauncherOptions): { packageName: string; cli: string }
export function runLauncher(args: readonly string[], options?: LauncherOptions): number

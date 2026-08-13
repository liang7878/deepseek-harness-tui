/** @jsxImportSource react */
/**
 * Ink components for the interactive terminal application.
 * @module @deepseek-ai/dsh-tui-app/ui
 */

import * as React from 'react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import type { Key } from 'ink'
import type { TranscriptRow } from './projection.ts'
import type { ModalOption, TuiController, TuiModal, TuiSnapshot } from './runtime.ts'
import type { ThemeDefinition } from './themes.ts'

// The source launcher and production bundler select different JSX transforms.
void React.createElement

interface Palette {
  accent?: string
  success?: string
  warning?: string
  error?: string
  muted?: string
}

function palette(theme: ThemeDefinition, enabled: boolean): Palette {
  return enabled ? theme.palette : {}
}

function paint(color: string | undefined): { color: string } | {} {
  return color === undefined ? {} : { color }
}

function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout()
  const [size, setSize] = useState(() => ({
    columns: stdout.columns,
    rows: stdout.rows,
  }))
  useEffect(() => {
    const update = (): void => {
      setSize({ columns: stdout.columns, rows: stdout.rows })
    }
    stdout.on('resize', update)
    return () => { stdout.off('resize', update) }
  }, [stdout])
  return size
}

function statusSymbol(
  status: TranscriptRow['status'],
  unicode: boolean,
): { text: string; color?: 'green' | 'yellow' | 'red' } {
  if (status === 'running') return { text: unicode ? '●' : '*', color: 'yellow' }
  if (status === 'error') return { text: unicode ? '×' : 'x', color: 'red' }
  return { text: unicode ? '✓' : '+', color: 'green' }
}

function compactPath(path: string, width: number): string {
  if (path.length <= width) return path
  const retained = Math.max(8, width - 1)
  return `…${path.slice(-retained)}`
}

function Header({ snapshot, columns, colors }: {
  snapshot: TuiSnapshot
  columns: number
  colors: Palette
}) {
  const stateColor = snapshot.status === 'error'
    ? colors.error
    : snapshot.status === 'running'
      ? colors.warning
      : colors.success
  if (columns < 50) {
    return (
      <Box justifyContent="space-between">
        <Text bold {...paint(colors.accent)}>dsh</Text>
        <Text {...paint(stateColor)}>{snapshot.status}</Text>
      </Box>
    )
  }
  const model = snapshot.provider === '' ? snapshot.model : `${snapshot.provider}/${snapshot.model}`
  const available = Math.max(14, columns - model.length - snapshot.status.length - 10)
  return (
    <Box justifyContent="space-between">
      <Text>
        <Text bold {...paint(colors.accent)}>DeepSeek Harness</Text>
        <Text dimColor>  {compactPath(snapshot.cwd, available)}</Text>
      </Text>
      <Text>
        {columns >= 80 && <Text {...paint(colors.accent)}>{model}  </Text>}
        <Text {...paint(stateColor)}>{snapshot.status}</Text>
      </Text>
    </Box>
  )
}

function rowColor(row: TranscriptRow, colors: Palette): string | undefined {
  if (row.status === 'error' || row.kind === 'error') return colors.error
  if (row.status === 'running') return colors.warning
  if (row.kind === 'user') return colors.accent
  if (row.kind === 'context' || row.kind === 'reasoning') return colors.muted
  return undefined
}

function TranscriptRowView({ row, unicode, colors, detailLines }: {
  row: TranscriptRow
  unicode: boolean
  colors: Palette
  detailLines: number
}) {
  const symbol = statusSymbol(row.status, unicode)
  const lines = row.text.split('\n')
  const retained = row.kind === 'reasoning'
    ? [row.status === 'running' ? 'Reasoning…' : `${lines.length} reasoning lines`]
    : lines.length <= detailLines
      ? lines
      : [...lines.slice(0, Math.max(1, detailLines - 1)), `… ${lines.length - detailLines + 1} more lines`]
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold {...paint(rowColor(row, colors))}>
        <Text {...paint(colors[symbol.color === 'green' ? 'success' : symbol.color === 'yellow' ? 'warning' : 'error'])}>
          {symbol.text}
        </Text>
        {' '}{row.label}
      </Text>
      {retained.join('\n') !== '' && (
        <Box marginLeft={2}>
          <Text dimColor={row.kind === 'context' || row.kind === 'reasoning'} wrap="wrap">
            {retained.join('\n')}
          </Text>
        </Box>
      )}
    </Box>
  )
}

function Transcript({ snapshot, rows, page, unicode, colors, color, height, columns }: {
  snapshot: TuiSnapshot
  rows: readonly TranscriptRow[]
  page: number
  unicode: boolean
  colors: Palette
  color: boolean
  height: number
  columns: number
}) {
  const rowBudget = Math.max(1, height)
  const end = Math.max(0, rows.length - page * rowBudget)
  const start = Math.max(0, end - rowBudget)
  const visible = rows.slice(start, end)
  const detailLines = columns < 50 ? 3 : columns < 80 ? 5 : 8
  if (visible.length === 0) {
    const showCanvas = showsWelcomeCanvas(snapshot.theme, color, unicode, columns, height)
    return (
      <Box flexGrow={1} justifyContent="center" alignItems="center" flexDirection="column">
        {showCanvas && (
          <Box
            borderStyle="round"
            borderColor={colors.accent}
            paddingX={3}
            marginBottom={1}
            flexDirection="column"
          >
            {snapshot.theme.welcome.art.map((line, index) => (
              <Text key={`${String(index)}-${line}`} bold {...paint(colors.accent)}>{line}</Text>
            ))}
          </Box>
        )}
        <Text bold {...paint(colors.accent)}>{snapshot.theme.welcome.title}</Text>
        <Text dimColor>{snapshot.theme.welcome.subtitle}</Text>
        <Text dimColor>{snapshot.cwd}</Text>
      </Box>
    )
  }
  return (
    <Box flexGrow={1} flexDirection="column" overflow="hidden">
      {start > 0 && <Text dimColor>↑ {start} earlier rows · PageUp</Text>}
      {visible.map(row => (
        <TranscriptRowView
          key={row.key}
          row={row}
          unicode={unicode}
          colors={colors}
          detailLines={detailLines}
        />
      ))}
      {end < rows.length && <Text dimColor>↓ {rows.length - end} newer rows · End</Text>}
    </Box>
  )
}

function TodoStrip({ snapshot, colors, columns }: {
  snapshot: TuiSnapshot
  colors: Palette
  columns: number
}) {
  const active = snapshot.todos.filter(todo => todo.status !== 'completed')
  if (active.length === 0 || columns < 60) return null
  const current = active.find(todo => todo.status === 'in_progress') ?? active[0]
  if (current === undefined) return null
  return (
    <Text dimColor>
      Todo {snapshot.todos.filter(todo => todo.status === 'completed').length}/{snapshot.todos.length}
      {' · '}
      <Text {...paint(current.status === 'in_progress' ? colors.warning : undefined)}>{current.content}</Text>
    </Text>
  )
}

function cursorText(value: string, cursor: number): React.JSX.Element {
  const characters = Array.from(value)
  const before = characters.slice(0, cursor).join('')
  const current = characters[cursor] ?? ' '
  const after = characters.slice(cursor + (characters[cursor] === undefined ? 0 : 1)).join('')
  return <Text>{before}<Text inverse>{current}</Text>{after}</Text>
}

function edit(
  value: string,
  cursor: number,
  input: string,
  key: Key,
): { value: string; cursor: number; submit?: true } {
  const chars = Array.from(value)
  if (key.return) return { value, cursor, submit: true }
  if (key.leftArrow) return { value, cursor: Math.max(0, cursor - 1) }
  if (key.rightArrow) return { value, cursor: Math.min(chars.length, cursor + 1) }
  if (key.ctrl && input === 'a') return { value, cursor: 0 }
  if (key.ctrl && input === 'e') return { value, cursor: chars.length }
  if (key.ctrl && input === 'u') return { value: chars.slice(cursor).join(''), cursor: 0 }
  if (key.ctrl && input === 'k') return { value: chars.slice(0, cursor).join(''), cursor }
  if (key.ctrl && input === 'j') {
    chars.splice(cursor, 0, '\n')
    return { value: chars.join(''), cursor: cursor + 1 }
  }
  if (key.backspace || key.delete) {
    if (cursor === 0) return { value, cursor }
    chars.splice(cursor - 1, 1)
    return { value: chars.join(''), cursor: cursor - 1 }
  }
  const insertion = input
  if (insertion === '' || key.ctrl || key.meta || key.escape || key.tab) return { value, cursor }
  const inserted = Array.from(insertion)
  chars.splice(cursor, 0, ...inserted)
  return { value: chars.join(''), cursor: cursor + inserted.length }
}

function showsWelcomeCanvas(
  theme: ThemeDefinition,
  color: boolean,
  unicode: boolean,
  columns: number,
  height: number,
): boolean {
  return color && unicode && columns >= 84 && height >= 14 && theme.welcome.art.length > 0
}

/** Pure editor operations exposed for terminal-input conformance tests. */
export const uiInternals = { edit, showsWelcomeCanvas }

function Composer({ controller, disabled, colors }: {
  controller: TuiController
  disabled: boolean
  colors: Palette
}) {
  const [value, setValue] = useState('')
  const [cursor, setCursor] = useState(0)
  const valueRef = useRef(value)
  const cursorRef = useRef(cursor)
  const [history, setHistory] = useState<readonly string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | undefined>()
  const setEditor = (nextValue: string, nextCursor: number): void => {
    valueRef.current = nextValue
    cursorRef.current = nextCursor
    setValue(nextValue)
    setCursor(nextCursor)
  }
  useInput((input, key) => {
    if (disabled) return
    const currentValue = valueRef.current
    const currentCursor = cursorRef.current
    if (key.upArrow && !currentValue.includes('\n')) {
      const next = Math.min(history.length - 1, (historyIndex ?? history.length) - 1)
      const remembered = history[next]
      if (remembered !== undefined) {
        setHistoryIndex(next)
        setEditor(remembered, Array.from(remembered).length)
      }
      return
    }
    if (key.downArrow && historyIndex !== undefined && !currentValue.includes('\n')) {
      const next = historyIndex + 1
      if (next >= history.length) {
        setHistoryIndex(undefined)
        setEditor('', 0)
      } else {
        const remembered = history[next] ?? ''
        setHistoryIndex(next)
        setEditor(remembered, Array.from(remembered).length)
      }
      return
    }
    const next = edit(currentValue, currentCursor, input, key)
    if (next.submit) {
      if (currentValue.trim() === '') return
      setHistory(items => [...items.slice(-99), currentValue])
      setHistoryIndex(undefined)
      setEditor('', 0)
      void controller.submit(currentValue)
      return
    }
    setEditor(next.value, next.cursor)
  }, { isActive: !disabled })
  return (
    <Box borderStyle="single" borderColor={colors.muted} paddingX={1}>
      <Text {...paint(disabled ? colors.muted : colors.accent)}>{disabled ? '· ' : '› '}</Text>
      {disabled ? <Text dimColor>Waiting for interaction…</Text> : cursorText(value, cursor)}
    </Box>
  )
}

function OptionRow({ option, active, selected, colors }: {
  option: ModalOption
  active: boolean
  selected: boolean
  colors: Palette
}) {
  return (
    <Box flexDirection="column">
      <Text {...paint(active ? colors.accent : undefined)} bold={active}>
        {active ? '›' : ' '} {selected ? '[x]' : '[ ]'} {option.label}
      </Text>
      {option.description !== undefined && (
        <Box marginLeft={6}><Text dimColor>{option.description}</Text></Box>
      )}
    </Box>
  )
}

function ModalView({ modal, controller, colors }: {
  modal: TuiModal
  controller: TuiController
  colors: Palette
}) {
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [customMode, setCustomMode] = useState(modal.options.length === 0)
  const [custom, setCustom] = useState('')
  const [cursor, setCursor] = useState(0)
  const customRef = useRef(custom)
  const cursorRef = useRef(cursor)
  const visibleOptions = modal.options
  useInput((input, key) => {
    if (key.escape) {
      if (customMode && modal.options.length > 0) {
        setCustomMode(false)
        return
      }
      controller.cancelModal()
      return
    }
    if (customMode) {
      const next = edit(customRef.current, cursorRef.current, input, key)
      if (next.submit) {
        const answer = customRef.current.trim()
        if (answer !== '') controller.submitModal([...selected], answer)
        return
      }
      customRef.current = next.value
      cursorRef.current = next.cursor
      setCustom(next.value)
      setCursor(next.cursor)
      return
    }
    if (key.upArrow) {
      setIndex(current => Math.max(0, current - 1))
      return
    }
    if (key.downArrow) {
      setIndex(current => Math.min(visibleOptions.length - 1, current + 1))
      return
    }
    if (modal.allowCustom && input.toLowerCase() === 'o') {
      setCustomMode(true)
      return
    }
    const option = visibleOptions[index]
    if (option === undefined) return
    if (modal.multiSelect && input === ' ') {
      setSelected((current) => {
        const next = new Set(current)
        if (next.has(option.value)) next.delete(option.value)
        else next.add(option.value)
        return next
      })
      return
    }
    if (key.return) {
      if (modal.multiSelect) {
        const values = selected.size === 0 ? [option.value] : [...selected]
        controller.submitModal(values)
      } else {
        controller.submitModal([option.value])
      }
    }
  })
  return (
    <Box flexGrow={1} flexDirection="column" paddingX={1}>
      <Text bold {...paint(colors.accent)}>{modal.title}</Text>
      {modal.detail !== undefined && <Text>{modal.detail}</Text>}
      <Box flexDirection="column" marginTop={1}>
        {customMode
          ? (
            <>
              <Text dimColor>Custom answer · Enter submit · Esc back</Text>
              <Text>{cursorText(custom, cursor)}</Text>
            </>
          )
          : visibleOptions.map((option, optionIndex) => (
            <OptionRow
              key={option.value}
              option={option}
              active={optionIndex === index}
              selected={selected.has(option.value)}
              colors={colors}
            />
          ))}
      </Box>
      {!customMode && (
        <Text dimColor>
          ↑↓ move · {modal.multiSelect ? 'Space select · ' : ''}Enter confirm
          {modal.allowCustom ? ' · O other' : ''} · Esc cancel
        </Text>
      )}
    </Box>
  )
}

/** Root TUI component. */
export function TuiApp({ controller, color, unicode }: {
  controller: TuiController
  color: boolean
  unicode: boolean
}) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const { exit } = useApp()
  const { columns, rows } = useTerminalSize()
  const colors = useMemo(() => palette(snapshot.theme, color), [color, snapshot.theme])
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (snapshot.exitRequested) exit()
  }, [exit, snapshot.exitRequested])

  useEffect(() => {
    if (snapshot.status === 'running') setPage(0)
  }, [snapshot.rows.length, snapshot.status])

  useInput((input, key) => {
    if (snapshot.modal !== undefined) return
    if (key.ctrl && input === 'c') {
      if (snapshot.status === 'running') controller.cancelWork()
      else controller.requestExit()
      return
    }
    if (key.ctrl && input === 'o') {
      void controller.openSessions()
      return
    }
    if (key.ctrl && input === 'l') {
      void controller.openModels()
      return
    }
    if (key.ctrl && input === 'p') {
      void controller.openCommands()
      return
    }
    if (key.ctrl && input === 't') {
      void controller.openThemes()
      return
    }
    if (key.pageUp) {
      setPage(current => Math.min(Math.ceil(snapshot.rows.length / Math.max(1, rows - 8)), current + 1))
      return
    }
    if (key.pageDown) {
      setPage(current => Math.max(0, current - 1))
      return
    }
    if (key.ctrl && input === 'e') setPage(0)
  })

  const transcriptHeight = Math.max(3, rows - 7 - (snapshot.todos.length > 0 ? 1 : 0))
  return (
    <Box width={columns} height={rows} flexDirection="column">
      <Header snapshot={snapshot} columns={columns} colors={colors} />
      <Box
        borderStyle="single"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        {...colors.muted === undefined ? {} : { borderColor: colors.muted }}
      />
      {snapshot.modal === undefined
        ? (
          <Transcript
            snapshot={snapshot}
            rows={snapshot.rows}
            page={page}
            unicode={unicode}
            colors={colors}
            color={color}
            height={transcriptHeight}
            columns={columns}
          />
        )
        : <ModalView key={snapshot.modal.id} modal={snapshot.modal} controller={controller} colors={colors} />}
      <TodoStrip snapshot={snapshot} colors={colors} columns={columns} />
      <Box justifyContent="space-between">
        <Text {...paint(snapshot.notice?.kind === 'error' ? colors.error : colors.muted)}>
          {snapshot.notice?.text ?? (snapshot.status === 'running' ? 'Ctrl+C cancel · Enter steers next step' : 'Ctrl+P commands · Ctrl+T themes')}
        </Text>
        {columns >= 80 && <Text dimColor>{snapshot.sessionId}</Text>}
      </Box>
      <Composer
        controller={controller}
        disabled={snapshot.modal !== undefined || snapshot.status === 'starting' || snapshot.status === 'switching'}
        colors={colors}
      />
    </Box>
  )
}

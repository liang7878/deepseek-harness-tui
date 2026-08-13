/** Unicode-safe composer editing independent of terminal escape decoding. */

import type { Key } from 'ink'
import { describe, expect, it } from 'vitest'
import { uiInternals } from '../src/ui.tsx'

const key = (value: Partial<Key> = {}): Key => ({
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  ...value,
})

describe('TUI composer editor', () => {
  it('inserts and removes complete Unicode code points', () => {
    expect(uiInternals.edit('A🙂B', 2, '', key({ backspace: true })))
      .toEqual({ value: 'AB', cursor: 1 })
    expect(uiInternals.edit('AB', 1, '你', key()))
      .toEqual({ value: 'A你B', cursor: 2 })
    expect(uiInternals.edit('', 0, '粘贴内容', key()))
      .toEqual({ value: '粘贴内容', cursor: 4 })
  })

  it('supports navigation, line insertion, and shell-style line edits', () => {
    expect(uiInternals.edit('abc', 1, '', key({ leftArrow: true })).cursor).toBe(0)
    expect(uiInternals.edit('abc', 1, '', key({ rightArrow: true })).cursor).toBe(2)
    expect(uiInternals.edit('abc', 2, 'j', key({ ctrl: true })))
      .toEqual({ value: 'ab\nc', cursor: 3 })
    expect(uiInternals.edit('abc', 2, 'u', key({ ctrl: true })))
      .toEqual({ value: 'c', cursor: 0 })
    expect(uiInternals.edit('abc', 1, 'k', key({ ctrl: true })))
      .toEqual({ value: 'a', cursor: 1 })
  })

  it('submits on Enter and ignores unrelated control input', () => {
    expect(uiInternals.edit('task', 4, '', key({ return: true })))
      .toEqual({ value: 'task', cursor: 4, submit: true })
    expect(uiInternals.edit('task', 4, 'p', key({ ctrl: true })))
      .toEqual({ value: 'task', cursor: 4 })
  })
})

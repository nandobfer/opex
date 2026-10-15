/** @vitest-environment jsdom */

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastSuccess = vi.fn()
const readText = vi.fn(async () => 'texto do sistema')
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => toastSuccess(...args) } }))

import { EditorModeShortcut } from '@/components/editor-mode-shortcut'
import { EDITOR_MODE_KEY } from '@/features/editor-mode/preference'
import { isEditorModeToggle } from '@/features/editor-mode/shortcut'

const keyEvent = (overrides: Partial<KeyboardEventInit>) => new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...overrides })

beforeEach(() => {
  window.localStorage.clear()
  toastSuccess.mockClear()
  readText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText: vi.fn(async () => undefined) } })
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
})

afterEach(() => {
  cleanup()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
})

describe('isEditorModeToggle', () => {
  it('aceita Ctrl+Tab e Ctrl+Shift+Alt+V', () => {
    expect(isEditorModeToggle(keyEvent({ key: 'Tab', ctrlKey: true }))).toBe(true)
    expect(isEditorModeToggle(keyEvent({ key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true, altKey: true }))).toBe(true)
  })

  it('recusa Tab sozinho, Ctrl+Shift+Tab, Ctrl+V e ⌘+Tab', () => {
    expect(isEditorModeToggle(keyEvent({ key: 'Tab' }))).toBe(false)
    expect(isEditorModeToggle(keyEvent({ key: 'Tab', ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isEditorModeToggle(keyEvent({ key: 'v', code: 'KeyV', ctrlKey: true }))).toBe(false)
    expect(isEditorModeToggle(keyEvent({ key: 'Tab', metaKey: true }))).toBe(false)
  })
})

describe('EditorModeShortcut', () => {
  it('alterna e persiste o modo a cada atalho, com toast', () => {
    render(<EditorModeShortcut />)

    const first = keyEvent({ key: 'Tab', ctrlKey: true })
    act(() => {
      document.body.dispatchEvent(first)
    })
    expect(first.defaultPrevented).toBe(true)
    expect(window.localStorage.getItem(EDITOR_MODE_KEY)).toBe('"vim"')
    expect(toastSuccess).toHaveBeenLastCalledWith('Modo Vim ligado', expect.anything())

    act(() => {
      document.body.dispatchEvent(keyEvent({ key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true, altKey: true }))
    })
    expect(window.localStorage.getItem(EDITOR_MODE_KEY)).toBe('"native"')
    expect(toastSuccess).toHaveBeenLastCalledWith('Modo Vim desligado', expect.anything())
  })

  it('pede a leitura da área de transferência uma única vez ao ligar', async () => {
    // O pedido é único por sessão da página: o módulo é reimportado para o estado nascer limpo.
    vi.resetModules()
    const { EditorModeShortcut: FreshShortcut } = await import('@/components/editor-mode-shortcut')
    render(<FreshShortcut />)

    act(() => {
      document.body.dispatchEvent(keyEvent({ key: 'Tab', ctrlKey: true }))
    })
    act(() => {
      document.body.dispatchEvent(keyEvent({ key: 'Tab', ctrlKey: true }))
    })
    act(() => {
      document.body.dispatchEvent(keyEvent({ key: 'Tab', ctrlKey: true }))
    })

    expect(readText).toHaveBeenCalledTimes(1)
  })

  it('ignora outras combinações, eventos repetidos e composição (IME)', () => {
    render(<EditorModeShortcut />)
    act(() => {
      document.body.dispatchEvent(keyEvent({ key: 'Tab' }))
      document.body.dispatchEvent(keyEvent({ key: 'Tab', ctrlKey: true, repeat: true }))
      document.body.dispatchEvent(keyEvent({ key: 'Tab', ctrlKey: true, isComposing: true }))
    })
    expect(window.localStorage.getItem(EDITOR_MODE_KEY)).toBeNull()
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})

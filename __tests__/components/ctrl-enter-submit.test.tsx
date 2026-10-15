/** @vitest-environment jsdom */

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CtrlEnterSubmit,
  handleCtrlEnterKey,
  handleTextareaEditKey,
  insertLineBreak,
  isCtrlE,
  isCtrlEnter,
  isCtrlJ,
  moveCursorToLineEnd,
  resolveCtrlEnterAction,
} from '@/components/ctrl-enter-submit'

const keyEvent = (overrides: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...overrides })

function append<T extends HTMLElement>(parent: HTMLElement, child: T): T {
  parent.appendChild(child)
  return child
}

function textarea(parent: HTMLElement = document.body): HTMLTextAreaElement {
  return append(parent, document.createElement('textarea'))
}

function markedButton(parent: HTMLElement = document.body): HTMLButtonElement {
  const button = append(parent, document.createElement('button'))
  button.type = 'button'
  button.setAttribute('data-ctrl-enter-submit', '')
  return button
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('isCtrlEnter', () => {
  it('aceita Ctrl+Enter e ⌘+Enter', () => {
    expect(isCtrlEnter(keyEvent({ ctrlKey: true }))).toBe(true)
    expect(isCtrlEnter(keyEvent({ metaKey: true }))).toBe(true)
  })

  it('recusa Enter sozinho, outra tecla e Ctrl+Alt+Enter (AltGr)', () => {
    expect(isCtrlEnter(keyEvent())).toBe(false)
    expect(isCtrlEnter(keyEvent({ key: 'a', ctrlKey: true }))).toBe(false)
    expect(isCtrlEnter(keyEvent({ ctrlKey: true, altKey: true }))).toBe(false)
  })
})

describe('resolveCtrlEnterAction: precedência', () => {
  it('o escopo explícito tem prioridade sobre o <form>', () => {
    const form = append(document.body, document.createElement('form'))
    const formButton = markedButton(form)
    const scope = append(form, document.createElement('div'))
    scope.setAttribute('data-ctrl-enter-scope', '')
    const scopeButton = markedButton(scope)
    const field = textarea(scope)

    const action = resolveCtrlEnterAction(field)
    expect(action?.kind).toBe('button')
    if (action?.kind === 'button') expect(action.button).toBe(scopeButton)
    expect(action?.kind === 'button' && action.button).not.toBe(formButton)
  })

  it('sem escopo, usa o botão marcado dentro do <form> (abas de IA)', () => {
    const form = append(document.body, document.createElement('form'))
    const button = markedButton(form)
    const field = textarea(form)

    const action = resolveCtrlEnterAction(field)
    expect(action?.kind).toBe('button')
    if (action?.kind === 'button') expect(action.button).toBe(button)
  })

  it('sem <form>, encontra o botão marcado em um ancestral', () => {
    const outer = append(document.body, document.createElement('div'))
    const button = markedButton(outer)
    const field = textarea(outer)

    const action = resolveCtrlEnterAction(field)
    expect(action?.kind).toBe('button')
    if (action?.kind === 'button') expect(action.button).toBe(button)
  })

  it('cai no <form> quando não há botão marcado dentro dele', () => {
    const form = append(document.body, document.createElement('form'))
    const field = textarea(form)

    expect(resolveCtrlEnterAction(field)).toEqual({ kind: 'form', form })
  })

  it('não resolve um botão marcado fora do widget (guarda contra o body)', () => {
    markedButton(document.body)
    const widget = append(document.body, document.createElement('div'))
    const field = textarea(widget)

    expect(resolveCtrlEnterAction(field)).toBeNull()
  })
})

describe('handleCtrlEnterKey: gating e execução', () => {
  beforeEach(() => document.addEventListener('keydown', handleCtrlEnterKey, true))
  afterEach(() => document.removeEventListener('keydown', handleCtrlEnterKey, true))

  it('aciona o botão marcado e previne o padrão', () => {
    const outer = append(document.body, document.createElement('div'))
    const button = markedButton(outer)
    const onClick = vi.fn()
    button.addEventListener('click', onClick)
    const field = textarea(outer)

    const notPrevented = field.dispatchEvent(keyEvent({ ctrlKey: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(notPrevented).toBe(false)
  })

  it('submete o <form> encadeado (requestSubmit) e previne o padrão', () => {
    const form = append(document.body, document.createElement('form'))
    const onSubmit = vi.fn((event: Event) => event.preventDefault())
    form.addEventListener('submit', onSubmit)
    const field = textarea(form)

    const notPrevented = field.dispatchEvent(keyEvent({ metaKey: true }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(notPrevented).toBe(false)
  })

  it('usa o fallback de evento submit quando requestSubmit não existe', () => {
    const form = append(document.body, document.createElement('form'))
    const onSubmit = vi.fn((event: Event) => event.preventDefault())
    form.addEventListener('submit', onSubmit)
    ;(form as unknown as { requestSubmit: unknown }).requestSubmit = undefined
    const field = textarea(form)

    field.dispatchEvent(keyEvent({ ctrlKey: true }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('Enter simples não é afetado (segue o comportamento nativo)', () => {
    const form = append(document.body, document.createElement('form'))
    const onSubmit = vi.fn()
    form.addEventListener('submit', onSubmit)
    const field = textarea(form)

    const notPrevented = field.dispatchEvent(keyEvent())
    expect(notPrevented).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('ignora <input> de linha única', () => {
    const outer = append(document.body, document.createElement('div'))
    const button = markedButton(outer)
    const onClick = vi.fn()
    button.addEventListener('click', onClick)
    const input = append(outer, document.createElement('input'))

    const notPrevented = input.dispatchEvent(keyEvent({ ctrlKey: true }))
    expect(onClick).not.toHaveBeenCalled()
    expect(notPrevented).toBe(true)
  })

  it('ignora textarea dentro do terminal (.xterm)', () => {
    const terminal = append(document.body, document.createElement('div'))
    terminal.className = 'xterm'
    const button = markedButton(terminal)
    const onClick = vi.fn()
    button.addEventListener('click', onClick)
    const field = textarea(terminal)

    const notPrevented = field.dispatchEvent(keyEvent({ ctrlKey: true }))
    expect(onClick).not.toHaveBeenCalled()
    expect(notPrevented).toBe(true)
  })

  it('ignora textarea dentro de [data-ctrl-enter-ignore]', () => {
    const ignored = append(document.body, document.createElement('div'))
    ignored.setAttribute('data-ctrl-enter-ignore', '')
    const button = markedButton(ignored)
    const onClick = vi.fn()
    button.addEventListener('click', onClick)
    const field = textarea(ignored)

    field.dispatchEvent(keyEvent({ ctrlKey: true }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('ignora evento já cancelado ou em composição (IME)', () => {
    const outer = append(document.body, document.createElement('div'))
    const button = markedButton(outer)
    const onClick = vi.fn()
    button.addEventListener('click', onClick)
    const field = textarea(outer)

    const canceled = keyEvent({ ctrlKey: true })
    canceled.preventDefault()
    field.dispatchEvent(canceled)
    field.dispatchEvent(keyEvent({ ctrlKey: true, isComposing: true }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('sem alvo resolvido, não previne o padrão', () => {
    const widget = append(document.body, document.createElement('div'))
    const field = textarea(widget)

    const notPrevented = field.dispatchEvent(keyEvent({ ctrlKey: true }))
    expect(notPrevented).toBe(true)
  })
})

describe('CtrlEnterSubmit: montagem global', () => {
  function Demo() {
    return (
      <form>
        <textarea aria-label="campo" />
        <button type="button" data-ctrl-enter-submit>
          Enviar
        </button>
      </form>
    )
  }

  it('instala o listener no mount e o remove no unmount', () => {
    const { container, unmount } = render(
      <>
        <CtrlEnterSubmit />
        <Demo />
      </>,
    )
    const field = container.querySelector('textarea')
    const button = container.querySelector('button')
    if (!field || !button) throw new Error('Demo não renderizou campo/botão')
    const onClick = vi.fn()
    button.addEventListener('click', onClick)

    field.dispatchEvent(keyEvent({ ctrlKey: true }))
    expect(onClick).toHaveBeenCalledTimes(1)

    unmount()
    field.dispatchEvent(keyEvent({ ctrlKey: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('o mesmo listener global atende Ctrl+J e Ctrl+E', () => {
    const { container } = render(
      <>
        <CtrlEnterSubmit />
        <Demo />
      </>,
    )
    const field = container.querySelector('textarea')!
    field.value = 'linha um\nlinha dois'
    field.setSelectionRange(3, 3)

    const breakEvent = new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true, cancelable: true })
    field.dispatchEvent(breakEvent)
    expect(breakEvent.defaultPrevented).toBe(true)
    expect(field.value).toBe('lin\nha um\nlinha dois')

    const endEvent = new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, bubbles: true, cancelable: true })
    field.dispatchEvent(endEvent)
    expect(endEvent.defaultPrevented).toBe(true)
    expect(field.selectionStart).toBe(9)
  })
})

describe('Ctrl+J / Ctrl+E', () => {
  beforeEach(() => document.addEventListener('keydown', handleTextareaEditKey, true))
  afterEach(() => document.removeEventListener('keydown', handleTextareaEditKey, true))

  const editEvent = (key: string, overrides: Partial<KeyboardEventInit> = {}) => new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...overrides })

  it('só Ctrl puro: ⌘, Alt e Shift desqualificam', () => {
    expect(isCtrlJ(keyEvent({ key: 'j', ctrlKey: true }))).toBe(true)
    expect(isCtrlE(keyEvent({ key: 'E', ctrlKey: true }))).toBe(true)
    expect(isCtrlJ(keyEvent({ key: 'j', ctrlKey: true, metaKey: true }))).toBe(false)
    expect(isCtrlJ(keyEvent({ key: 'j', ctrlKey: true, altKey: true }))).toBe(false)
    expect(isCtrlJ(keyEvent({ key: 'j', ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isCtrlJ(keyEvent({ key: 'j' }))).toBe(false)
  })

  it('insertLineBreak quebra a linha no cursor substituindo a seleção', () => {
    const field = textarea()
    field.value = 'abcd'
    field.setSelectionRange(1, 3)

    insertLineBreak(field)

    expect(field.value).toBe('a\nd')
  })

  it('insertLineBreak respeita o maxLength do campo', () => {
    const field = textarea()
    field.value = 'abcd'
    field.maxLength = 4
    field.setSelectionRange(4, 4)

    insertLineBreak(field)

    expect(field.value).toBe('abcd')
  })

  it('moveCursorToLineEnd vai ao próximo \\n (ou ao fim do texto)', () => {
    const field = textarea()
    field.value = 'linha um\nlinha dois'

    field.setSelectionRange(2, 4)
    moveCursorToLineEnd(field)
    expect([field.selectionStart, field.selectionEnd]).toEqual([8, 8])

    field.setSelectionRange(9, 9)
    moveCursorToLineEnd(field)
    expect(field.selectionStart).toBe(field.value.length)
  })

  it('quebra a linha e leva ao fim da linha lógica no campo com foco', () => {
    const field = textarea()
    field.value = 'abc'
    field.setSelectionRange(1, 1)

    const breakEvent = editEvent('j')
    field.dispatchEvent(breakEvent)
    expect(breakEvent.defaultPrevented).toBe(true)
    expect(field.value).toBe('a\nbc')

    const endEvent = editEvent('e')
    field.dispatchEvent(endEvent)
    expect(endEvent.defaultPrevented).toBe(true)
    expect(field.selectionStart).toBe(4)
  })

  it('ignora campo somente leitura, desabilitado e composição (IME)', () => {
    const readOnly = textarea()
    readOnly.value = 'abc'
    readOnly.readOnly = true
    readOnly.setSelectionRange(1, 1)
    readOnly.dispatchEvent(editEvent('j'))

    const disabled = textarea()
    disabled.value = 'abc'
    disabled.disabled = true
    disabled.setSelectionRange(1, 1)
    disabled.dispatchEvent(editEvent('j'))

    const composing = textarea()
    composing.value = 'abc'
    composing.setSelectionRange(1, 1)
    composing.dispatchEvent(editEvent('j', { isComposing: true }))

    expect(readOnly.value).toBe('abc')
    expect(disabled.value).toBe('abc')
    expect(composing.value).toBe('abc')
  })

  it('ignora textarea no terminal (.xterm) e em [data-textarea-shortcuts-ignore]', () => {
    const terminal = append(document.body, document.createElement('div'))
    terminal.className = 'xterm'
    const inTerminal = textarea(terminal)
    inTerminal.value = 'abc'
    inTerminal.setSelectionRange(1, 1)

    const ignored = append(document.body, document.createElement('div'))
    ignored.setAttribute('data-textarea-shortcuts-ignore', '')
    const inIgnored = textarea(ignored)
    inIgnored.value = 'abc'
    inIgnored.setSelectionRange(1, 1)

    const terminalEvent = editEvent('j')
    inTerminal.dispatchEvent(terminalEvent)
    const ignoredEvent = editEvent('j')
    inIgnored.dispatchEvent(ignoredEvent)

    expect(inTerminal.value).toBe('abc')
    expect(inIgnored.value).toBe('abc')
    expect(terminalEvent.defaultPrevented).toBe(false)
    expect(ignoredEvent.defaultPrevented).toBe(false)
  })

  it('ignora teclas sem Ctrl e eventos já cancelados', () => {
    const field = textarea()
    field.value = 'abc'
    field.setSelectionRange(1, 1)

    const plain = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true })
    field.dispatchEvent(plain)
    expect(plain.defaultPrevented).toBe(false)
    expect(field.value).toBe('abc')

    const canceled = editEvent('j')
    canceled.preventDefault()
    field.dispatchEvent(canceled)
    expect(field.value).toBe('abc')
  })
})

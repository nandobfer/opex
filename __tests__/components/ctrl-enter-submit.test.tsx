/** @vitest-environment jsdom */

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CtrlEnterSubmit, handleCtrlEnterKey, isCtrlEnter, resolveCtrlEnterAction } from '@/components/ctrl-enter-submit'

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
})

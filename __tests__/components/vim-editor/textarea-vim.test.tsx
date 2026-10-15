/** @vitest-environment jsdom */

import { useForm } from 'react-hook-form'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { Vim, getCM } from '@replit/codemirror-vim'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { Textarea } from '@/components/ui/textarea'
import { CtrlEnterSubmit } from '@/components/ctrl-enter-submit'
import { EDITOR_MODE_KEY } from '@/features/editor-mode/preference'
import { LINE_NUMBERS_KEY } from '@/features/editor-mode/line-numbers'

beforeAll(() => {
  // jsdom não mede layout; o CodeMirror só precisa de retângulos vazios.
  const rects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
  Range.prototype.getClientRects = rects
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  Element.prototype.scrollIntoView = () => undefined
})

beforeEach(() => {
  window.localStorage.setItem(EDITOR_MODE_KEY, JSON.stringify('vim'))
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  document.body.innerHTML = ''
})

async function editorIn(container: HTMLElement): Promise<EditorView> {
  const dom = await waitFor(() => {
    const found = container.querySelector<HTMLElement>('.cm-editor')
    if (!found) throw new Error('editor ainda não montou')
    return found
  }, { timeout: 5000 })
  const view = EditorView.findFromDOM(dom)
  if (!view) throw new Error('EditorView não encontrado')
  return view
}

function type(view: EditorView, text: string) {
  act(() => {
    view.dispatch({ changes: { from: view.state.doc.length, insert: text } })
  })
}

function press(view: EditorView, key: string, ctrlKey = true) {
  const event = new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true, cancelable: true })
  act(() => {
    view.contentDOM.dispatchEvent(event)
  })
  return event
}

const modeBadge = (container: HTMLElement) => container.querySelector('[data-vim-mode]')!.getAttribute('data-vim-mode')

function NoteForm({ onSubmit }: { onSubmit: (values: { note: string }) => void }) {
  const form = useForm<{ note: string }>({ defaultValues: { note: 'olá' } })
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Textarea aria-label="Nota" rows={3} {...form.register('note')} />
      <button type="submit">Salvar</button>
      <button type="button" onClick={() => form.reset({ note: 'resetado' })}>
        Resetar
      </button>
    </form>
  )
}

describe('Textarea no modo Vim', () => {
  it('troca o campo pelo editor e mantém o react-hook-form recebendo o texto', async () => {
    const onSubmit = vi.fn()
    const { container, getByText } = render(<NoteForm onSubmit={onSubmit} />)
    const view = await editorIn(container)
    const textarea = container.querySelector('textarea')!

    expect(view.state.doc.toString()).toBe('olá')
    await waitFor(() => expect(textarea.style.position).toBe('fixed'))
    expect(textarea.tabIndex).toBe(-1)

    type(view, ' mundo')
    expect(textarea.value).toBe('olá mundo')

    await act(async () => {
      getByText('Salvar').click()
    })
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual({ note: 'olá mundo' })
  })

  it('reflete no editor o reset do formulário', async () => {
    const { container, getByText } = render(<NoteForm onSubmit={() => undefined} />)
    const view = await editorIn(container)

    act(() => {
      getByText('Resetar').click()
    })

    expect(view.state.doc.toString()).toBe('resetado')
  })

  it('mostra o selo de modo e volta ao campo normal ao clicar nele', async () => {
    const { container } = render(<Textarea aria-label="Campo" />)
    await editorIn(container)
    const badge = container.querySelector<HTMLButtonElement>('[data-vim-mode]')!
    expect(badge.getAttribute('data-vim-mode')).toBe('normal')

    act(() => {
      badge.click()
    })

    await waitFor(() => expect(container.querySelector('.cm-editor')).toBeNull())
    expect(window.localStorage.getItem(EDITOR_MODE_KEY)).toBe('"native"')
    expect(container.querySelector('textarea')!.style.position).toBe('')
  })

  it('Ctrl+Enter no editor aciona o botão marcado do campo', async () => {
    const send = vi.fn()
    const { container } = render(
      <div>
        <CtrlEnterSubmit />
        <Textarea aria-label="Comentário" />
        <button type="button" data-ctrl-enter-submit onClick={send}>
          Enviar
        </button>
      </div>,
    )
    const view = await editorIn(container)

    const event = press(view, 'Enter')

    expect(send).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('Ctrl+J no INSERT quebra a linha no cursor', async () => {
    const { container } = render(<Textarea aria-label="Campo" defaultValue={'um\ndois'} />)
    const view = await editorIn(container)

    act(() => {
      view.dispatch({ selection: { anchor: 2 } })
      Vim.handleKey(getCM(view)!, 'i', 'user')
    })
    await waitFor(() => expect(modeBadge(container)).toBe('insert'))

    press(view, 'j')
    expect(view.state.doc.toString()).toBe('um\n\ndois')
  })

  it('Ctrl+J respeita o maxLength do campo', async () => {
    const { container } = render(<Textarea aria-label="Campo" defaultValue="abc" maxLength={3} />)
    const view = await editorIn(container)

    act(() => {
      Vim.handleKey(getCM(view)!, 'A', 'user')
    })
    await waitFor(() => expect(modeBadge(container)).toBe('insert'))

    press(view, 'j')
    expect(view.state.doc.toString()).toBe('abc')
  })

  it('Ctrl+E no INSERT vai ao fim da linha lógica', async () => {
    const { container } = render(<Textarea aria-label="Campo" defaultValue={'um\ndois três'} />)
    const view = await editorIn(container)

    act(() => {
      view.dispatch({ selection: { anchor: 0 } })
      Vim.handleKey(getCM(view)!, 'i', 'user')
    })
    await waitFor(() => expect(modeBadge(container)).toBe('insert'))

    press(view, 'e')
    expect(view.state.selection.main.head).toBe(2)

    press(view, 'e')
    expect(view.state.selection.main.head).toBe(2)
  })

  it('Esc no modo de inserção volta ao normal sem chegar aos listeners do documento', async () => {
    const { container } = render(<Textarea aria-label="Campo" />)
    const view = await editorIn(container)
    const documentEscape = vi.fn()
    const onDocumentKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') documentEscape()
    }
    document.addEventListener('keydown', onDocumentKey, true)

    act(() => {
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true, cancelable: true }))
    })
    await waitFor(() => expect(modeBadge(container)).toBe('insert'))

    act(() => {
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(documentEscape).not.toHaveBeenCalled()
    await waitFor(() => expect(modeBadge(container)).toBe('normal'))

    // No modo normal o Esc segue (ex.: o diálogo em volta fecha).
    act(() => {
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(documentEscape).toHaveBeenCalledTimes(1)
    document.removeEventListener('keydown', onDocumentKey, true)
  })

  it('desenha a seleção do modo visual (a nativa fica escondida pelo Vim)', async () => {
    const { container } = render(<Textarea aria-label="Campo" defaultValue="selecione isto" />)
    const view = await editorIn(container)

    expect(container.querySelector('.cm-selectionLayer')).not.toBeNull()
    act(() => {
      view.dispatch({ selection: { anchor: 0 } })
      Vim.handleKey(getCM(view)!, 'v', 'user')
      Vim.handleKey(getCM(view)!, '$', 'user')
    })

    const { from, to } = view.state.selection.main
    expect([from, to]).toEqual([0, 'selecione isto'.length])
    await waitFor(() => expect(modeBadge(container)).toBe('visual'))
  })

  it('mostra os números de linha e `:set rnu`/`:set nonu` mudam e persistem a coluna', async () => {
    const { container } = render(<Textarea aria-label="Campo" defaultValue={'um\ndois\ntrês'} />)
    const view = await editorIn(container)
    const numbers = () => Array.from(container.querySelectorAll('.cm-lineNumbers .cm-gutterElement')).map((el) => el.textContent).filter((text) => text && !/^9+$/.test(text))

    await waitFor(() => expect(numbers()).toEqual(['1', '2', '3']))

    act(() => {
      view.dispatch({ selection: { anchor: 0 } })
      Vim.handleEx(getCM(view)!, 'set rnu')
    })
    await waitFor(() => expect(numbers()).toEqual(['1', '1', '2']))
    expect(JSON.parse(window.localStorage.getItem(LINE_NUMBERS_KEY)!)).toEqual({ number: true, relativenumber: true })

    act(() => {
      Vim.handleEx(getCM(view)!, 'set nonu')
    })
    await waitFor(() => expect(numbers()).toEqual(['0', '1', '2']))

    act(() => {
      Vim.handleEx(getCM(view)!, 'set nornu')
    })
    await waitFor(() => expect(container.querySelector('.cm-lineNumbers')).toBeNull())
  })

  it('não vira editor com vim={false}, no terminal nem no modo nativo', async () => {
    const { container, rerender } = render(
      <div>
        <Textarea aria-label="Excluído" vim={false} />
        <div className="xterm">
          <Textarea aria-label="Terminal" />
        </div>
      </div>,
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(container.querySelector('.cm-editor')).toBeNull()

    window.localStorage.setItem(EDITOR_MODE_KEY, JSON.stringify('native'))
    rerender(<Textarea aria-label="Nativo" />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(container.querySelector('.cm-editor')).toBeNull()
  })
})

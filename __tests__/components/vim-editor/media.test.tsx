/**
 * @vitest-environment happy-dom
 */

import { useState } from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { MarkdownField, type MarkdownUploads } from '@/components/ui/markdown-field'
import { EDITOR_MODE_KEY } from '@/features/editor-mode/preference'

/**
 * Como no navegador: um evento de colar criado por código não leva os arquivos da colagem (o
 * `DataTransfer` é protegido). O campo lê os arquivos do evento original (OPE-119).
 */
class BrowserLikeClipboardEvent extends Event {
  readonly clipboardData = null
}

beforeAll(() => {
  const rects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
  Range.prototype.getClientRects = rects
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  Element.prototype.scrollIntoView = () => undefined
  vi.stubGlobal('ClipboardEvent', BrowserLikeClipboardEvent)
})

afterAll(() => {
  vi.unstubAllGlobals()
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

function pasteEvent(files: File[]): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { files, getData: () => '' } })
  return event
}

function Harness({ uploads, ariaLabel }: { uploads?: MarkdownUploads; ariaLabel?: string }) {
  const [value, setValue] = useState('')
  return <MarkdownField value={value} onChange={setValue} uploads={uploads} ariaLabel={ariaLabel} />
}

function dropEvent(files: File[]): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { files, getData: () => '' } })
  return event
}

function uploadsWith(enqueue: MarkdownUploads['enqueue']): MarkdownUploads {
  return { enqueue, items: [], retry: () => undefined, cancel: () => undefined, dismiss: () => undefined }
}

describe('MarkdownField no modo Vim: arquivos capturados no contêiner do campo (OPE-119)', () => {
  it('colar um print no comentário envia a imagem e insere a referência lendo os arquivos do evento original', async () => {
    const enqueue = vi.fn((file: File) => ({ id: 'c1', markdown: Promise.resolve(`![${file.name}](/api/attachments/c1/content)`) }))
    const { container } = render(<Harness uploads={uploadsWith(enqueue)} ariaLabel="Novo comentário" />)
    const view = await editorIn(container)
    const file = new File(['x'], 'print.png', { type: 'image/png' })

    act(() => {
      view.dispatch({ changes: { from: 0, insert: 'veja ' }, selection: { anchor: 5 } })
    })
    const event = pasteEvent([file])
    act(() => {
      view.contentDOM.dispatchEvent(event)
    })

    expect(event.defaultPrevented).toBe(true)
    expect(enqueue).toHaveBeenCalledWith(file)
    await waitFor(() => expect(view.state.doc.toString()).toBe('veja \n\n![print.png](/api/attachments/c1/content)'))
    expect(container.querySelector('textarea')?.value).toBe('veja \n\n![print.png](/api/attachments/c1/content)')
  })

  it('a colagem assumida não chega ao editor: o texto só muda quando o envio confirma', async () => {
    let confirm: (markdown: string) => void = () => undefined
    const enqueue = vi.fn(() => ({ id: 'c2', markdown: new Promise<string>((resolve) => (confirm = resolve)) }))
    const { container } = render(<Harness uploads={uploadsWith(enqueue)} />)
    const view = await editorIn(container)

    act(() => {
      view.contentDOM.dispatchEvent(pasteEvent([new File(['x'], 'foto.png', { type: 'image/png' })]))
    })
    expect(view.state.doc.toString()).toBe('')

    await act(async () => {
      confirm('![foto.png](/api/attachments/c2/content)')
    })
    await waitFor(() => expect(view.state.doc.toString()).toBe('![foto.png](/api/attachments/c2/content)'))
  })

  it('soltar um arquivo no editor envia e insere a referência', async () => {
    const enqueue = vi.fn((file: File) => ({ id: 'd1', markdown: Promise.resolve(`![${file.name}](/api/attachments/d1/content)`) }))
    const { container } = render(<Harness uploads={uploadsWith(enqueue)} />)
    const view = await editorIn(container)
    const file = new File(['x'], 'solta.png', { type: 'image/png' })
    const event = dropEvent([file])

    act(() => {
      view.contentDOM.dispatchEvent(event)
    })

    expect(event.defaultPrevented).toBe(true)
    expect(enqueue).toHaveBeenCalledWith(file)
    await waitFor(() => expect(view.state.doc.toString()).toContain('/api/attachments/d1/content'))
  })

  it('sem envio de mídia no campo, o arquivo colado não é capturado e nada é inserido', async () => {
    const { container } = render(<Harness />)
    const view = await editorIn(container)
    const textareaPaste = vi.fn()
    container.querySelector('textarea')?.addEventListener('paste', textareaPaste)

    act(() => {
      view.contentDOM.dispatchEvent(pasteEvent([new File(['x'], 'foto.png', { type: 'image/png' })]))
    })

    expect(view.state.doc.toString()).toBe('')
    expect(textareaPaste).not.toHaveBeenCalled()
  })
})

describe('MarkdownField no modo Vim: mídia colada no editor', () => {
  it('encaminha o arquivo colado ao campo e insere a referência na posição do cursor', async () => {
    const enqueue = vi.fn((file: File) => ({ id: 'a1', markdown: Promise.resolve(`![${file.name}](/api/attachments/a1/content)`) }))
    const uploads: MarkdownUploads = { enqueue, items: [], retry: () => undefined, cancel: () => undefined, dismiss: () => undefined }
    const { container } = render(<Harness uploads={uploads} />)
    const view = await editorIn(container)
    const file = new File(['x'], 'foto.png', { type: 'image/png' })

    act(() => {
      view.dispatch({ changes: { from: 0, insert: 'texto ' }, selection: { anchor: 6 } })
    })
    act(() => {
      view.contentDOM.dispatchEvent(pasteEvent([file]))
    })

    expect(enqueue).toHaveBeenCalledWith(file)
    await waitFor(() => expect(view.state.doc.toString()).toContain('/api/attachments/a1/content'))
    expect(view.state.doc.toString().startsWith('texto ')).toBe(true)
  })

  it('sem arquivos, nada é enfileirado e o campo segue com o texto normal', async () => {
    const enqueue = vi.fn()
    const uploads: MarkdownUploads = { enqueue, items: [], retry: () => undefined, cancel: () => undefined, dismiss: () => undefined }
    const { container } = render(<Harness uploads={uploads} />)
    const view = await editorIn(container)

    act(() => {
      view.contentDOM.dispatchEvent(pasteEvent([]))
    })

    expect(enqueue).not.toHaveBeenCalled()
    expect(view.state.doc.toString()).toBe('')
  })
})

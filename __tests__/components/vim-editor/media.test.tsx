/**
 * @vitest-environment jsdom
 *
 * jsdom de propósito: no happy-dom o `paste` despachado no conteúdo do CodeMirror não chega ao
 * encaminhamento de arquivos do editor (o handler de colar do CodeMirror não roda), então o arquivo
 * nunca é enfileirado.
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
 * O jsdom não implementa `ClipboardEvent`; o editor o usa ao encaminhar o arquivo colado ao
 * `<textarea>` do campo. O stub preserva apenas o `clipboardData` que o encaminhamento carrega.
 */
class TestClipboardEvent extends Event {
  readonly clipboardData: unknown

  constructor(type: string, init: ClipboardEventInit = {}) {
    super(type, init)
    this.clipboardData = init.clipboardData ?? null
  }
}

beforeAll(() => {
  const rects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
  Range.prototype.getClientRects = rects
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  Element.prototype.scrollIntoView = () => undefined
  vi.stubGlobal('ClipboardEvent', TestClipboardEvent)
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

function Harness({ uploads }: { uploads: MarkdownUploads }) {
  const [value, setValue] = useState('')
  return <MarkdownField value={value} onChange={setValue} uploads={uploads} />
}

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

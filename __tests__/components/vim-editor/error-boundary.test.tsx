/** @vitest-environment happy-dom */

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorErrorBoundary } from '@/components/ui/vim-editor/EditorErrorBoundary'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function Boom(): never {
  throw new Error('chunk do editor indisponível')
}

describe('EditorErrorBoundary', () => {
  it('não renderiza nada e avisa a falha quando o editor não carrega', () => {
    const onError = vi.fn()
    const { container } = render(
      <EditorErrorBoundary onError={onError}>
        <Boom />
      </EditorErrorBoundary>,
    )

    expect(container.querySelector('*')).toBeNull()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('renderiza os filhos quando não há falha', () => {
    const onError = vi.fn()
    const { getByText } = render(
      <EditorErrorBoundary onError={onError}>
        <span>editor pronto</span>
      </EditorErrorBoundary>,
    )

    expect(getByText('editor pronto').textContent).toBe('editor pronto')
    expect(onError).not.toHaveBeenCalled()
  })
})

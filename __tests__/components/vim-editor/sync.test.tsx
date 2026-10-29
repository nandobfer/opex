/** @vitest-environment happy-dom */

import { useState } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { minimalChange, mirrorSelection, watchExternalValue, writeTextareaValue } from '@/components/ui/vim-editor/sync'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function Controlled({ onValue }: { onValue: (value: string) => void }) {
  const [value, setValue] = useState('inicial')
  return (
    <textarea
      data-testid="field"
      value={value}
      onChange={(event) => {
        setValue(event.target.value)
        onValue(event.target.value)
      }}
    />
  )
}

describe('writeTextareaValue', () => {
  it('dispara o onChange de um campo controlado do React', () => {
    const onValue = vi.fn()
    const { getByTestId } = render(<Controlled onValue={onValue} />)
    const field = getByTestId('field') as HTMLTextAreaElement

    writeTextareaValue(field, 'digitado no vim')

    expect(onValue).toHaveBeenCalledWith('digitado no vim')
    expect(field.value).toBe('digitado no vim')
  })

  it('não dispara evento quando o valor não mudou', () => {
    const field = document.body.appendChild(document.createElement('textarea'))
    field.value = 'igual'
    const onInput = vi.fn()
    field.addEventListener('input', onInput)

    writeTextareaValue(field, 'igual')

    expect(onInput).not.toHaveBeenCalled()
  })
})

describe('watchExternalValue', () => {
  it('avisa atribuições externas, ignora as do editor e restaura o descritor', () => {
    const field = document.body.appendChild(document.createElement('textarea'))
    const onChange = vi.fn()
    const stop = watchExternalValue(field, onChange)

    field.value = 'reset do formulário'
    expect(onChange).toHaveBeenCalledWith('reset do formulário')

    writeTextareaValue(field, 'veio do editor')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(field.value).toBe('veio do editor')

    stop()
    field.value = 'depois'
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(Object.getOwnPropertyDescriptor(field, 'value')).toBeUndefined()
  })
})

describe('mirrorSelection', () => {
  it('espelha a seleção limitada ao tamanho do texto', () => {
    const field = document.body.appendChild(document.createElement('textarea'))
    field.value = 'abcdef'

    mirrorSelection(field, 2, 4)
    expect([field.selectionStart, field.selectionEnd]).toEqual([2, 4])

    mirrorSelection(field, 3, 99)
    expect([field.selectionStart, field.selectionEnd]).toEqual([3, 6])
  })
})

describe('minimalChange', () => {
  it('troca só o trecho diferente', () => {
    expect(minimalChange('olá mundo', 'olá novo mundo')).toEqual({ from: 4, to: 4, insert: 'novo ' })
    expect(minimalChange('abc', 'aXc')).toEqual({ from: 1, to: 2, insert: 'X' })
    expect(minimalChange('apagar tudo', '')).toEqual({ from: 0, to: 11, insert: '' })
  })

  it('devolve null quando nada mudou', () => {
    expect(minimalChange('igual', 'igual')).toBeNull()
  })
})

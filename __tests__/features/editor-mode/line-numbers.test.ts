/** @vitest-environment happy-dom */

import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_LINE_NUMBERS, LINE_NUMBERS_KEY, formatLineNumber, readLineNumbers, setLineNumberOption } from '@/features/editor-mode/line-numbers'

beforeEach(() => {
  window.localStorage.clear()
})

describe('formatLineNumber', () => {
  it('number: número absoluto em todas as linhas', () => {
    const options = { number: true, relativenumber: false }
    expect(formatLineNumber(1, 3, options)).toBe('1')
    expect(formatLineNumber(3, 3, options)).toBe('3')
  })

  it('relativenumber: distância até o cursor e 0 na linha do cursor', () => {
    const options = { number: false, relativenumber: true }
    expect(formatLineNumber(1, 3, options)).toBe('2')
    expect(formatLineNumber(3, 3, options)).toBe('0')
    expect(formatLineNumber(7, 3, options)).toBe('4')
  })

  it('número híbrido (os dois): absoluto na linha do cursor, relativo nas demais', () => {
    const options = { number: true, relativenumber: true }
    expect(formatLineNumber(3, 3, options)).toBe('3')
    expect(formatLineNumber(5, 3, options)).toBe('2')
  })
})

describe('preferência dos números de linha', () => {
  it('começa com number ligado e grava cada opção no navegador', () => {
    expect(readLineNumbers()).toEqual(DEFAULT_LINE_NUMBERS)

    setLineNumberOption('relativenumber', true)
    setLineNumberOption('number', false)

    expect(readLineNumbers()).toEqual({ number: false, relativenumber: true })
    expect(JSON.parse(window.localStorage.getItem(LINE_NUMBERS_KEY)!)).toEqual({ number: false, relativenumber: true })
  })
})

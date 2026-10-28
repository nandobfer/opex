/** @vitest-environment happy-dom */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { usePersistentState } from '@/hooks/usePersistentState'
import { clearStorage, fireStorageEvent } from '../helpers/hooks'

const schema = z.object({ view: z.enum(['kanban', 'table']).catch('kanban'), tags: z.array(z.string()).catch([]) })
const fallback = { view: 'kanban' as const, tags: [] as string[] }
const KEY = 'test:persistent:v1'

beforeEach(() => clearStorage())

describe('usePersistentState', () => {
  it('grava no localStorage e mantém entre montagens', () => {
    const first = renderHook(() => usePersistentState(KEY, schema, fallback))
    expect(first.result.current.ready).toBe(true)
    act(() => first.result.current.setValue((prev) => ({ ...prev, view: 'table' })))
    expect(first.result.current.value.view).toBe('table')
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({ view: 'table', tags: [] })
    first.unmount()

    const second = renderHook(() => usePersistentState(KEY, schema, fallback))
    expect(second.result.current.value.view).toBe('table')
  })

  it('conteúdo corrompido ou inválido volta ao padrão', () => {
    window.localStorage.setItem(KEY, '{nao-e-json')
    expect(renderHook(() => usePersistentState(KEY, schema, fallback)).result.current.value).toEqual(fallback)
    window.localStorage.setItem(KEY, JSON.stringify({ view: 'outra', tags: ['a'] }))
    expect(renderHook(() => usePersistentState(KEY, schema, fallback)).result.current.value).toEqual({ view: 'kanban', tags: ['a'] })
  })

  it('sincroniza com outra aba (evento storage) e reset volta ao padrão', () => {
    const { result } = renderHook(() => usePersistentState(KEY, schema, fallback))
    act(() => {
      window.localStorage.setItem(KEY, JSON.stringify({ view: 'table', tags: ['x'] }))
      fireStorageEvent(KEY, null)
    })
    expect(result.current.value).toEqual({ view: 'table', tags: ['x'] })
    act(() => result.current.reset())
    expect(result.current.value).toEqual(fallback)
  })
})

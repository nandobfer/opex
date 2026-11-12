/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Bot } from 'lucide-react'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Peças reais do chat no escopo de um agente rotineiro (OPE-160): `useOpexView` lê o status da conversa
 * (não as configurações do Agente Opex), o estado vazio é o da conversa e a fila de anexos fica inerte.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), api: { get: mocks.get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))

import { OpexScopeProvider } from '@/features/opex-agent/components/OpexScopeProvider'
import { useOpexView } from '@/features/opex-agent/hooks/useOpexSettings'
import { useOpexUploads } from '@/features/opex-agent/hooks/useOpexUploads'
import { OpexEmptyChat } from '@/features/opex-agent/components/chat/OpexEmptyChat'
import { routineChatUiScope } from '@/features/routine-agents/components/chat/routine-chat-scope'

const scope = routineChatUiScope({ id: 'ag1', title: 'Agente Vagas' }, Bot)

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={client}>
      <OpexScopeProvider value={scope}>{children}</OpexScopeProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockImplementation(async (path: string) =>
    path === '/routine-agents/ag1/chat/status'
      ? { data: { success: true, data: { enabled: true, available: false, reason: 'Retome o agente para conversar', modelLabel: 'OpenAI · gpt-x', files: { maxPerMessage: 5, maxSizeMb: 10 } } } }
      : Promise.reject(new Error(`rota inesperada: ${path}`)),
  )
})
afterEach(() => cleanup())

describe('chat no escopo do agente rotineiro (OPE-160)', () => {
  it('useOpexView usa o status da conversa: modelo do agente e o motivo da indisponibilidade', async () => {
    const { result } = renderHook(() => useOpexView(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(mocks.get).toHaveBeenCalledWith('/routine-agents/ag1/chat/status')
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(result.current.data).toMatchObject({ modelLabel: 'OpenAI · gpt-x', availability: { available: false, reason: 'Retome o agente para conversar' } })
  })

  it('estado vazio da conversa: sem sugestões, explica que não é execução', () => {
    render(<OpexEmptyChat onPick={vi.fn()} />, { wrapper })
    expect(screen.getByText(/não dispara uma execução/)).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('fila de anexos inerte (sem provider), sem quebrar o chat', () => {
    const { result } = renderHook(() => useOpexUploads('s1'), { wrapper })
    expect(result.current.items).toEqual([])
    expect(result.current.available).toBe(false)
  })
})

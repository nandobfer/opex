/** @vitest-environment happy-dom */

import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * OPE-195: a ligação real do rascunho — o `OpexChat` passa a aba da sessão ao campo e o `useAgentChat`
 * esquece os rascunhos das sessões que saíram da lista (os demais testes usam dublês desses pontos).
 */

const mocks = vi.hoisted(() => ({ sessions: [] as { id: string; status: string; title: string }[] }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock('@/features/opex-agent/hooks/useOpexSessions', () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false })
  return {
    useOpexSessions: () => ({ data: mocks.sessions }),
    useOpexSession: () => ({ data: { session: { id: 's1', status: 'idle' }, messages: [] }, isLoading: false, isError: false }),
    useSendOpexMessage: mutation,
    useInterruptOpex: mutation,
    useDecideOpexAction: mutation,
  }
})
vi.mock('@/features/opex-agent/hooks/useOpexStream', () => ({ useOpexStream: () => ({ live: null, settled: null, status: null, connected: true }) }))
vi.mock('@/features/opex-agent/hooks/useOpexUploads', () => ({
  useOpexUploads: () => ({ items: [], ready: [], enqueue: vi.fn(), retry: vi.fn(), remove: vi.fn(), clearSent: vi.fn() }),
}))
vi.mock('@/features/opex-agent/hooks/useOpexSettings', () => ({
  useOpexView: () => ({ data: { availability: { available: true, reason: null }, files: { maxPerMessage: 5, maxSizeMb: 10 } }, isLoading: false }),
}))

import { OpexChat } from '@/features/opex-agent/components/chat/OpexChat'
import { useAgentChat } from '@/features/opex-agent/components/agents/AgentChatBody'
import { composerDraftsKey } from '@/features/opex-agent/hooks/useComposerDraft'
import { OPEX_DRAFT_TAB } from '@/features/opex-agent/hooks/useOpexTabs'
import { OPEX_TABS_STORAGE_KEY } from '@/features/opex-agent/constants'

const draftsKey = composerDraftsKey(OPEX_TABS_STORAGE_KEY)
const field = () => screen.getByLabelText('Mensagem para o Agente Opex') as HTMLTextAreaElement
// O chat real monta também a faixa "Observando…" (OPE-194), que consulta o TanStack Query.
const withClient = (children: ReactNode) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>

beforeEach(() => {
  window.localStorage.clear()
  mocks.sessions = []
})
afterEach(cleanup)

describe('ligação do rascunho no chat real', () => {
  it('OpexChat: o texto digitado na sessão volta depois de desmontar e montar', () => {
    const first = render(withClient(<OpexChat sessionId="s1" />))
    fireEvent.change(field(), { target: { value: 'continua depois' } })
    expect(JSON.parse(window.localStorage.getItem(draftsKey) ?? '{}')).toEqual({ s1: 'continua depois' })
    first.unmount()
    render(withClient(<OpexChat sessionId="s1" />))
    expect(field().value).toBe('continua depois')
  })

  it('useAgentChat esquece o rascunho de sessão que saiu da lista e mantém a "Nova sessão"', async () => {
    window.localStorage.setItem(draftsKey, JSON.stringify({ [OPEX_DRAFT_TAB]: 'nova', a: 'fica', gone: 'some' }))
    mocks.sessions = [{ id: 'a', status: 'idle', title: 'A' }]
    renderHook(() => useAgentChat())
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(draftsKey) ?? '{}')).toEqual({ [OPEX_DRAFT_TAB]: 'nova', a: 'fica' }))
  })
})

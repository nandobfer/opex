/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/** OPE-117: aba Identidades em dois níveis (apps → detalhe do app/agente), token em uso e rotação. */

const now = new Date().toISOString()
const ago = (days: number) => new Date(Date.now() - days * 86400_000).toISOString()
const data = vi.hoisted(() => ({
  apps: [] as unknown[],
  agents: [] as unknown[],
  tokens: [] as unknown[],
  subscriptions: [] as unknown[],
  rotate: vi.fn(async (): Promise<unknown> => ({ token: { id: 'tk_new', prefix: 'eng.tk_new' }, secret: 'eng.tk_new.SEGREDO', own: null, savedOwn: false })),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/features/engramind/hooks/useEngramindConnection', () => ({ useEngramindConnection: () => ({ data: { whoami: { token_id: 'tk_admin', app: { slug: 'opex' } }, appTokenId: 'tk_app' } }) }))
vi.mock('@/features/engramind/hooks/useAgentActivity', () => ({ useAgentActivity: () => ({ query: { isLoading: false }, byAgent: new Map([['desenvolvedor', { agent: 'desenvolvedor', total: 5, last7d: 2, lastWriteAt: null, delivery: null, selfMemory: true, stale: false }]]) }) }))
vi.mock('@/features/engramind/hooks/useEngramind', async (original) => {
  const { useState } = await import('react')
  return {
    ...(await original<object>()),
    useEngramindList: (path: string | null) => ({ items: path ? ((data as Record<string, unknown>)[path] ?? []) : [], isLoading: false, error: null, refetch: vi.fn() }),
    engramindSend: (_method: string, path: string) => (path.endsWith('/rotate') ? data.rotate() : Promise.resolve({})),
    useEngramindMutation: (request: (variables: unknown) => Promise<unknown>) => {
      const [isPending, setPending] = useState(false)
      return {
        isPending,
        mutate: (variables: unknown, options?: { onSuccess?: (result: unknown) => void }) => {
          setPending(true)
          void request(variables).then((result) => {
            setPending(false)
            options?.onSuccess?.(result)
          })
        },
        mutateAsync: request,
      }
    },
  }
})

import { IdentitiesTab } from '@/features/engramind/components/integration/identities/IdentitiesTab'

const ref = (id: string, slug: string) => ({ id, slug })
const token = (id: string, extra: Record<string, unknown> = {}) => ({ id, prefix: `eng.${id}`, kind: 'agent', scopes: ['read', 'write'], app: ref('app_opex', 'opex'), agent: null, label: null, status: 'active', created_at: ago(1), expires_at: null, revoked_at: null, last_used_at: ago(1), ...extra })

beforeEach(() => {
  vi.clearAllMocks()
  data.apps = [
    { id: 'app_opex', slug: 'opex', name: 'Opex', description: null, created_at: now, disabled_at: null, webhook: { url: 'http://opex/api/engramind/webhook', secret: { configured: true, updated_at: now } } },
    { id: 'app_outro', slug: 'outro', name: 'Outro', description: null, created_at: now, disabled_at: null, webhook: null },
  ]
  data.agents = [{ id: 'ag_dev', slug: 'desenvolvedor', qualified_slug: 'opex/desenvolvedor', name: 'Agente desenvolvedor', description: null, app: ref('app_opex', 'opex'), created_at: now, disabled_at: null }]
  data.tokens = [
    token('tk_admin', { kind: 'admin', label: 'Opex' }),
    token('tk_admin2', { kind: 'admin', app: ref('app_outro', 'outro'), last_used_at: ago(40) }),
    token('tk_app', { kind: 'app', label: 'Opex · provisionamento (app)' }),
    token('tk_dev', { agent: ref('ag_dev', 'desenvolvedor') }),
    token('tk_outro_app', { kind: 'app', app: ref('app_outro', 'outro') }),
  ]
  data.subscriptions = [{ id: 's1', agent: { ...ref('ag_dev', 'desenvolvedor'), qualified_slug: 'opex/desenvolvedor' }, target: 'agentes/desenvolvedor/*', is_prefix: true, mode: 'inject', access: null, priority: null, reaches: ['agentes/desenvolvedor/global'], created_at: now }]
})
afterEach(cleanup)

const mount = () => render(<IdentitiesTab onDirtyChange={vi.fn()} onConfigure={vi.fn()} />)

describe('aba Identidades', () => {
  it('lista os apps com contagens e só os tokens administrativos na lista geral (com alerta de sem uso)', () => {
    mount()
    expect(screen.getByTestId('app-summary-opex').textContent).toContain('1 agente(s) · 3 token(s) ativo(s)')
    const prefixes = [...document.querySelectorAll('.font-mono')].map((node) => node.textContent)
    expect(prefixes).toContain('eng.tk_admin')
    expect(prefixes).toContain('eng.tk_admin2')
    expect(prefixes).not.toContain('eng.tk_app')
    expect(prefixes).not.toContain('eng.tk_dev')
    expect(screen.getAllByText('sem uso').length).toBeGreaterThan(0)
  })

  it('busca de apps filtra pela lista', () => {
    mount()
    fireEvent.change(screen.getByLabelText('Buscar app'), { target: { value: 'outr' } })
    expect(screen.queryByTestId('app-summary-opex')).toBeNull()
    expect(screen.getByTestId('app-summary-outro')).toBeTruthy()
  })

  it('detalhe do app: o token em uso (o de app do Opex) fica no topo marcado "Este Opex"; agentes e tokens sem agente nas abas', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir o app opex' }))
    const inUse = screen.getByTestId('in-use-token')
    expect(inUse.textContent).toContain('eng.tk_app')
    expect(inUse.textContent).toContain('Este Opex')
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Tokens/ }))
    fireEvent.click(screen.getByRole('tab', { name: /Tokens/ }))
    expect(screen.getByRole('tab', { name: 'Tokens (1)' })).toBeTruthy()
  })

  it('rotacionar um token alheio mostra o novo segredo uma única vez', async () => {
    mount()
    fireEvent.click(screen.getAllByRole('button', { name: 'Rotacionar token' })[1]!)
    expect(screen.getByText(/o consumidor precisa receber o novo segredo/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rotacionar' }))
    const result = await screen.findByTestId('rotate-result')
    expect(data.rotate).toHaveBeenCalledTimes(1)
    expect(result.textContent).not.toContain('não conseguiu gravar')
    expect(screen.getByRole('button', { name: 'Já copiei' })).toBeTruthy()
  })

  it('rotacionar o token do Opex: o novo segredo é gravado sozinho e não aparece', async () => {
    data.rotate.mockResolvedValueOnce({ token: { id: 'tk_new', prefix: 'eng.tk_new' }, secret: null, own: 'admin', savedOwn: true })
    mount()
    fireEvent.click(screen.getAllByRole('button', { name: 'Rotacionar token' })[0]!)
    expect(screen.getByText(/gravado sozinho na integração/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rotacionar' }))
    expect((await screen.findByTestId('rotate-result')).textContent).toContain('eng.tk_new em uso')
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy()
  })

  it('detalhe do agente: tokens dele e as memórias gravadas (adoção)', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir o app opex' }))
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Agentes/ }))
    fireEvent.click(screen.getByRole('tab', { name: /Agentes/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir o agente opex/desenvolvedor' }))
    expect(screen.getByTestId('agent-detail-opex/desenvolvedor')).toBeTruthy()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Memórias gravadas' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Memórias gravadas' }))
    await waitFor(() => expect(screen.getByTestId('activity-7d').textContent).toContain('2'))
  })
})

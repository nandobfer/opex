/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { framerMotionMock } from '../../helpers/framer-motion'
import { xyflowMock } from '../../helpers/xyflow'

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@xyflow/react', () => xyflowMock())
// OPE-116: o universo vem da lib dentro do `OpexEngramindProvider`, que usa o roteador do Next.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
const net = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/api', () => ({
  api: net,
  unwrapApi: (response: { data: unknown }) => response.data,
  apiErrorCode: () => null,
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}))
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: () => false, acquireChannel: vi.fn(), releaseChannel: vi.fn() }))

import { DeveloperMemoriesSection } from '@/features/agentic/components/DeveloperMemoriesSection'

const CENTRAL = 'c0000000000000000000000a'
const mount = (centralId?: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DeveloperMemoriesSection centralId={centralId} />
    </QueryClientProvider>,
  )

const META = {
  textMin: 3,
  textMax: 4000,
  categories: [{ key: 'PROJECT_RULES', label: 'Regras do projeto' }],
  migrationPending: false,
  availability: { unavailable: false, reason: null, lastOkAt: null },
  outside: [],
  autonomy: { desenvolvedor: true },
}

const now = new Date().toISOString()
const channel = (slug: string) => ({ id: `ch_${slug}`, slug, name: slug, description: null, priority: 0, version: 1, created_at: now, archived_at: null, created_by: null })
const memory = (id: string, slug: string) => ({
  id, channel: slug, channel_id: `ch_${slug}`, title: `Título ${id}`, title_state: 'ready', text: `Texto ${id}`, category: 'PROJECT_RULES', status: 'active', version: 1,
  author: { app: 'opex', app_id: 'app_opex', agent: 'opex/desenvolvedor', agent_id: 'ag_dev' }, embedding_state: 'ready', retrieval_count: 1, injected_count: 0, last_retrieved_at: null, verified_at: null, stale_candidate: false,
  created_at: now, updated_at: now, archived_at: null,
})
const OTHER = 'c0000000000000000000000b'
const SLUGS = ['opex', 'agentes/desenvolvedor/global', `agentes/desenvolvedor/central/${CENTRAL}`, `agentes/desenvolvedor/central/${OTHER}`]
/** Respostas do proxy `/api/engramind/**` (o mesmo formato da API do Engramind). */
const ENGRAMIND: Record<string, unknown> = {
  whoami: { token_id: 'tk_admin', kind: 'admin', scopes: ['read', 'write', 'delete'], app: null, agent: null, operations: [] },
  channels: { channels: SLUGS.map(channel), next_cursor: null },
  agents: { agents: [{ id: 'ag_dev', slug: 'desenvolvedor', qualified_slug: 'opex/desenvolvedor', name: 'Agente desenvolvedor', description: null, app: { id: 'app_opex', slug: 'opex' }, created_at: now, disabled_at: null }], next_cursor: null },
  subscriptions: {
    subscriptions: [
      { id: 's1', agent: { id: 'ag_dev', slug: 'desenvolvedor', qualified_slug: 'opex/desenvolvedor' }, target: 'opex', is_prefix: false, mode: 'inject', access: null, priority: null, reaches: ['opex'], created_at: now },
      { id: 's2', agent: { id: 'ag_dev', slug: 'desenvolvedor', qualified_slug: 'opex/desenvolvedor' }, target: 'agentes/desenvolvedor/*', is_prefix: true, mode: 'inject', access: null, priority: null, reaches: SLUGS.slice(1), created_at: now },
    ],
    next_cursor: null,
  },
  memories: { memories: [memory('m_opex', SLUGS[0]), memory('m_global', SLUGS[1]), memory('m_central', SLUGS[2]), memory('m_other', SLUGS[3])], next_cursor: null },
  apps: { apps: [], next_cursor: null },
  settings: { settings: [] },
  categories: { categories: [{ key: 'PROJECT_RULES', label: 'Regras', priority: 1 }] },
  'agent-activity': [],
  'universe-layout': null,
}

beforeEach(() => {
  vi.clearAllMocks()
  net.get.mockImplementation(async (url: string) => {
    if (url === '/ai/memories/meta') return { data: { data: META } }
    if (url.startsWith('/engramind/')) return { data: { data: ENGRAMIND[url.slice('/engramind/'.length)] ?? null } }
    return { data: { data: [] } }
  })
})
afterEach(cleanup)

describe('memórias do agente desenvolvedor (tela, critério aprovado OPE-148: um card só)', () => {
  it('na central: o universo do desenvolvedor só com Memórias do Opex, globais e as da central', async () => {
    mount(CENTRAL)
    await waitFor(() => expect(screen.getByTestId('memory-node-m_central')).toBeTruthy())
    expect(screen.getAllByTestId('agent-universe-card')).toHaveLength(1)
    expect(screen.getByTestId('memory-node-m_opex')).toBeTruthy()
    expect(screen.getByTestId('memory-node-m_global')).toBeTruthy()
    expect(screen.queryByTestId('memory-node-m_other')).toBeNull()
    // A rede preenche a altura disponível da página.
    expect(screen.getByTestId('network-canvas').getAttribute('data-fill')).toBe('true')
  })

  it('sem central (aba Desenvolvimento agêntico): todas as memórias do agente, inclusive as das centrais', async () => {
    mount()
    await waitFor(() => expect(screen.getByTestId('memory-node-m_other')).toBeTruthy())
    expect(screen.getAllByTestId('agent-universe-card')).toHaveLength(1)
    expect(screen.getByTestId('memory-node-m_central')).toBeTruthy()
    expect(net.get.mock.calls.some((call) => String(call[0]).startsWith('/ai/agents/'))).toBe(false)
  })
})

/** @vitest-environment happy-dom */

import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import { fitBounds, flowItems, flowState, setCenter, xyflowMock } from '../../helpers/xyflow'
import { MOBILE_MEDIA_QUERY } from '@/hooks/useMediaQuery'

/**
 * OPE-109: rede do Engramind em `/engramind` (visão inicial, universos, card, busca e consumo ao vivo).
 * OPE-113: card só por clique, links roxos/verdes, partícula de criação, busca automática e filtros no
 * padrão de `/tarefas`.
 */

const motionPrefs = vi.hoisted(() => ({ reduced: true }))
vi.mock('framer-motion', () => ({ ...framerMotionMock(), useReducedMotion: () => motionPrefs.reduced }))
vi.mock('@xyflow/react', () => xyflowMock())
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push, replace: nav.replace }), usePathname: () => '/engramind', useSearchParams: () => nav.params }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
const net = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/api', () => ({
  api: net,
  unwrapApi: (response: { data: unknown }) => response.data,
  apiErrorCode: (error: unknown) => (error as { code?: string } | null)?.code ?? null,
  apiErrorMessage: (error: unknown, fallback?: string) => (error as { message?: string })?.message ?? fallback ?? 'erro',
}))
const pusher = vi.hoisted(() => ({ handlers: new Map<string, ((payload: unknown) => void)[]>() }))
vi.mock('@/lib/pusher/client', () => ({
  isPusherClientAvailable: () => true,
  acquireChannel: () => ({
    bind: (event: string, handler: (payload: unknown) => void) => pusher.handlers.set(event, [...(pusher.handlers.get(event) ?? []), handler]),
    unbind: (event: string, handler: (payload: unknown) => void) => pusher.handlers.set(event, (pusher.handlers.get(event) ?? []).filter((item) => item !== handler)),
  }),
  releaseChannel: vi.fn(),
}))

import { EngramindNetwork } from '@/features/engramind/components/network/EngramindNetwork'
import { NETWORK_FLOW_THEME } from '@/features/engramind/components/network/layout-classes'
import { MEMORY_CARD_HEIGHT, MEMORY_CARD_WIDTH } from '@/features/engramind/components/network/MemoryCardLayer'
import { ORBIT_STROKE_WIDTH } from '@/features/engramind/components/network/edges'
import { channelColors, PRIMARY_CHANNEL_COLOR } from '@/features/engramind/network/network-math'

const now = new Date().toISOString()
const ref = (id: string, slug: string) => ({ id, slug })
const channels = [
  { id: 'ch_1', slug: 'opex', name: 'Opex', description: null, priority: 0, version: 1, created_at: now, archived_at: null },
  { id: 'ch_2', slug: 'agentes/opex/global', name: 'Global', description: null, priority: 0, version: 1, created_at: now, archived_at: null },
  { id: 'ch_3', slug: 'agentes/opex/velho', name: 'Velho', description: null, priority: 0, version: 1, created_at: now, archived_at: now },
]
const agents = [
  { id: 'ag_1', slug: 'opex', qualified_slug: 'opex/opex', name: 'Agente Opex', description: null, app: ref('app_1', 'opex'), created_at: now, disabled_at: null },
  { id: 'ag_2', slug: 'bot', qualified_slug: 'outro/bot', name: 'Agente Externo', description: null, app: ref('app_2', 'outro'), created_at: now, disabled_at: null },
  { id: 'ag_3', slug: 'off', qualified_slug: 'outro/off', name: 'Desligado', description: null, app: ref('app_2', 'outro'), created_at: now, disabled_at: now },
]
const apps = [
  { id: 'app_1', slug: 'opex', name: 'Opex', description: null, created_at: now, disabled_at: null, webhook: null },
  { id: 'app_2', slug: 'outro', name: 'Outro', description: null, created_at: now, disabled_at: null, webhook: null },
]
const subscriptions = [
  { id: 's1', agent: { ...ref('ag_1', 'opex'), qualified_slug: 'opex/opex' }, target: 'agentes/opex/*', is_prefix: true, mode: 'inject', access: null, priority: null, reaches: ['agentes/opex/global'], created_at: now },
  { id: 's2', agent: { ...ref('ag_1', 'opex'), qualified_slug: 'opex/opex' }, target: 'opex', is_prefix: false, mode: 'inject', access: null, priority: null, reaches: ['opex'], created_at: now },
  { id: 's3', agent: { ...ref('ag_2', 'bot'), qualified_slug: 'outro/bot' }, target: 'opex', is_prefix: false, mode: 'search', access: null, priority: null, reaches: ['opex'], created_at: now },
]
const memory = (id: string, channel: string, extra: Record<string, unknown> = {}) => ({
  id, channel, channel_id: 'ch', title: `Título ${id}`, title_state: 'ready', text: `Texto ${id}`, category: 'PROJECT_RULES', status: 'active', version: 2,
  author: { app: 'opex', app_id: 'app_1', agent: 'opex/opex', agent_id: 'ag_1' }, embedding_state: 'ready', retrieval_count: 1, injected_count: 2, last_retrieved_at: null, verified_at: null, stale_candidate: false,
  created_at: now, updated_at: now, archived_at: null, ...extra,
})
let memories: ReturnType<typeof memory>[]
let centrals: { id: string; sigla: string; projectName: string; repo: string | null }[] = []
let activity: { agent: string; total: number; last7d: number }[] = []

const respond = (url: string) => {
  if (url === '/engramind/channels') return { channels, next_cursor: null }
  if (url === '/engramind/agents') return { agents, next_cursor: null }
  if (url === '/engramind/apps') return { apps, next_cursor: null }
  if (url === '/engramind/subscriptions') return { subscriptions, next_cursor: null }
  if (url === '/engramind/memories') return { memories, next_cursor: null }
  if (url === '/engramind/settings') return { settings: [{ key: 'consolidation.stale_after_days', value: 30 }, { key: 'categories.list', value: [{ key: 'PROJECT_RULES', label: 'Regras', priority: 1 }] }, { key: 'memory.text_min', value: 3 }, { key: 'memory.text_max', value: 200 }] }
  if (url === '/engramind/memory-usage') return {}
  if (url === '/engramind/agent-activity') return activity.map((row) => ({ lastWriteAt: null, delivery: null, selfMemory: true, stale: false, ...row }))
  if (url === '/agentic/centrals') return centrals
  if (url.startsWith('/engramind/memories/')) return memories.find((item) => item.id === decodeURIComponent(url.slice('/engramind/memories/'.length)))
  return {}
}

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EngramindNetwork onConfigure={vi.fn()} />
    </QueryClientProvider>,
  )
/** Mais que qualquer atraso de fechamento: o card não pode fechar sozinho. */
const WAIT_MS = 400
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** O cartão de filtros começa recolhido (padrão de `/tarefas`). */
const expandFilters = async () => fireEvent.click(await screen.findByRole('button', { name: 'Expandir filtros' }))
/** Abre o card pelo clique (só se ainda não estiver aberto: clicar de novo fecha). */
const openCard = async (id: string) => {
  if (!screen.queryByTestId(`memory-card-${id}`)) fireEvent.click(await screen.findByTestId(`memory-node-${id}`))
  return screen.findByTestId(`memory-card-${id}`)
}
const pickOption = async (trigger: string, option: string) => {
  fireEvent.click(await screen.findByRole('button', { name: trigger }))
  fireEvent.click(await screen.findByText(option, { selector: 'div' }))
}
/** OPE-129: a visão Agentes x canais é a de um app (`?app=`); a inicial é Apps x canais. */
const inApp = (slug: string) => {
  nav.params = new URLSearchParams(`app=${slug}`)
}
const emit = (event: string, payload: unknown) => act(() => (pusher.handlers.get(event) ?? []).forEach((handler) => handler(payload)))

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  motionPrefs.reduced = true
  pusher.handlers.clear()
  nav.params = new URLSearchParams()
  memories = [memory('m_1', 'opex'), memory('m_2', 'agentes/opex/global'), memory('m_3', 'opex', { status: 'archived' })]
  activity = []
  net.get.mockImplementation(async (url: string) => ({ data: { data: respond(url) } }))
})
afterEach(cleanup)

describe('visão inicial', () => {
  it('OPE-117: node do agente do Opex mostra "N gravadas · M acessíveis" (zero explícito); agente de outro app só as acessíveis', async () => {
    inApp('opex')
    mount()
    const opex = await screen.findByTestId('agent-counts-opex/opex')
    await waitFor(() => expect(opex.textContent).toBe('0 gravadas · 2 acessíveis'))
    expect(screen.getByTestId('agent-node-opex/opex').className).toContain('w-[11.25rem]')
    cleanup()
    inApp('outro')
    mount()
    expect((await screen.findByTestId('agent-counts-outro/bot')).textContent).toBe('1 acessível')
    expect(screen.queryByTestId('agent-written-outro/bot')).toBeNull()
  })

  it('OPE-117: a contagem de gravadas atualiza depois do engramind-updated (memória criada) e o tooltip traz os 7 dias', async () => {
    inApp('opex')
    mount()
    await waitFor(() => expect(screen.getByTestId('agent-counts-opex/opex').textContent).toContain('0 gravadas'))
    activity = [{ agent: 'opex', total: 4, last7d: 1 }]
    emit('engramind-updated', { type: 'memory.created', channel: 'opex' })
    await waitFor(() => expect(screen.getByTestId('agent-counts-opex/opex').textContent).toContain('4 gravadas'))
    expect(screen.getByTestId('agent-written-opex/opex').getAttribute('title')).toBe('1 nos últimos 7 dias')
  })

  it('visão do app: agentes ativos do app sem o prefixo "Agente", canais ativos e um link por canal casado', async () => {
    inApp('opex')
    mount()
    expect((await screen.findByTestId('agent-node-opex/opex')).textContent).toContain('Opex')
    expect(screen.getByTestId('agent-node-opex/opex').textContent).not.toContain('Agente')
    expect(screen.queryByTestId('agent-node-outro/bot')).toBeNull()
    expect(screen.getByTestId('channel-node-opex')).toBeTruthy()
    expect(screen.queryByTestId('channel-node-agentes/opex/velho')).toBeNull()
    expect(screen.getByTestId('edge-opex/opex→agentes/opex/global')).toBeTruthy()
    expect(screen.getByTestId('stat-agents').textContent).toBe('1')
    expect(screen.getByTestId('stat-active').textContent).toBe('2')
    expect(screen.getByTestId('stat-inactive').textContent).toBe('1')
    cleanup()
    inApp('outro')
    mount()
    expect((await screen.findByTestId('agent-node-outro/bot')).textContent).toContain('Externo')
    expect(screen.queryByTestId('agent-node-outro/off')).toBeNull()
    expect(screen.getByTestId('edge-outro/bot→opex')).toBeTruthy()
    expect(screen.queryByTestId('channel-node-agentes/opex/global')).toBeNull()
  })

  it('nome do canal: prefixo discreto em cima e a ponta final como título; o slug inteiro no hover', async () => {
    mount()
    const node = await screen.findByTestId('channel-node-agentes/opex/global')
    const name = within(node).getByTestId('channel-name-agentes/opex/global')
    expect(within(name).getByTestId('channel-name-prefix').textContent).toBe('agentes/opex/')
    expect(within(name).getByTestId('channel-name-title').textContent).toBe('global')
    expect(name.getAttribute('title')).toBe('agentes/opex/global')
    // Canal sem barra: só o título.
    const plain = within(screen.getByTestId('channel-node-opex')).getByTestId('channel-name-opex')
    expect(within(plain).queryByTestId('channel-name-prefix')).toBeNull()
    expect(within(plain).getByTestId('channel-name-title').textContent).toBe('opex')
  })

  it('canal de central: a sigla do repositório é o título e o nome do repositório fica na dica', async () => {
    const slug = 'agentes/desenvolvedor/central/c1'
    channels.push({ id: 'ch_9', slug, name: 'Central', description: null, priority: 0, version: 1, created_at: now, archived_at: null })
    centrals = [{ id: 'c1', sigla: 'OPE', projectName: 'Opex', repo: 'nandobfer/opex' }]
    memories = [...memories, memory('m_c1', slug)]
    try {
      mount()
      const node = await screen.findByTestId(`channel-node-${slug}`)
      await waitFor(() => expect(within(node).getByTestId('channel-name-title').textContent).toBe('OPE'))
      const title = within(node).getByTestId('channel-name-title')
      expect(title.getAttribute('data-hint')).toBe('Opex · nandobfer/opex')
      expect(within(node).getByTestId('channel-name-prefix').textContent).toBe('agentes/desenvolvedor/central/')
    } finally {
      channels.pop()
      centrals = []
    }
  })

  it('universo do canal: o centro mostra o prefixo e a ponta final', async () => {
    nav.params = new URLSearchParams('universo=canal:agentes/opex/global')
    mount()
    const center = await screen.findByTestId('universe-center')
    expect(within(center).getByTestId('channel-name-title').textContent).toBe('global')
    expect(within(center).getByTestId('channel-name-prefix').textContent).toBe('agentes/opex/')
  })

  it('visão horizontal: enquadra a linha de agentes com folga (fitBounds) e o Centralizar volta a ela', async () => {
    inApp('opex')
    fitBounds.calls.length = 0
    mount()
    await screen.findByTestId('agent-node-opex/opex')
    await waitFor(() => expect(fitBounds.calls.length).toBeGreaterThan(0))
    const first = fitBounds.calls[0] as { x: number; width: number; height: number }
    expect(first.width).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Centralizar/ }))
    expect(fitBounds.calls.at(-1)).toEqual(first)
  })

  it('fundo no padrão do tema: canvas bg-background e React Flow transparente com pontos por token', async () => {
    inApp('opex')
    mount()
    await screen.findByTestId('agent-node-opex/opex')
    const canvas = screen.getByTestId('network-canvas')
    expect(canvas.classList.contains('bg-background')).toBe(true)
    expect(canvas.classList.contains('bg-card')).toBe(false)
    const style = JSON.parse(screen.getByTestId('react-flow').getAttribute('data-style')!)
    expect(style).toEqual(NETWORK_FLOW_THEME)
    expect(style['--xy-background-color']).toBe('transparent')
    expect(style['--xy-background-pattern-color']).toContain('var(--muted-foreground)')
  })

  it('o modo da assinatura aparece no hover do link', async () => {
    inApp('outro')
    mount()
    fireEvent.mouseEnter(await screen.findByTestId('link-outro/bot→opex'))
    expect(screen.getByRole('tooltip').textContent).toContain('search')
  })

  it('OPE-129: o filtro "Apps" saiu; dentro do app, Mostrar arquivados exibe o canal arquivado (com memória) apagado', async () => {
    memories = [...memories, memory('m_v', 'agentes/opex/velho')]
    inApp('opex')
    mount()
    await screen.findByTestId('agent-node-opex/opex')
    expect(screen.queryByRole('button', { name: 'Filtrar agentes por app' })).toBeNull()
    expect(screen.queryByTestId('app-filter')).toBeNull()
    expect(screen.queryByTestId('channel-node-agentes/opex/velho')).toBeNull()
    await expandFilters()
    fireEvent.click(screen.getByLabelText('Mostrar arquivados'))
    const archived = await screen.findByTestId('channel-node-agentes/opex/velho')
    expect(archived.getAttribute('data-archived')).toBe('true')
    expect(screen.getByTestId('edge-opex/opex→agentes/opex/velho')).toBeTruthy()
  })

  it('clicar num canal ou agente abre o universo pelo endereço (mantendo o app aberto)', async () => {
    inApp('opex')
    mount()
    fireEvent.click(await screen.findByTestId('channel-node-opex'))
    expect(nav.push).toHaveBeenCalledWith('/engramind?app=opex&universo=canal%3Aopex', { scroll: false })
    fireEvent.click(screen.getByTestId('agent-node-opex/opex'))
    expect(nav.push).toHaveBeenCalledWith('/engramind?app=opex&universo=agente%3Aopex%2Fopex', { scroll: false })
  })

  it('consumo ao vivo de um agente conta na estatística; agente desconhecido é ignorado', async () => {
    inApp('opex')
    mount()
    await screen.findByTestId('agent-node-opex/opex')
    emit('engramind-consumption', { agent: 'opex/opex', kind: 'context', channels: ['opex'], delivered: ['opex'], memoryIds: ['m_1'] })
    emit('engramind-consumption', { agent: 'x/y', kind: 'context', channels: ['opex'], delivered: ['opex'], memoryIds: ['m_1'] })
    expect(screen.getByTestId('stat-live').getAttribute('data-value')).toBe('1')
  })
})

describe('universos', () => {
  it('regressão: Esc com o foco dentro do card da memória volta à visão inicial; num diálogo modal, não', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    const card = await openCard('m_1')
    const pin = within(card).getByRole('button', { name: 'Fixar' })
    pin.focus()
    fireEvent.keyDown(pin, { key: 'Escape' })
    expect(nav.push).toHaveBeenCalledWith('/engramind', { scroll: false })
    nav.push.mockClear()
    fireEvent.click(within(card).getByRole('button', { name: 'Excluir' }))
    const confirm = await screen.findByRole('alertdialog')
    fireEvent.keyDown(within(confirm).getAllByRole('button')[0]!, { key: 'Escape' })
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('universo do canal: centro, uma partícula por memória (inativa inclusive), trilha e Esc volta', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    expect((await screen.findByTestId('universe-center')).textContent).toContain('opex')
    expect(screen.getByTestId('breadcrumb-current').textContent).toBe('Canal opex')
    expect(screen.getByTestId('memory-node-m_1')).toBeTruthy()
    expect(screen.getByTestId('memory-node-m_3').getAttribute('data-archived')).toBe('true')
    expect(screen.queryByTestId('memory-node-m_2')).toBeNull()
    expect(screen.getByTestId('stat-subscribers').textContent).toBe('2')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(nav.push).toHaveBeenCalledWith('/engramind', { scroll: false })
  })

  it('endereço com canal inexistente volta à visão inicial com toast', async () => {
    nav.params = new URLSearchParams('universo=canal:nao-existe')
    mount()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Canal não encontrado: voltando à rede.'))
    // Regressão: substitui o endereço inválido no histórico (o voltar do navegador não volta a ele).
    expect(nav.replace).toHaveBeenCalledWith('/engramind', { scroll: false })
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('regressão: a cor de um canal no universo do agente vem do mapa de todos os canais, e o maior fica roxo', async () => {
    nav.params = new URLSearchParams('universo=agente:opex/opex')
    mount()
    await screen.findByTestId('memory-node-m_1')
    const all = channelColors(channels.map((item) => item.slug))
    const legend = screen.getByTestId('channel-legend')
    const styles = [...legend.querySelectorAll('span[aria-hidden]')].map((dot) => dot.getAttribute('style') ?? '').join(' | ')
    // `opex` tem 2 memórias (uma inativa) e `agentes/opex/global` tem 1: o roxo primário vai para `opex`.
    expect(styles).toContain(PRIMARY_CHANNEL_COLOR)
    expect(styles).toContain(all.get('agentes/opex/global')!)
    expect(styles).not.toContain(all.get('opex')!)
  })

  it('OPE-114: no universo do agente cada partícula tem a cor do canal dela', async () => {
    nav.params = new URLSearchParams('universo=agente:opex/opex')
    mount()
    const particle = (id: string) => (screen.getByTestId(`memory-node-${id}`).querySelector('span[aria-label]') as HTMLElement).getAttribute('style') ?? ''
    await screen.findByTestId('memory-node-m_1')
    const all = channelColors(channels.map((item) => item.slug))
    expect(particle('m_1')).toContain(PRIMARY_CHANNEL_COLOR)
    expect(particle('m_2')).toContain(all.get('agentes/opex/global')!)
    expect(particle('m_2')).not.toContain(PRIMARY_CHANNEL_COLOR)
  })

  it('OPE-114: no universo do canal as partículas usam o roxo primário', async () => {
    nav.params = new URLSearchParams('universo=canal:agentes/opex/global')
    mount()
    const node = await screen.findByTestId('memory-node-m_2')
    expect((node.querySelector('span[aria-label]') as HTMLElement).getAttribute('style') ?? '').toContain(PRIMARY_CHANNEL_COLOR)
  })

  it('universo do agente: memórias de todos os canais assinados e a legenda por canal', async () => {
    nav.params = new URLSearchParams('universo=agente:opex/opex')
    mount()
    expect(await screen.findByTestId('memory-node-m_1')).toBeTruthy()
    expect(screen.getByTestId('memory-node-m_2')).toBeTruthy()
    const legend = screen.getByTestId('channel-legend')
    expect(legend.textContent).toContain('opex')
    expect(legend.textContent).toContain('agentes/opex/global')
    expect(screen.getByTestId('breadcrumb-current').textContent).toBe('Agente Opex')
  })

  it('card da memória: campos, Excluir pede confirmação, Ativa desativa e Editar envia a versão lida', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    net.post.mockResolvedValue({ data: { data: {} } })
    net.delete.mockResolvedValue({ data: { data: {} } })
    net.patch.mockRejectedValueOnce(new Error('Esta memória mudou enquanto você editava. Confira a versão atual.'))
    mount()
    const card = await openCard('m_1')
    expect(card.textContent).toContain('Título m_1')
    expect(within(card).getByTestId('memory-card-uses').textContent).toContain('3 usos')
    fireEvent.click(within(card).getByRole('checkbox', { name: 'Ativa' }))
    await waitFor(() => expect(net.post).toHaveBeenCalledWith('/engramind/memories/m_1/archive', {}))
    fireEvent.click(within(card).getByRole('button', { name: 'Excluir' }))
    expect(net.delete).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir de vez' }))
    await waitFor(() => expect(net.delete).toHaveBeenCalledWith('/engramind/memories/m_1'))
    fireEvent.click(within(await openCard('m_1')).getByRole('button', { name: 'Editar' }))
    fireEvent.change(await screen.findByLabelText('Texto da memória'), { target: { value: 'Texto novo' } })
    await waitFor(() => expect((screen.getByRole('button', { name: /Salvar/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(net.patch).toHaveBeenCalledWith('/engramind/memories/m_1', { text: 'Texto novo', category: 'PROJECT_RULES', expected_version: 2 }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Esta memória mudou enquanto você editava. Confira a versão atual.'))
    expect((screen.getByLabelText('Texto da memória') as HTMLTextAreaElement).value).toBe('Texto novo')
  })

  it('OPE-113: passar o mouse não abre o card; só afasta as vizinhas e aumenta levemente a partícula', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    const node = await screen.findByTestId('memory-node-m_1')
    fireEvent.pointerEnter(node)
    await sleep(WAIT_MS)
    expect(screen.queryByTestId('memory-card-m_1')).toBeNull()
    expect(node.getAttribute('data-expanded')).toBeNull()
    expect(screen.getByTestId('memory-node-m_1').getAttribute('data-focused')).toBe('true')
    fireEvent.pointerLeave(screen.getByTestId('memory-node-m_1'))
    await waitFor(() => expect(screen.getByTestId('memory-node-m_1').getAttribute('data-focused')).toBeNull())
    expect(screen.queryByTestId('memory-card-m_1')).toBeNull()
  })

  it('OPE-113: clique abre o card; clicar de novo fecha; clicar fora fecha; clicar em outra troca (um card só)', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    fireEvent.click(await screen.findByTestId('memory-node-m_1'))
    expect(await screen.findByTestId('memory-card-m_1')).toBeTruthy()
    // Tirar o mouse não fecha o card aberto pelo clique.
    fireEvent.pointerLeave(screen.getByTestId('memory-node-m_1'))
    fireEvent.pointerLeave(screen.getByTestId('memory-card-m_1'))
    await sleep(WAIT_MS)
    expect(screen.getByTestId('memory-card-m_1')).toBeTruthy()
    fireEvent.click(screen.getByTestId('memory-node-m_1'))
    await waitFor(() => expect(screen.queryByTestId('memory-card-m_1')).toBeNull())
    fireEvent.click(screen.getByTestId('memory-node-m_1'))
    await screen.findByTestId('memory-card-m_1')
    fireEvent.click(screen.getByTestId('memory-node-m_3'))
    await screen.findByTestId('memory-card-m_3')
    expect(screen.queryByTestId('memory-card-m_1')).toBeNull()
    fireEvent.click(screen.getByTestId('react-flow-pane'))
    await waitFor(() => expect(screen.queryByTestId('memory-card-m_3')).toBeNull())
  })

  it('OPE-113: com um card aberto, passar o mouse em outra partícula não abre card nem tira o foco da aberta', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    await openCard('m_1')
    fireEvent.pointerEnter(screen.getByTestId('memory-node-m_3'))
    await sleep(50)
    expect(screen.queryByTestId('memory-card-m_3')).toBeNull()
    expect(screen.getByTestId('memory-node-m_3').getAttribute('data-focused')).toBeNull()
    expect(screen.getByTestId('memory-node-m_1').getAttribute('data-focused')).toBe('true')
  })

  it('a partícula vira o card numa camada fora do zoom: mesmo tamanho com zoom 1 e 2, dentro do quadro', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    const node = await screen.findByTestId('memory-node-m_1')
    fireEvent.click(node)
    const card = await screen.findByTestId('memory-card-m_1')
    // Fora do node (a camada com zoom), irmão do canvas.
    expect(node.contains(card)).toBe(false)
    expect(node.getAttribute('data-expanded')).toBe('true')
    const at = () => ({ classes: screen.getByTestId('memory-card-m_1').className, width: screen.getByTestId('memory-card-m_1').getAttribute('data-card-width') })
    const zoomOne = at()
    expect(zoomOne.width).toBe(String(MEMORY_CARD_WIDTH))
    expect(screen.getByTestId('memory-card-m_1').getAttribute('data-card-height')).toBe(String(MEMORY_CARD_HEIGHT))
    expect(MEMORY_CARD_WIDTH).toBe(MEMORY_CARD_HEIGHT)
    expect(zoomOne.classes).not.toMatch(/\bscale-/)
    cleanup()
    flowState.transform = [0, 0, 2]
    mount()
    fireEvent.click(await screen.findByTestId('memory-node-m_1'))
    await screen.findByTestId('memory-card-m_1')
    expect(at()).toEqual(zoomOne)
    flowState.transform = [0, 0, 1]
  })

  it('zoom afastado demais: o hover só destaca a partícula; o clique aproxima até o zoom do card, centralizado nela', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    flowState.transform = [0, 0, 0.4]
    setCenter.calls = []
    try {
      mount()
      const node = await screen.findByTestId('memory-node-m_1')
      fireEvent.pointerEnter(node)
      expect(screen.queryByTestId('memory-card-m_1')).toBeNull()
      expect(node.getAttribute('data-expanded')).toBeNull()
      expect(screen.getByTestId('memory-node-m_1').getAttribute('data-focused')).toBe('true')
      fireEvent.click(node)
      await waitFor(() => expect(setCenter.calls).toHaveLength(1))
      expect((setCenter.calls[0]!.options as { zoom: number }).zoom).toBe(0.6)
      expect(Math.hypot(setCenter.calls[0]!.x, setCenter.calls[0]!.y)).toBeGreaterThan(0)
    } finally {
      flowState.transform = [0, 0, 1]
    }
  })

  it('memória nova em tempo real entra marcada para nascer (partícula e link); as da primeira carga não', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    expect((await screen.findByTestId('memory-node-m_1')).getAttribute('data-entering')).toBeNull()
    memories = [...memories, memory('m_9', 'opex')]
    emit('engramind-updated', { type: 'memory.created', channel: 'opex' })
    await waitFor(() => expect(screen.getByTestId('memory-node-m_9').getAttribute('data-entering')).toBe('true'))
    expect(screen.getByTestId('memory-node-m_1').getAttribute('data-entering')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('memory-node-m_9').getAttribute('data-entering')).toBeNull(), { timeout: 1500 })
  })

  it('regressão: Ativa é otimista (muda antes da resposta) e volta com toast na falha', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    let reject: (error: unknown) => void = () => undefined
    net.post.mockReturnValueOnce(new Promise((_resolve, fail) => (reject = fail)))
    mount()
    fireEvent.click(await screen.findByTestId('memory-node-m_1'))
    fireEvent.click(within(await screen.findByTestId('memory-card-m_1')).getByRole('checkbox', { name: 'Ativa' }))
    await waitFor(() => expect(screen.getByTestId('memory-node-m_1').getAttribute('data-archived')).toBe('true'))
    await act(async () => reject(new Error('Engramind fora do ar')))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Engramind fora do ar'))
    await waitFor(() => expect(screen.getByTestId('memory-node-m_1').getAttribute('data-archived')).toBeNull())
  })

  it('regressão: depois do conflito de versão, o próximo Salvar envia a versão atual', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    const conflict = Object.assign(new Error('Esta memória mudou enquanto você editava. Confira a versão atual.'), { code: 'MEMORY_VERSION_CONFLICT' })
    net.patch.mockRejectedValueOnce(conflict).mockResolvedValueOnce({ data: { data: {} } })
    mount()
    fireEvent.click(await screen.findByTestId('memory-node-m_1'))
    fireEvent.click(within(await screen.findByTestId('memory-card-m_1')).getByRole('button', { name: 'Editar' }))
    fireEvent.change(await screen.findByLabelText('Texto da memória'), { target: { value: 'Texto novo' } })
    memories = memories.map((item) => (item.id === 'm_1' ? { ...item, version: 5 } : item))
    await waitFor(() => expect((screen.getByRole('button', { name: /Salvar/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(net.patch).toHaveBeenCalledWith('/engramind/memories/m_1', { text: 'Texto novo', category: 'PROJECT_RULES', expected_version: 2 }))
    await waitFor(() => expect(net.get).toHaveBeenCalledWith('/engramind/memories/m_1', expect.anything()))
    await new Promise((resolve) => setTimeout(resolve, 20))
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(net.patch).toHaveBeenLastCalledWith('/engramind/memories/m_1', { text: 'Texto novo', category: 'PROJECT_RULES', expected_version: 5 }))
    await waitFor(() => expect(screen.queryByLabelText('Texto da memória')).toBeNull())
  })

  it('busca automática (sem botão) destaca sem remover: as que casam ficam em destaque e as demais apagadas', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    net.post.mockResolvedValue({ data: { data: { mode: 'text', results: [{ memory: memories[0], rank: 1, score: 1 }] } } })
    mount()
    await screen.findByTestId('memory-node-m_1')
    await expandFilters()
    expect(screen.queryByRole('button', { name: 'Buscar' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Buscar memórias'), { target: { value: 'pnpm' } })
    expect(net.post).not.toHaveBeenCalled()
    await waitFor(() => expect(net.post).toHaveBeenCalledWith('/engramind/memories/search', { query: 'pnpm', channels: ['opex'], include_archived: true, limit: 50 }), { timeout: 2000 })
    await waitFor(() => expect(screen.getByTestId('memory-node-m_1').getAttribute('data-matched')).toBe('true'))
    expect(screen.getByTestId('memory-node-m_3').getAttribute('data-matched')).toBe('false')
    expect(screen.getByText(/Busca só textual/)).toBeTruthy()
  })

  it('consumo ao vivo cresce a partícula consumida; id desconhecido é ignorado', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    const node = await screen.findByTestId('memory-node-m_1')
    const size = () => parseFloat((node.querySelector('span') as HTMLElement).style.width)
    const before = size()
    emit('engramind-consumption', { agent: 'opex/opex', kind: 'context', channels: ['opex'], delivered: ['opex'], memoryIds: ['m_1', 'm_nao_carregada'] })
    await waitFor(() => expect(size()).toBeGreaterThan(before))
    expect(screen.queryByTestId('memory-node-m_nao_carregada')).toBeNull()
    expect(screen.getByTestId('stat-live').textContent).toBe('1')
  })

  it('regressão: memória candidata a esquecimento consumida ao vivo volta ao brilho cheio antes da releitura', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    memories = [memory('m_1', 'opex', { stale_candidate: true }), memory('m_2', 'opex')]
    mount()
    const node = await screen.findByTestId('memory-node-m_1')
    expect(node.getAttribute('data-brightness')).toBe('0')
    emit('engramind-consumption', { agent: 'opex/opex', kind: 'context', channels: ['opex'], delivered: ['opex'], memoryIds: ['m_1'] })
    await waitFor(() => expect(screen.getByTestId('memory-node-m_1').getAttribute('data-brightness')).toBe('1'))
  })

  it('memória aberta excluída por outra origem: o card fecha com aviso e a partícula sai', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    fireEvent.click(await screen.findByTestId('memory-node-m_1'))
    expect(await screen.findByTestId('memory-card-m_1')).toBeTruthy()
    memories = memories.filter((item) => item.id !== 'm_1')
    emit('engramind-updated', { type: 'memory.deleted', channel: 'opex' })
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('A memória aberta foi excluída ou movida por outra origem.'))
    await waitFor(() => expect(screen.queryByTestId('memory-card-m_1')).toBeNull())
    await waitFor(() => expect(screen.queryByTestId('memory-node-m_1')).toBeNull())
  })

  it('regressão: Excluir cancelado não marca a memória; se outra origem a exclui depois, o aviso aparece', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    fireEvent.click(await screen.findByTestId('memory-node-m_1'))
    const card = await screen.findByTestId('memory-card-m_1')
    fireEvent.click(within(card).getByRole('button', { name: 'Excluir' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(net.delete).not.toHaveBeenCalled()
    memories = memories.filter((item) => item.id !== 'm_1')
    emit('engramind-updated', { type: 'memory.deleted', channel: 'opex' })
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('A memória aberta foi excluída ou movida por outra origem.'))
  })

  it('exclusão confirmada aqui não mostra o aviso de outra origem', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    net.delete.mockResolvedValue({ data: { data: {} } })
    mount()
    fireEvent.click(await screen.findByTestId('memory-node-m_1'))
    fireEvent.click(within(await screen.findByTestId('memory-card-m_1')).getByRole('button', { name: 'Excluir' }))
    memories = memories.filter((item) => item.id !== 'm_1')
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir de vez' }))
    await waitFor(() => expect(net.delete).toHaveBeenCalledWith('/engramind/memories/m_1'))
    await waitFor(() => expect(screen.queryByTestId('memory-node-m_1')).toBeNull())
    expect(toast.info).not.toHaveBeenCalledWith('A memória aberta foi excluída ou movida por outra origem.')
  })

  it('canal sem memórias mostra o estado vazio com Nova memória', async () => {
    memories = []
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    expect((await screen.findByTestId('universe-empty')).textContent).toContain('Nenhuma memória neste universo')
    expect(screen.getByRole('button', { name: /Nova memória/ })).toBeTruthy()
  })
})

describe('celular', () => {
  const realMatchMedia = window.matchMedia
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query === MOBILE_MEDIA_QUERY, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }),
    })
    setCenter.calls = []
    fitBounds.calls = []
  })
  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: realMatchMedia })
    flowState.width = 800
    flowState.height = 600
    flowState.transform = [0, 0, 1]
  })

  it('o card de estatísticas começa recolhido com o resumo, abre e recolhe', async () => {
    inApp('opex')
    mount()
    const toggle = await screen.findByTestId('network-stats-toggle')
    expect(toggle.textContent).toMatch(/agentes? · \d+ cana(l|is)/)
    expect(screen.queryByTestId('network-stats')).toBeNull()
    fireEvent.click(toggle)
    expect(await screen.findByTestId('network-stats')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Recolher estatísticas' }))
    await waitFor(() => expect(screen.queryByTestId('network-stats')).toBeNull())
    expect(screen.getByTestId('network-stats-toggle')).toBeTruthy()
  })

  it('universo: o resumo recolhido mostra quantas memórias', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    expect((await screen.findByTestId('network-stats-toggle')).textContent).toContain('2 memórias')
  })

  it('barra compacta: filtros na gaveta, com quantos estão ativos', async () => {
    mount()
    const toolbar = await screen.findByTestId('network-toolbar')
    expect(toolbar.hasAttribute('data-mobile')).toBe(true)
    expect(screen.queryByLabelText('Filtrar por autor')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Buscar' })).toBeNull()
    // OPE-113: Importar e Novo canal (só ícone) na linha do Voltar, não na barra da busca.
    const trail = screen.getByTestId('network-breadcrumb')
    expect(within(trail).getByRole('button', { name: 'Novo canal' })).toBeTruthy()
    expect(within(trail).getByRole('button', { name: 'Importar' })).toBeTruthy()
    expect(within(toolbar).queryByRole('button', { name: 'Novo canal' })).toBeNull()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Filtros' }))
    expect(await screen.findByText('Filtros da rede')).toBeTruthy()
    const fields = screen.getByTestId('network-filters-sheet-fields')
    for (const label of ['Filtrar por canal', 'Filtrar por categoria', 'Filtrar por status', 'Filtrar por autor', 'Mostrar arquivados']) expect(within(fields).getByLabelText(label)).toBeTruthy()
    await pickOption('Filtrar por autor', 'opex/opex')
    await waitFor(() => expect(screen.getByTestId('network-filter-count').textContent).toBe('1'))
    expect(within(toolbar).getByRole('button', { name: 'Filtros (1 ativo)', hidden: true })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar', hidden: true }))
    await waitFor(() => expect(screen.queryByTestId('network-filter-count')).toBeNull())
  })

  it('visão inicial: quadro estreito demais enquadra com zoom mínimo legível, centralizado nos agentes', async () => {
    flowState.width = 200
    mount()
    await waitFor(() => expect(setCenter.calls.length).toBeGreaterThan(0))
    expect((setCenter.calls.at(-1)!.options as { zoom: number }).zoom).toBe(0.5)
    expect(fitBounds.calls).toHaveLength(0)
  })

  it('visão inicial: quando cabe com zoom legível, enquadra como no computador', async () => {
    flowState.width = 2000
    flowState.height = 1200
    mount()
    await waitFor(() => expect(fitBounds.calls.length).toBeGreaterThan(0))
    expect(setCenter.calls).toHaveLength(0)
  })

  it('toque: o "passar o mouse" do toque não abre nem fecha; o toque (clique) fixa o card', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    const node = await screen.findByTestId('memory-node-m_1')
    fireEvent.pointerEnter(node, { pointerType: 'touch' })
    expect(screen.queryByTestId('memory-card-m_1')).toBeNull()
    fireEvent.click(node)
    const card = await screen.findByTestId('memory-card-m_1')
    fireEvent.pointerLeave(node, { pointerType: 'touch' })
    fireEvent.pointerLeave(card, { pointerType: 'touch' })
    await sleep(WAIT_MS)
    expect(screen.getByTestId('memory-card-m_1')).toBeTruthy()
    fireEvent.click(screen.getByTestId('react-flow-pane'))
    await waitFor(() => expect(screen.queryByTestId('memory-card-m_1')).toBeNull())
  })

  it('o card fica dentro do quadro baixo e estreito: altura e largura limitadas, o texto rola dentro', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    flowState.width = 240
    flowState.height = 200
    mount()
    fireEvent.click(await screen.findByTestId('memory-node-m_1'))
    const card = await screen.findByTestId('memory-card-m_1')
    expect(Number(card.getAttribute('data-card-height'))).toBeLessThanOrEqual(200 - 16)
    expect(Number(card.getAttribute('data-card-width'))).toBeLessThanOrEqual(240 - 16)
    expect(within(card).getByTestId('memory-card-text').className).toContain('overflow-y-auto')
  })

  it('toque no link mostra o modo da assinatura por um instante', async () => {
    inApp('outro')
    mount()
    fireEvent.pointerDown(await screen.findByTestId('link-outro/bot→opex'), { pointerType: 'touch' })
    expect(screen.getByRole('tooltip').textContent).toContain('search')
  })
})

describe('OPE-113', () => {
  const ownerMemory = (id: string, channel: string) => memory(id, channel, { author: { app: 'opex', app_id: 'app_1', agent: null, agent_id: null } })
  const travelDots = () => screen.queryAllByTestId('travel-dot').map((dot) => ({ edge: dot.getAttribute('data-edge'), tone: dot.querySelector('circle')?.getAttribute('data-tone') }))

  it('links ao centro no universo do agente: cor do canal; a memória escrita pelo agente do centro tem o link destacado', async () => {
    memories = [memory('m_1', 'opex'), ownerMemory('m_2', 'agentes/opex/global'), memory('m_4', 'opex', { author: { app: 'outro', app_id: 'app_2', agent: 'outro/bot', agent_id: 'ag_2' } })]
    nav.params = new URLSearchParams('universo=agente:opex/opex')
    mount()
    await screen.findByTestId('memory-node-m_1')
    const all = channelColors(channels.map((item) => item.slug))
    const edge = (id: string) => screen.getByTestId(`edge-orbit:${id}`)
    // `opex` tem mais memórias neste universo: o roxo primário do canal em destaque (OPE-114).
    expect(edge('m_1').getAttribute('data-stroke')).toBe(PRIMARY_CHANNEL_COLOR)
    expect(edge('m_2').getAttribute('data-stroke')).toBe(all.get('agentes/opex/global'))
    expect(edge('m_4').getAttribute('data-stroke')).toBe(PRIMARY_CHANNEL_COLOR)
    expect(edge('m_1').getAttribute('data-authored')).toBe('true')
    expect(edge('m_1').getAttribute('data-stroke-width')).toBe(String(ORBIT_STROKE_WIDTH.authored))
    for (const id of ['m_2', 'm_4']) {
      expect(edge(id).getAttribute('data-authored')).toBeNull()
      expect(edge(id).getAttribute('data-stroke-width')).toBe(String(ORBIT_STROKE_WIDTH.normal))
    }
    expect(screen.getByTestId('authored-link-legend').textContent).toContain('Link destacado')
  })

  it('links ao centro no universo do canal: roxo primário e nenhum destacado; links da visão inicial roxos', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    await screen.findByTestId('memory-node-m_1')
    expect(screen.getByTestId('edge-orbit:m_1').getAttribute('data-stroke')).toBe('var(--color-primary)')
    expect(screen.getByTestId('edge-orbit:m_1').getAttribute('data-authored')).toBeNull()
    expect(screen.queryByTestId('authored-link-legend')).toBeNull()
    cleanup()
    inApp('opex')
    mount()
    expect((await screen.findByTestId('edge-opex/opex→opex')).getAttribute('data-stroke')).toBe('var(--color-primary)')
  })

  it('regressão: no universo do agente a busca cita os canais dele e destaca só o que o texto também encontrou (o ramo vetorial devolve tudo)', async () => {
    nav.params = new URLSearchParams('universo=agente:opex/opex')
    net.post.mockResolvedValue({
      data: { data: { mode: 'hybrid', results: [{ memory: memories[0], rank: 1, score: 0.0325 }, { memory: memories[1], rank: 2, score: 0.0102 }, { memory: memories[2], rank: 3, score: 0.0101 }] } },
    })
    mount()
    await screen.findByTestId('memory-node-m_1')
    await expandFilters()
    fireEvent.change(screen.getByLabelText('Buscar memórias'), { target: { value: 'pnpm' } })
    await waitFor(() => expect(net.post).toHaveBeenCalledWith('/engramind/memories/search', { query: 'pnpm', channels: ['agentes/opex/global', 'opex'], include_archived: true, limit: 50 }), { timeout: 2000 })
    await waitFor(() => expect(screen.getByTestId('memory-node-m_1').getAttribute('data-matched')).toBe('true'))
    expect(screen.getByTestId('memory-node-m_2').getAttribute('data-matched')).toBe('false')
    expect(screen.getByTestId('memory-node-m_3').getAttribute('data-matched')).toBe('false')
  })

  it('busca que falha avisa com Tentar novamente e não reaproveita o destaque do termo anterior', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    net.post.mockResolvedValueOnce({ data: { data: { mode: 'text', results: [{ memory: memories[0], rank: 1, score: 1 }] } } })
    mount()
    await screen.findByTestId('memory-node-m_1')
    await expandFilters()
    fireEvent.change(screen.getByLabelText('Buscar memórias'), { target: { value: 'pnpm' } })
    await waitFor(() => expect(screen.getByTestId('memory-node-m_1').getAttribute('data-matched')).toBe('true'), { timeout: 2000 })
    net.post.mockRejectedValueOnce(new Error('Engramind fora do ar'))
    fireEvent.change(screen.getByLabelText('Buscar memórias'), { target: { value: 'outro termo' } })
    const notice = await screen.findByTestId('network-search-error', {}, { timeout: 2000 })
    expect(notice.textContent).toContain('Engramind fora do ar')
    expect(toast.error).toHaveBeenCalledWith('Busca falhou: Engramind fora do ar')
    expect(screen.getByTestId('memory-node-m_1').getAttribute('data-matched')).toBeNull()
    net.post.mockResolvedValueOnce({ data: { data: { mode: 'text', results: [{ memory: memories[2], rank: 1, score: 1 }] } } })
    fireEvent.click(within(notice).getByRole('button', { name: /Tentar novamente/ }))
    await waitFor(() => expect(screen.getByTestId('memory-node-m_3').getAttribute('data-matched')).toBe('true'))
    expect(screen.queryByTestId('network-search-error')).toBeNull()
  })

  it('a busca não se refaz sozinha com o tempo real nem com o foco (cada busca conta como consulta no Engramind)', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    net.post.mockResolvedValue({ data: { data: { mode: 'text', results: [{ memory: memories[0], rank: 1, score: 1 }] } } })
    mount()
    await screen.findByTestId('memory-node-m_1')
    await expandFilters()
    fireEvent.change(screen.getByLabelText('Buscar memórias'), { target: { value: 'pnpm' } })
    await waitFor(() => expect(net.post).toHaveBeenCalledTimes(1), { timeout: 2000 })
    memories = [...memories, memory('m_9', 'opex')]
    emit('engramind-updated', { type: 'memory.created', channel: 'opex' })
    await screen.findByTestId('memory-node-m_9')
    act(() => void window.dispatchEvent(new Event('focus')))
    await sleep(100)
    expect(net.post).toHaveBeenCalledTimes(1)
  })

  it('memória criada por um agente: partícula verde do agente até o canal na visão inicial; a do dono não', async () => {
    inApp('opex')
    motionPrefs.reduced = false
    mount()
    await screen.findByTestId('edge-opex/opex→opex')
    memories = [...memories, ownerMemory('m_8', 'opex')]
    emit('engramind-updated', { type: 'memory.created', channel: 'opex' })
    await waitFor(() => expect(screen.getByTestId('stat-active').getAttribute('data-value')).toBe('3'))
    expect(travelDots()).toEqual([])
    memories = [...memories, memory('m_9', 'opex')]
    emit('engramind-updated', { type: 'memory.created', channel: 'opex' })
    await waitFor(() => expect(travelDots()).toEqual([{ edge: 'opex/opex→opex', tone: 'success' }]))
  })

  it('memória antiga que só aparece agora (Mostrar arquivados) não gera partícula de criação', async () => {
    inApp('opex')
    motionPrefs.reduced = false
    memories = [...memories, memory('m_7', 'agentes/opex/velho', { created_at: '2026-01-01T00:00:00Z' })]
    mount()
    await screen.findByTestId('agent-node-opex/opex')
    await expandFilters()
    fireEvent.click(screen.getByLabelText('Mostrar arquivados'))
    await screen.findByTestId('channel-node-agentes/opex/velho')
    expect(travelDots()).toEqual([])
  })

  it('universo do agente: a memória nova que ele escreveu recebe a partícula verde do centro', async () => {
    motionPrefs.reduced = false
    nav.params = new URLSearchParams('universo=agente:opex/opex')
    mount()
    await screen.findByTestId('memory-node-m_1')
    memories = [...memories, memory('m_9', 'opex')]
    emit('engramind-updated', { type: 'memory.created', channel: 'opex' })
    await waitFor(() => expect(travelDots()).toContainEqual({ edge: 'orbit:m_9', tone: 'success' }))
  })

  it('cartão de filtros recolhível (padrão /tarefas): chips no resumo, remover o chip limpa o filtro e os filtros ficam no navegador', async () => {
    inApp('opex')
    const view = mount()
    await screen.findByTestId('agent-node-opex/opex')
    expect(screen.queryByLabelText('Buscar memórias')).toBeNull()
    await expandFilters()
    await pickOption('Filtrar por canal', 'opex')
    await waitFor(() => expect(screen.getByTestId('channel-node-agentes/opex/global').className).toContain('opacity-30'))
    view.unmount()
    mount()
    const summary = await screen.findByTestId('list-filters-summary')
    expect(summary.textContent).toContain('Canal: opex')
    expect((await screen.findByTestId('channel-node-agentes/opex/global')).className).toContain('opacity-30')
    fireEvent.click(within(summary).getByRole('button', { name: /Remover/ }))
    await waitFor(() => expect(screen.getByTestId('channel-node-agentes/opex/global').className).not.toContain('opacity-30'))
  })
})

describe('OPE-113 (rodada 2)', () => {
  const memoryNodes = () => flowItems.nodes.filter((node) => node.type === 'memory')

  it('regressão do piscar: passar o mouse, abrir e trocar o card mantêm os mesmos objetos de node e aresta (o React Flow esconderia o node novo até medir)', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    await screen.findByTestId('memory-node-m_1')
    const before = memoryNodes()
    const edgesBefore = flowItems.edges
    const same = () => {
      expect(memoryNodes()).toHaveLength(before.length)
      memoryNodes().forEach((node, index) => expect(node).toBe(before[index]))
      flowItems.edges.forEach((edge, index) => expect(edge).toBe(edgesBefore[index]))
    }
    fireEvent.pointerEnter(screen.getByTestId('memory-node-m_1'))
    await waitFor(() => expect(screen.getByTestId('memory-node-m_1').getAttribute('data-focused')).toBe('true'))
    same()
    fireEvent.pointerLeave(screen.getByTestId('memory-node-m_1'))
    await waitFor(() => expect(screen.getByTestId('memory-node-m_1').getAttribute('data-focused')).toBeNull())
    same()
    fireEvent.click(screen.getByTestId('memory-node-m_1'))
    await screen.findByTestId('memory-card-m_1')
    same()
    fireEvent.click(screen.getByTestId('memory-node-m_3'))
    await screen.findByTestId('memory-card-m_3')
    same()
  })

  it('a releitura sem mudança também reaproveita os nodes', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    await screen.findByTestId('memory-node-m_1')
    const before = memoryNodes()
    memories = memories.map((item) => ({ ...item }))
    emit('engramind-updated', { type: 'memory.updated', channel: 'opex' })
    await sleep(100)
    memoryNodes().forEach((node, index) => expect(node).toBe(before[index]))
  })

  it('Importar e Novo canal ficam na linha da trilha (Voltar / Rede / nome), à direita', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    await screen.findByTestId('memory-node-m_1')
    const trail = screen.getByTestId('network-breadcrumb')
    expect(within(trail).getByRole('button', { name: /Voltar/ })).toBeTruthy()
    expect(within(trail).getByRole('button', { name: /Importar/ })).toBeTruthy()
    expect(within(trail).getByRole('button', { name: /Novo canal/ })).toBeTruthy()
    expect(within(trail).getByTestId('network-actions').className).toContain('ml-auto')
    expect(within(screen.getByTestId('network-toolbar')).queryByRole('button', { name: /Novo canal/ })).toBeNull()
  })

  it('chip do autor: o agente com o nome sem "Agente" (app/agente na dica); só app: "App x"; sem autor, nada', async () => {
    memories = [
      memory('m_1', 'opex'),
      memory('m_2', 'opex', { author: { app: 'opex', app_id: 'app_1', agent: null, agent_id: null } }),
      memory('m_3', 'opex', { author: { app: 'x', app_id: 'a', agent: 'x/fantasma', agent_id: 'g' } }),
      memory('m_4', 'opex', { author: null }),
    ]
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    const chip = async (id: string) => {
      fireEvent.click(await screen.findByTestId(`memory-node-${id}`))
      const card = await screen.findByTestId(`memory-card-${id}`)
      return within(card).queryByTestId('memory-card-author')
    }
    const agent = (await chip('m_1'))!
    expect(agent.textContent).toBe('Opex')
    expect(agent.getAttribute('title')).toContain('opex/opex')
    expect((await chip('m_2'))!.textContent).toBe('App opex')
    expect((await chip('m_3'))!.textContent).toBe('x/fantasma')
    expect(await chip('m_4')).toBeNull()
  })

  it('canal de central legível no chip do card, na trilha, nas opções e nos chips do filtro (o filtro grava o slug)', async () => {
    const slug = 'agentes/desenvolvedor/central/c1'
    channels.push({ id: 'ch_9', slug, name: 'Central', description: null, priority: 0, version: 1, created_at: now, archived_at: null })
    centrals = [{ id: 'c1', sigla: 'OPE', projectName: 'Opex', repo: 'nandobfer/opex' }]
    memories = [...memories, memory('m_8', slug)]
    try {
      nav.params = new URLSearchParams(`universo=canal:${slug}`)
      mount()
      await waitFor(() => expect(screen.getByTestId('breadcrumb-current').textContent).toBe('Canal agentes/desenvolvedor/central/OPE'))
      fireEvent.click(await screen.findByTestId('memory-node-m_8'))
      const card = await screen.findByTestId('memory-card-m_8')
      expect(card.textContent).toContain('agentes/desenvolvedor/central/OPE')
      expect(card.textContent).not.toContain('central/c1')
      await expandFilters()
      await pickOption('Filtrar por canal', 'agentes/desenvolvedor/central/OPE')
      await waitFor(() => expect(JSON.parse(window.localStorage.getItem('opex.engramind.network-filters.v1') ?? '{}').channels).toEqual([slug]))
      fireEvent.click(screen.getByRole('button', { name: 'Recolher filtros' }))
      await waitFor(() => expect(screen.getByTestId('list-filters-summary').textContent).toContain('Canal: agentes/desenvolvedor/central/OPE'))
    } finally {
      channels.pop()
      centrals = []
    }
  })

  it('distribuição no card "O que é o Engramind" (no fim, depois da rede): Órbita padrão, Radial; fica no navegador e o Limpar não a desfaz', async () => {
    inApp('opex')
    const view = mount()
    await screen.findByTestId('agent-node-opex/opex')
    const group = await screen.findByRole('radiogroup', { name: 'Distribuição da rede' })
    expect(screen.getByTestId('about-actions').contains(group)).toBe(true)
    expect(screen.getByText('O que é o Engramind')).toBeTruthy()
    // O card vem depois da área da rede e o seletor saiu da legenda.
    const canvas = screen.getByTestId('react-flow')
    expect(canvas.compareDocumentPosition(screen.getByTestId('about-actions')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(screen.getByTestId('network-stats')).queryByRole('radiogroup')).toBeNull()
    expect(within(group).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Órbita', 'Radial'])
    expect(within(group).getByRole('radio', { name: 'Órbita' }).getAttribute('aria-checked')).toBe('true')
    expect(within(screen.getByTestId('about-actions')).getByRole('button', { name: /Configurar/ })).toBeTruthy()
    expect(within(screen.getByTestId('about-actions')).getByRole('button', { name: /Saiba mais/ })).toBeTruthy()
    const position = () => JSON.stringify(flowItems.nodes.map((node) => (node as unknown as { position: unknown }).position))
    const first = position()
    fireEvent.click(within(group).getByRole('radio', { name: 'Radial' }))
    await waitFor(() => expect(position()).not.toBe(first))
    await expandFilters()
    await pickOption('Filtrar por canal', 'opex')
    fireEvent.click((await screen.findAllByRole('button', { name: 'Limpar filtros' }))[0]!)
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('opex.engramind.network-filters.v1') ?? '{}').channels).toEqual([]))
    view.unmount()
    mount()
    const again = await screen.findByRole('radiogroup', { name: 'Distribuição da rede' })
    expect(within(again).getByRole('radio', { name: 'Radial' }).getAttribute('aria-checked')).toBe('true')
  })

  it('num universo, o seletor de distribuição some; Configurar e Saiba mais continuam', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    await screen.findByTestId('memory-node-m_1')
    const actions = screen.getByTestId('about-actions')
    await waitFor(() => expect(within(actions).queryByRole('radiogroup')).toBeNull())
    expect(within(actions).getByRole('button', { name: /Configurar/ })).toBeTruthy()
    expect(within(actions).getByRole('button', { name: /Saiba mais/ })).toBeTruthy()
  })

  it('OPE-129: na visão de apps, o card do app com maior alcance tem a maior escala', async () => {
    mount()
    const opex = await screen.findByTestId('app-node-opex')
    const bot = screen.getByTestId('app-node-outro')
    expect(Number(opex.getAttribute('data-scale'))).toBeGreaterThan(Number(bot.getAttribute('data-scale')))
  })
})

describe('OPE-129: Apps x canais', () => {
  const withExtra = async <T,>(list: T[], extra: T[], run: () => Promise<void>) => {
    list.push(...extra)
    try {
      await run()
    } finally {
      list.splice(list.length - extra.length, extra.length)
    }
  }

  it('visão inicial: um card por app ativo, os canais e um link por app e canal (agentes e modos na dica)', async () => {
    await withExtra(apps, [{ id: 'app_9', slug: 'velho', name: 'Velho', description: null, created_at: now, disabled_at: now, webhook: null }], async () => {
      mount()
      expect((await screen.findByTestId('app-node-opex')).textContent).toContain('Opex')
      expect(screen.getByTestId('app-counts-opex').textContent).toBe('1 agente · 2 acessíveis')
      expect(screen.getByTestId('app-node-outro')).toBeTruthy()
      expect(screen.queryByTestId('app-node-velho')).toBeNull()
      expect(screen.queryByTestId('agent-node-opex/opex')).toBeNull()
      expect(screen.getByTestId('channel-node-opex')).toBeTruthy()
      expect(screen.getByTestId('channel-node-agentes/opex/global')).toBeTruthy()
      expect(screen.getByTestId('edge-app:opex→opex')).toBeTruthy()
      expect(screen.getByTestId('edge-app:opex→agentes/opex/global')).toBeTruthy()
      expect(screen.getByTestId('edge-app:outro→opex')).toBeTruthy()
      expect(screen.getByTestId('stat-apps').textContent).toBe('2')
      expect(screen.getByTestId('stat-channels').textContent).toBe('2')
      expect(screen.getByTestId('stats-by-app').textContent).toContain('Opex')
      expect(screen.queryByTestId('breadcrumb-current')).toBeNull()
      fireEvent.mouseEnter(screen.getByTestId('link-app:outro→opex'))
      expect(screen.getByRole('tooltip').textContent).toBe('1 agente · search')
    })
  })

  it('seleção do app: o clique abre ?app=; com o app aberto, só os agentes dele e os canais que eles assinam', async () => {
    mount()
    fireEvent.click(await screen.findByTestId('app-node-outro'))
    expect(nav.push).toHaveBeenCalledWith('/engramind?app=outro', { scroll: false })
    cleanup()
    inApp('outro')
    mount()
    expect(await screen.findByTestId('agent-node-outro/bot')).toBeTruthy()
    expect(screen.queryByTestId('agent-node-opex/opex')).toBeNull()
    expect(screen.queryByTestId('app-node-outro')).toBeNull()
    expect(screen.getByTestId('channel-node-opex')).toBeTruthy()
    expect(screen.queryByTestId('channel-node-agentes/opex/global')).toBeNull()
    expect(screen.getByTestId('breadcrumb-current').textContent).toBe('App Outro')
    expect(within(screen.getByTestId('network-stats')).getByText('Outro')).toBeTruthy()
  })

  it('Voltar e Esc sobem um nível: universo → app → apps', async () => {
    inApp('opex')
    mount()
    await screen.findByTestId('agent-node-opex/opex')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(nav.push).toHaveBeenLastCalledWith('/engramind', { scroll: false })
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(nav.push).toHaveBeenLastCalledWith('/engramind', { scroll: false })
    cleanup()
    nav.push.mockClear()
    nav.params = new URLSearchParams('app=opex&universo=agente:opex/opex')
    mount()
    await screen.findByTestId('memory-node-m_1')
    expect(screen.getByTestId('breadcrumb-current').textContent).toBe('Agente Opex')
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(nav.push).toHaveBeenLastCalledWith('/engramind?app=opex', { scroll: false })
    fireEvent.click(screen.getByTestId('breadcrumb-app'))
    expect(nav.push).toHaveBeenLastCalledWith('/engramind?app=opex', { scroll: false })
    fireEvent.click(screen.getByRole('button', { name: /Rede/ }))
    expect(nav.push).toHaveBeenLastCalledWith('/engramind', { scroll: false })
  })

  it('app inexistente no endereço volta à visão de apps com toast, substituindo o endereço', async () => {
    inApp('nao-existe')
    mount()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('App não encontrado: voltando à rede.'))
    expect(nav.replace).toHaveBeenCalledWith('/engramind', { scroll: false })
  })

  it('clicar num canal na visão de apps abre o universo do canal', async () => {
    mount()
    fireEvent.click(await screen.findByTestId('channel-node-opex'))
    expect(nav.push).toHaveBeenCalledWith('/engramind?universo=canal%3Aopex', { scroll: false })
  })

  it('decisão aprovada: canal sem nenhuma memória fica fora das duas redes; só com inativas fica; aparece e some ao vivo', async () => {
    const extra = [
      { id: 'ch_v', slug: 'agentes/opex/vazio', name: 'Vazio', description: null, priority: 0, version: 1, created_at: now, archived_at: null },
      { id: 'ch_i', slug: 'agentes/opex/inativas', name: 'Inativas', description: null, priority: 0, version: 1, created_at: now, archived_at: null },
    ]
    await withExtra(channels, extra, async () => {
      subscriptions[0]!.reaches = ['agentes/opex/global', 'agentes/opex/vazio', 'agentes/opex/inativas']
      memories = [...memories, memory('m_i', 'agentes/opex/inativas', { status: 'archived' })]
      try {
        mount()
        await screen.findByTestId('channel-node-agentes/opex/inativas')
        expect(screen.queryByTestId('channel-node-agentes/opex/vazio')).toBeNull()
        expect(screen.queryByTestId('edge-app:opex→agentes/opex/vazio')).toBeNull()
        expect(screen.getByTestId('stat-channels').textContent).toBe('3')
        expect(screen.getByTestId('stats-by-channel').textContent).not.toContain('vazio')
        cleanup()
        inApp('opex')
        mount()
        await screen.findByTestId('channel-node-agentes/opex/inativas')
        expect(screen.queryByTestId('channel-node-agentes/opex/vazio')).toBeNull()
        expect(screen.queryByTestId('edge-opex/opex→agentes/opex/vazio')).toBeNull()
        memories = [...memories, memory('m_novo', 'agentes/opex/vazio')]
        emit('engramind-updated', { type: 'memory.created', channel: 'agentes/opex/vazio' })
        expect(await screen.findByTestId('channel-node-agentes/opex/vazio')).toBeTruthy()
        expect(screen.getByTestId('edge-opex/opex→agentes/opex/vazio')).toBeTruthy()
        memories = memories.filter((item) => item.id !== 'm_novo')
        emit('engramind-updated', { type: 'memory.deleted', channel: 'agentes/opex/vazio' })
        await waitFor(() => expect(screen.queryByTestId('channel-node-agentes/opex/vazio')).toBeNull())
      } finally {
        subscriptions[0]!.reaches = ['agentes/opex/global']
      }
    })
  })

  it('Novo canal: depois de criar, abre o universo do canal novo', async () => {
    net.post.mockResolvedValue({ data: { data: { id: 'ch_n', slug: 'eng/novo' } } })
    mount()
    await screen.findByTestId('app-node-opex')
    fireEvent.click(within(screen.getByTestId('network-breadcrumb')).getByRole('button', { name: /Novo canal/ }))
    fireEvent.change(await screen.findByLabelText('Slug'), { target: { value: 'eng/novo' } })
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Novo' } })
    fireEvent.click(screen.getByRole('button', { name: /Criar canal/ }))
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/engramind?universo=canal%3Aeng%2Fnovo', { scroll: false }))
    expect(net.post).toHaveBeenCalledWith('/engramind/channels', expect.objectContaining({ slug: 'eng/novo', name: 'Novo' }))
  })

  it('estados: sem app ativo, vazio com Configurar; app sem agentes ativos, vazio do app; carregando, skeleton', async () => {
    const saved = apps.splice(0, apps.length)
    try {
      mount()
      const empty = (await screen.findByText('Nenhum app no Engramind')).parentElement!.parentElement!
      fireEvent.click(within(empty).getByRole('button', { name: 'Configurar' }))
      expect(nav.push).toHaveBeenCalledWith('/integracoes/engramind?aba=identidades')
    } finally {
      apps.push(...saved)
    }
    cleanup()
    await withExtra(apps, [{ id: 'app_8', slug: 'sem-agentes', name: 'Sem agentes', description: null, created_at: now, disabled_at: null, webhook: null }], async () => {
      inApp('sem-agentes')
      mount()
      expect(await screen.findByText('Este app não tem agentes ativos')).toBeTruthy()
    })
    cleanup()
    net.get.mockImplementation(() => new Promise(() => {}))
    nav.params = new URLSearchParams()
    mount()
    expect(await screen.findByTestId('network-skeleton')).toBeTruthy()
  })
})

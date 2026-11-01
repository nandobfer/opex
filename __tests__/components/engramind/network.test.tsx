/** @vitest-environment happy-dom */

import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import { fitBounds, flowState, xyflowMock } from '../../helpers/xyflow'

/** OPE-109: rede do Engramind em `/engramind` (visão inicial, universos, card, busca e consumo ao vivo). */

vi.mock('framer-motion', () => framerMotionMock())
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
import { HOVER_CLOSE_DELAY_MS } from '@/features/engramind/components/network/MemoryUniverse'
import { NETWORK_FLOW_THEME } from '@/features/engramind/components/network/layout-classes'
import { channelColors } from '@/features/engramind/network/network-math'

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

const respond = (url: string) => {
  if (url === '/engramind/channels') return { channels, next_cursor: null }
  if (url === '/engramind/agents') return { agents, next_cursor: null }
  if (url === '/engramind/apps') return { apps, next_cursor: null }
  if (url === '/engramind/subscriptions') return { subscriptions, next_cursor: null }
  if (url === '/engramind/memories') return { memories, next_cursor: null }
  if (url === '/engramind/settings') return { settings: [{ key: 'consolidation.stale_after_days', value: 30 }, { key: 'categories.list', value: [{ key: 'PROJECT_RULES', label: 'Regras', priority: 1 }] }, { key: 'memory.text_min', value: 3 }, { key: 'memory.text_max', value: 200 }] }
  if (url === '/engramind/memory-usage') return {}
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
const emit = (event: string, payload: unknown) => act(() => (pusher.handlers.get(event) ?? []).forEach((handler) => handler(payload)))

beforeEach(() => {
  vi.clearAllMocks()
  pusher.handlers.clear()
  nav.params = new URLSearchParams()
  memories = [memory('m_1', 'opex'), memory('m_2', 'agentes/opex/global'), memory('m_3', 'opex', { status: 'archived' })]
  net.get.mockImplementation(async (url: string) => ({ data: { data: respond(url) } }))
})
afterEach(cleanup)

describe('visão inicial', () => {
  it('agentes ativos de todos os apps sem o prefixo "Agente", canais ativos e um link por canal casado', async () => {
    mount()
    expect((await screen.findByTestId('agent-node-opex/opex')).textContent).toContain('Opex')
    expect(screen.getByTestId('agent-node-opex/opex').textContent).not.toContain('Agente')
    expect(screen.getByTestId('agent-node-outro/bot').textContent).toContain('Externo')
    expect(screen.queryByTestId('agent-node-outro/off')).toBeNull()
    expect(screen.getByTestId('channel-node-opex')).toBeTruthy()
    expect(screen.queryByTestId('channel-node-agentes/opex/velho')).toBeNull()
    expect(screen.getByTestId('edge-opex/opex→agentes/opex/global')).toBeTruthy()
    expect(screen.getByTestId('edge-outro/bot→opex')).toBeTruthy()
    expect(screen.getByTestId('stat-agents').textContent).toBe('2')
    expect(screen.getByTestId('stat-active').textContent).toBe('2')
    expect(screen.getByTestId('stat-inactive').textContent).toBe('1')
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
    mount()
    fireEvent.mouseEnter(await screen.findByTestId('link-outro/bot→opex'))
    expect(screen.getByRole('tooltip').textContent).toContain('search')
  })

  it('filtro por app esconde os agentes e os links dele; Mostrar arquivados exibe o canal arquivado apagado', async () => {
    mount()
    fireEvent.click(await screen.findByLabelText('Mostrar agentes do app Outro'))
    await waitFor(() => expect(screen.queryByTestId('agent-node-outro/bot')).toBeNull())
    expect(screen.queryByTestId('edge-outro/bot→opex')).toBeNull()
    fireEvent.click(screen.getByLabelText('Mostrar arquivados'))
    const archived = await screen.findByTestId('channel-node-agentes/opex/velho')
    expect(archived.getAttribute('data-archived')).toBe('true')
    expect(screen.getByTestId('edge-opex/opex→agentes/opex/velho')).toBeTruthy()
  })

  it('clicar num canal ou agente abre o universo pelo endereço', async () => {
    mount()
    fireEvent.click(await screen.findByTestId('channel-node-opex'))
    expect(nav.push).toHaveBeenCalledWith('/engramind?universo=canal%3Aopex', { scroll: false })
    fireEvent.click(screen.getByTestId('agent-node-opex/opex'))
    expect(nav.push).toHaveBeenCalledWith('/engramind?universo=agente%3Aopex%2Fopex', { scroll: false })
  })

  it('consumo ao vivo de um agente conta na estatística; agente desconhecido é ignorado', async () => {
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
    fireEvent.pointerEnter(await screen.findByTestId('memory-node-m_1'))
    const card = await screen.findByTestId('memory-card-m_1')
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

  it('regressão: a cor de um canal no universo do agente vem do mapa de todos os canais', async () => {
    nav.params = new URLSearchParams('universo=agente:opex/opex')
    mount()
    await screen.findByTestId('memory-node-m_1')
    const all = channelColors(channels.map((item) => item.slug))
    const legend = screen.getByTestId('channel-legend')
    const styles = [...legend.querySelectorAll('span[aria-hidden]')].map((dot) => dot.getAttribute('style') ?? '').join(' | ')
    expect(styles).toContain(all.get('opex')!)
    expect(styles).toContain(all.get('agentes/opex/global')!)
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
    fireEvent.pointerEnter(await screen.findByTestId('memory-node-m_1'))
    const card = await screen.findByTestId('memory-card-m_1')
    expect(card.textContent).toContain('Título m_1')
    expect(within(card).getByTestId('memory-card-uses').textContent).toContain('3 usos')
    fireEvent.click(within(card).getByRole('checkbox', { name: 'Ativa' }))
    await waitFor(() => expect(net.post).toHaveBeenCalledWith('/engramind/memories/m_1/archive', {}))
    fireEvent.click(within(card).getByRole('button', { name: 'Excluir' }))
    expect(net.delete).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir de vez' }))
    await waitFor(() => expect(net.delete).toHaveBeenCalledWith('/engramind/memories/m_1'))
    fireEvent.pointerEnter(screen.getByTestId('memory-node-m_1'))
    fireEvent.click(within(await screen.findByTestId('memory-card-m_1')).getByRole('button', { name: 'Editar' }))
    fireEvent.change(await screen.findByLabelText('Texto da memória'), { target: { value: 'Texto novo' } })
    await waitFor(() => expect((screen.getByRole('button', { name: /Salvar/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(net.patch).toHaveBeenCalledWith('/engramind/memories/m_1', { text: 'Texto novo', category: 'PROJECT_RULES', expected_version: 2 }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Esta memória mudou enquanto você editava. Confira a versão atual.'))
    expect((screen.getByLabelText('Texto da memória') as HTMLTextAreaElement).value).toBe('Texto novo')
  })

  it('regressão: na ordem real do navegador (entra no card antes de sair da partícula) o card continua aberto; sair do card fecha depois do atraso', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    const node = await screen.findByTestId('memory-node-m_1')
    fireEvent.pointerEnter(node)
    const card = await screen.findByTestId('memory-card-m_1')
    // O navegador avisa "entrei no card" antes de "saí da partícula".
    fireEvent.pointerEnter(card)
    fireEvent.pointerLeave(node)
    await new Promise((resolve) => setTimeout(resolve, HOVER_CLOSE_DELAY_MS + 100))
    expect(screen.getByTestId('memory-card-m_1')).toBeTruthy()
    expect(screen.getByTestId('memory-node-m_1').getAttribute('data-expanded')).toBe('true')
    fireEvent.pointerLeave(screen.getByTestId('memory-card-m_1'))
    await new Promise((resolve) => setTimeout(resolve, HOVER_CLOSE_DELAY_MS - 150))
    expect(screen.getByTestId('memory-card-m_1')).toBeTruthy()
    await waitFor(() => expect(screen.queryByTestId('memory-card-m_1')).toBeNull())
  })

  it('a ordem inversa (sai da partícula e depois entra no card) também mantém o card; voltar à partícula cancela o fechamento', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    const node = await screen.findByTestId('memory-node-m_1')
    fireEvent.pointerEnter(node)
    const card = await screen.findByTestId('memory-card-m_1')
    fireEvent.pointerLeave(node)
    fireEvent.pointerEnter(card)
    fireEvent.pointerLeave(card)
    fireEvent.pointerEnter(node)
    await new Promise((resolve) => setTimeout(resolve, HOVER_CLOSE_DELAY_MS + 100))
    expect(screen.getByTestId('memory-card-m_1')).toBeTruthy()
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
    expect(zoomOne.classes).toContain('w-72')
    expect(zoomOne.classes).not.toMatch(/\bscale-/)
    cleanup()
    flowState.transform = [0, 0, 2]
    mount()
    fireEvent.click(await screen.findByTestId('memory-node-m_1'))
    await screen.findByTestId('memory-card-m_1')
    expect(at()).toEqual(zoomOne)
    flowState.transform = [0, 0, 1]
  })

  it('zoom afastado demais: a partícula só se destaca, sem card', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    flowState.transform = [0, 0, 0.4]
    mount()
    fireEvent.click(await screen.findByTestId('memory-node-m_1'))
    expect(screen.queryByTestId('memory-card-m_1')).toBeNull()
    expect(screen.getByTestId('memory-node-m_1').getAttribute('data-expanded')).toBeNull()
    flowState.transform = [0, 0, 1]
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

  it('busca destaca sem remover: as que casam ficam em destaque e as demais apagadas', async () => {
    nav.params = new URLSearchParams('universo=canal:opex')
    net.post.mockResolvedValue({ data: { data: { mode: 'text', results: [{ memory: memories[0], rank: 1, score: 1 }] } } })
    mount()
    await screen.findByTestId('memory-node-m_1')
    fireEvent.change(screen.getByLabelText('Buscar memórias'), { target: { value: 'pnpm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
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

  it('canal sem memórias mostra o estado vazio com Nova memória', async () => {
    memories = []
    nav.params = new URLSearchParams('universo=canal:opex')
    mount()
    expect((await screen.findByTestId('universe-empty')).textContent).toContain('Nenhuma memória neste universo')
    expect(screen.getByRole('button', { name: /Nova memória/ })).toBeTruthy()
  })
})

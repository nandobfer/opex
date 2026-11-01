/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { framerMotionMock } from '../../helpers/framer-motion'
import { xyflowMock } from '../../helpers/xyflow'

/**
 * Memórias dos agentes em `/integracoes/ia` como universo do canal da lista (OPE-109; antes a lista
 * da OPE-104): partículas, card com as ações otimistas, avisos e a seção do Agente Opex.
 */

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@xyflow/react', () => xyflowMock())
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
const net = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/api', () => ({
  api: net,
  unwrapApi: (response: { data: unknown }) => response.data,
  apiErrorCode: () => null,
  apiErrorMessage: (error: unknown, fallback: string) => (error as { message?: string })?.message ?? fallback,
}))
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: () => false, acquireChannel: vi.fn(), releaseChannel: vi.fn() }))
vi.mock('@/features/orcamentos/hooks/useOrcamentos', () => ({ useOrcamentoClients: () => ({ isLoading: false, data: [{ id: 'd'.repeat(24), name: 'ACME' }] }) }))

import { MemoryNetworkView, memoryDtoToNetwork } from '@/features/ai/components/memories/MemoryNetworkView'
import { OpexMemoriesSection } from '@/features/opex-agent/components/settings/OpexMemoriesSection'
import { agentMemoriesSource } from '@/features/ai/hooks/useMemories'
import type { MemoriesMetaDto, MemoryDto } from '@/features/ai/types'

const now = new Date().toISOString()
const memory: MemoryDto = { id: 'm_aaa', texto: 'Responda sempre em pt-BR.', resumo: 'Idioma pt-BR', resumoPendente: false, categoria: 'PROJECT_RULES', fixada: false, ativa: true, versao: 3, autor: 'Dono', doDono: true, origin: null, criadaEm: now, atualizadaEm: now, uso: { consultas: 2, injecoes: 5, ultimaConsulta: null, verificadaEm: null, esquecida: false } }
const META: MemoriesMetaDto = {
  textMin: 3,
  textMax: 50,
  categories: [{ key: 'PROJECT_RULES', label: 'Regras' }, { key: 'NAMING', label: 'Nomes' }],
  migrationPending: false,
  availability: { unavailable: false, since: null, lastOkAt: null, reason: null },
  outside: [],
  error: null,
}
let meta: MemoriesMetaDto
let rows: MemoryDto[]
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
const mount = (canEdit = true, queryClient = client()) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryNetworkView source={agentMemoriesSource('opex-global')} channel="agentes/opex/global" canEdit={canEdit} />
    </QueryClientProvider>,
  )
const particle = async (id: string) => (await screen.findByTestId(`memory-node-${id}`)) as HTMLElement
const openCard = async (id: string) => {
  fireEvent.mouseEnter(await particle(id))
  return screen.findByTestId(`memory-card-${id}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  meta = structuredClone(META)
  rows = [memory]
  net.get.mockImplementation(async (url: string) => {
    if (url === '/ai/memories/meta') return { data: { data: meta } }
    if (url === '/ai/features/agent-self-memory') return { data: { data: { settings: { opex: true, maddox: true, adversario: true, desenvolvedor: true }, updatedAt: null } } }
    if (url === '/engramind/settings') return { data: { data: { settings: [{ key: 'consolidation.stale_after_days', value: 30 }] } } }
    if (url === '/engramind/memory-usage') return { data: { data: {} } }
    return { data: { data: rows } }
  })
})
afterEach(cleanup)

describe('memoryDtoToNetwork', () => {
  it('ativa/fixada viram o status do Engramind e o uso vem dos contadores', () => {
    expect(memoryDtoToNetwork(memory, 'opex').status).toBe('active')
    expect(memoryDtoToNetwork({ ...memory, fixada: true }, 'opex').status).toBe('permanent')
    expect(memoryDtoToNetwork({ ...memory, ativa: false, fixada: true }, 'opex').status).toBe('archived')
    const network = memoryDtoToNetwork(memory, 'opex')
    expect([network.retrievals, network.injections, network.channel, network.fromOwner]).toEqual([2, 5, 'opex', true])
    expect(memoryDtoToNetwork({ ...memory, uso: undefined }, 'opex').retrievals).toBe(0)
  })
})

describe('universo de uma lista de memórias', () => {
  it('uma partícula por memória (inclusive inativa) e o canal no centro; hover abre o card com os campos', async () => {
    rows = [memory, { ...memory, id: 'm_bbb', resumo: 'Antiga', ativa: false }, { ...memory, id: 'm_ccc', resumo: 'Fixa', fixada: true }]
    mount()
    expect((await screen.findByTestId('universe-center')).textContent).toContain('agentes/opex/global')
    expect(net.get).toHaveBeenCalledWith('/ai/agents/opex-global/memories')
    expect((await particle('m_bbb')).getAttribute('data-archived')).toBe('true')
    expect((await particle('m_ccc')).getAttribute('data-pinned')).toBe('true')
    const card = await openCard('m_aaa')
    expect(card.textContent).toContain('Idioma pt-BR')
    expect(card.textContent).toContain('Responda sempre em pt-BR.')
    expect(screen.getByTestId('memory-card-uses').textContent).toContain('7 usos')
    expect(screen.getByTestId('memory-card-last-use').textContent).toBe('nunca usada')
    expect(card.textContent).toContain('Memória do dono')
    expect(screen.getByTestId('stat-active').textContent).toBe('2')
    expect(screen.getByTestId('stat-inactive').textContent).toBe('1')
  })

  it('lista vazia mostra o estado vazio com Nova memória, e criar envia texto e categoria', async () => {
    rows = []
    net.post.mockResolvedValue({ data: { data: { memoria: { ...memory, id: 'm_new', texto: 'Nova regra', resumo: 'Nova regra' } } } })
    mount()
    expect((await screen.findByTestId('universe-empty')).textContent).toContain('Nenhuma memória nesta lista ainda')
    fireEvent.click(screen.getByRole('button', { name: /Nova memória/ }))
    fireEvent.change(await screen.findByLabelText('Texto da memória'), { target: { value: 'Nova regra' } })
    await waitFor(() => expect((screen.getByRole('button', { name: /Salvar/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(net.post).toHaveBeenCalledWith('/ai/agents/opex-global/memories', { texto: 'Nova regra', categoria: 'PROJECT_RULES' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Memória adicionada'))
  })

  it('o switch Ativa é otimista; a falha volta o estado e mostra o erro', async () => {
    net.patch.mockRejectedValueOnce(new Error('Engramind fora do ar'))
    mount()
    await openCard('m_aaa')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ativa' }))
    await waitFor(() => expect(net.patch).toHaveBeenCalledWith('/ai/agents/opex-global/memories/m_aaa', { ativa: false }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Engramind fora do ar'))
    await waitFor(() => expect((screen.getByTestId('memory-node-m_aaa')).getAttribute('data-archived')).toBeNull())
  })

  it('editar envia a versão lida; no conflito o editor continua aberto com o texto digitado', async () => {
    net.patch.mockRejectedValueOnce(new Error('Esta memória mudou enquanto você editava. Confira a versão atual.'))
    mount()
    await openCard('m_aaa')
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const editor = (await screen.findByLabelText('Texto da memória')) as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: 'Responda em pt-BR sempre.' } })
    await waitFor(() => expect((screen.getByRole('button', { name: /Salvar/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(net.patch).toHaveBeenCalledWith('/ai/agents/opex-global/memories/m_aaa', { texto: 'Responda em pt-BR sempre.', categoria: 'PROJECT_RULES', versao: 3 }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Esta memória mudou enquanto você editava. Confira a versão atual.'))
    expect((screen.getByLabelText('Texto da memória') as HTMLTextAreaElement).value).toBe('Responda em pt-BR sempre.')
  })

  it('fixar envia fixada; excluir pede confirmação; sem edição o card é somente leitura', async () => {
    net.patch.mockResolvedValue({ data: { data: { memoria: { ...memory, fixada: true } } } })
    net.delete.mockResolvedValue({ data: { data: memory } })
    const view = mount()
    await openCard('m_aaa')
    fireEvent.click(screen.getByRole('button', { name: 'Fixar' }))
    await waitFor(() => expect(net.patch).toHaveBeenCalledWith('/ai/agents/opex-global/memories/m_aaa', { fixada: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText(/"Idioma pt-BR" é apagada do Engramind/)).toBeTruthy()
    expect(net.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir memória' }))
    await waitFor(() => expect(net.delete).toHaveBeenCalledWith('/ai/agents/opex-global/memories/m_aaa'))
    view.unmount()
    mount(false)
    await openCard('m_aaa')
    expect((screen.getByRole('button', { name: 'Editar' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'Ativa' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Nova memória/ })).toBeNull()
  })
})

describe('avisos dos cards', () => {
  it('migração pendente, Engramind indisponível e memórias fora do contexto aparecem e somem sem desmontar o bloco', async () => {
    const queryClient = client()
    mount(true, queryClient)
    const notices = await screen.findByTestId('memories-notices')
    expect(screen.queryByTestId('memories-migration-pending')).toBeNull()
    meta = { ...META, migrationPending: true, availability: { unavailable: true, since: now, lastOkAt: '2026-10-30T12:00:00.000Z', reason: 'fora' }, outside: [{ consumer: 'opex', channels: ['agentes/opex/global'], outside: 2 }] }
    await act(async () => queryClient.invalidateQueries({ queryKey: ['ai', 'memories-meta'] }))
    expect((await screen.findByTestId('memories-migration-pending')).querySelector('a')!.getAttribute('href')).toBe('/integracoes/engramind?aba=migracao')
    expect(screen.getByTestId('memories-unavailable').textContent).toContain('Engramind indisponível: agentes usando o contexto de 30/10/2026')
    expect(screen.getByTestId('memories-outside').textContent).toContain('2 memórias ficaram fora do texto completo do contexto')
    meta = META
    await act(async () => queryClient.invalidateQueries({ queryKey: ['ai', 'memories-meta'] }))
    await waitFor(() => expect(screen.queryByTestId('memories-migration-pending')).toBeNull())
    expect(screen.getByTestId('memories-notices')).toBe(notices)
  })
})

describe('seção Memórias do Agente Opex', () => {
  it('aprendizado autônomo, Memórias do Opex, as três listas do agente (sempre em rede) e o card de um cliente específico', async () => {
    rows = []
    render(
      <QueryClientProvider client={client()}>
        <OpexMemoriesSection />
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('checkbox', { name: 'Aprendizado autônomo do Agente Opex' })).toBeTruthy()
    expect(screen.getByText('Memórias do Opex')).toBeTruthy()
    expect(screen.getByText('Memórias globais')).toBeTruthy()
    expect(screen.getByText('Memórias do dono')).toBeTruthy()
    expect(screen.getByText('Memórias do cliente')).toBeTruthy()
    expect(screen.getByText('Memórias de um cliente')).toBeTruthy()
    expect(screen.getByText('Escolha um cliente para ver e editar as memórias dele.')).toBeTruthy()
    await waitFor(() => expect(screen.getAllByText('Nenhuma memória nesta lista ainda')).toHaveLength(4))
    expect(screen.getAllByTestId('memory-network-view')).toHaveLength(4)
    expect(screen.queryByRole('list', { name: 'Memórias' })).toBeNull()
    expect(net.get.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(['/ai/agents/app-global/memories', '/ai/agents/opex-global/memories', '/ai/agents/opex-owner/memories', '/ai/agents/opex-client/memories']))
    expect(net.get.mock.calls.map((call) => call[0])).not.toContain('/ai/agents/opex-client-specific/memories')
  })

  it('desligar o aprendizado autônomo salva só a chave do agente', async () => {
    rows = []
    net.put.mockImplementation(async (_url: string, settings: unknown) => ({ data: { data: { settings, updatedAt: now } } }))
    render(
      <QueryClientProvider client={client()}>
        <OpexMemoriesSection />
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Aprendizado autônomo do Agente Opex' }))
    await waitFor(() => expect(net.put).toHaveBeenCalledWith('/ai/features/agent-self-memory', { opex: false, maddox: true, adversario: true, desenvolvedor: true }))
  })
})

describe('controles do design system', () => {
  it('cards de memórias e a aba de migração não usam select nem checkbox nativos nem primitivos sem tema', () => {
    const roots = ['src/features/ai/components/memories', 'src/features/engramind/components/integration/migration', 'src/features/engramind/components/network']
    const files = roots.flatMap(function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        return statSync(path).isDirectory() ? walk(path) : path.endsWith('.tsx') ? [path] : []
      })
    })
    expect(files.length).toBeGreaterThan(8)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/<select\b/)
      expect(source, file).not.toMatch(/type=["']checkbox["']/)
      expect(source, file).not.toMatch(/@radix-ui\/react-(select|checkbox|switch|tabs)/)
    }
  })
})

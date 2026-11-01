/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { framerMotionMock } from '../../helpers/framer-motion'

/** Cards de memórias no Engramind (OPE-104): linha, editor, ações otimistas, avisos e a seção do Agente Opex. */

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
const net = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/api', () => ({
  api: net,
  unwrapApi: (response: { data: unknown }) => response.data,
  apiErrorMessage: (error: unknown, fallback: string) => (error as { message?: string })?.message ?? fallback,
}))
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: () => false, acquireChannel: vi.fn(), releaseChannel: vi.fn() }))
vi.mock('@/features/orcamentos/hooks/useOrcamentos', () => ({ useOrcamentoClients: () => ({ isLoading: false, data: [{ id: 'd'.repeat(24), name: 'ACME' }] }) }))

import { MemoryList } from '@/features/ai/components/memories/MemoryList'
import { OpexMemoriesSection } from '@/features/opex-agent/components/settings/OpexMemoriesSection'
import { agentMemoriesSource } from '@/features/ai/hooks/useMemories'
import type { MemoriesMetaDto, MemoryDto } from '@/features/ai/types'

const now = new Date().toISOString()
const memory: MemoryDto = { id: 'm_aaa', texto: 'Responda sempre em pt-BR.', resumo: 'Idioma pt-BR', resumoPendente: false, categoria: 'PROJECT_RULES', fixada: false, ativa: true, versao: 3, autor: 'Dono', doDono: true, origin: null, criadaEm: now, atualizadaEm: now }
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
      <MemoryList source={agentMemoriesSource('opex-global')} channel="agentes/opex/global" canEdit={canEdit} emptyTitle="Nenhuma memória" />
    </QueryClientProvider>,
  )
const row = async (summary: string) => (await screen.findByText(summary)).closest('[data-testid="memory-row"]') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  meta = structuredClone(META)
  rows = [memory]
  net.get.mockImplementation(async (url: string) => ({ data: { data: url === '/ai/memories/meta' ? meta : url === '/ai/features/agent-self-memory' ? { settings: { opex: true, maddox: true, adversario: true, desenvolvedor: true }, updatedAt: null } : rows } }))
})
afterEach(cleanup)

describe('lista de memórias (Engramind)', () => {
  it('mostra o resumo, a categoria, expande o texto e lê da rota da lista; total de ativas e inativas', async () => {
    rows = [memory, { ...memory, id: 'm_bbb', resumo: 'Antiga', ativa: false }]
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Idioma pt-BR/ }))
    expect(screen.getByText('Responda sempre em pt-BR.')).toBeTruthy()
    expect(screen.getAllByTestId('memory-category')[0]!.textContent).toBe('Regras')
    expect(net.get).toHaveBeenCalledWith('/ai/agents/opex-global/memories')
    expect(screen.getByTestId('memory-count').textContent).toBe('1 ativa · 1 inativa')
    expect((await row('Antiga')).getAttribute('data-active')).toBe('false')
    expect((await row('Antiga')).classList.contains('opacity-60')).toBe(true)
  })

  it('regressão: o resumo longo aparece inteiro, quebrando linha (sem truncate)', async () => {
    const resumo = 'Usar o design da tarefa de referência como base visual em todas as próximas telas do módulo de cadastro'
    rows = [{ ...memory, resumo }]
    mount()
    const summary = await screen.findByText(resumo)
    expect(summary.classList.contains('truncate')).toBe(false)
    expect(summary.classList.contains('break-words')).toBe(true)
  })

  it('selos: "Fixada", a origem do Mentor e a do agente que gravou sozinho; resumo pendente mostra o carregando', async () => {
    rows = [
      { ...memory, id: 'm_1', resumo: 'Fixa', fixada: true },
      { ...memory, id: 'm_2', resumo: 'Do Mentor', doDono: false, origin: { source: 'mentor', label: 'Mentor · OPE-7' } },
      { ...memory, id: 'm_3', resumo: 'Do agente', doDono: false, origin: { source: 'opex', label: 'Agente Opex' }, resumoPendente: true },
    ]
    mount()
    expect((await row('Fixa')).querySelector('[data-testid="memory-pinned"]')).toBeTruthy()
    expect((await screen.findByTitle('Gravada por Mentor · OPE-7')).textContent).toContain('Mentor · OPE-7')
    expect(screen.getByTitle('Gravada por Agente Opex')).toBeTruthy()
    expect(screen.getByLabelText('Gravada pelo agente')).toBeTruthy()
    expect((await row('Do agente')).querySelector('[aria-label="O Redator está resumindo a memória"]')).toBeTruthy()
  })

  it('criar com categoria: entra na hora com o resumo carregando e envia texto e categoria', async () => {
    let resolve: (value: unknown) => void = () => undefined
    net.post.mockReturnValue(new Promise((done) => (resolve = done)))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Nova memória/ }))
    fireEvent.change(screen.getByLabelText('Nova memória'), { target: { value: 'Nova regra' } })
    expect(screen.getByTestId('memory-editor-counter').textContent).toBe('10/50')
    await waitFor(() => expect((screen.getByRole('button', { name: /Salvar/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    expect(await screen.findByLabelText('O Redator está resumindo a memória')).toBeTruthy()
    await waitFor(() => expect(net.post).toHaveBeenCalledWith('/ai/agents/opex-global/memories', { texto: 'Nova regra', categoria: 'PROJECT_RULES' }))
    await act(async () => resolve({ data: { data: { memoria: { ...memory, id: 'm_new', texto: 'Nova regra', resumo: 'Nova regra' } } } }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Memória adicionada'))
  })

  it('texto acima do limite do Engramind bloqueia o Salvar com a mensagem', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Nova memória/ }))
    fireEvent.change(screen.getByLabelText('Nova memória'), { target: { value: 'x'.repeat(51) } })
    await waitFor(() => expect(screen.getByTestId('memory-editor-counter').textContent).toBe('Até 50 caracteres'))
    expect((screen.getByRole('button', { name: /Salvar/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Ativo/Inativo é otimista; a falha volta o estado e mostra o erro', async () => {
    net.patch.mockRejectedValueOnce(new Error('Engramind fora do ar'))
    mount()
    const toggle = await screen.findByRole('checkbox', { name: 'Inativar memória' })
    fireEvent.click(toggle)
    await waitFor(() => expect(net.patch).toHaveBeenCalledWith('/ai/agents/opex-global/memories/m_aaa', { ativa: false }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Engramind fora do ar'))
    expect((await row('Idioma pt-BR')).getAttribute('data-active')).toBe('true')
  })

  it('editar envia a versão lida; no conflito o editor continua aberto com o texto digitado', async () => {
    net.patch.mockRejectedValueOnce(new Error('Esta memória mudou enquanto você editava. Confira a versão atual.'))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar memória' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Editar memória' }), { target: { value: 'Responda em pt-BR sempre.' } })
    await waitFor(() => expect((screen.getByRole('button', { name: /Salvar/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(net.patch).toHaveBeenCalledWith('/ai/agents/opex-global/memories/m_aaa', { texto: 'Responda em pt-BR sempre.', categoria: 'PROJECT_RULES', versao: 3 }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Esta memória mudou enquanto você editava. Confira a versão atual.'))
    expect((screen.getByRole('textbox', { name: 'Editar memória' }) as HTMLTextAreaElement).value).toBe('Responda em pt-BR sempre.')
  })

  it('fixar envia fixada; excluir pede confirmação; sem edição a lista é somente leitura', async () => {
    net.patch.mockResolvedValue({ data: { data: { memoria: { ...memory, fixada: true } } } })
    net.delete.mockResolvedValue({ data: { data: memory } })
    const view = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Fixar memória' }))
    await waitFor(() => expect(net.patch).toHaveBeenCalledWith('/ai/agents/opex-global/memories/m_aaa', { fixada: true }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir memória' }))
    expect(screen.getByText(/"Idioma pt-BR" é apagada do Engramind/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir memória' }).at(-1)!)
    await waitFor(() => expect(net.delete).toHaveBeenCalledWith('/ai/agents/opex-global/memories/m_aaa'))
    view.unmount()
    mount(false)
    await screen.findByRole('button', { name: /Idioma pt-BR/ })
    expect(screen.queryByRole('button', { name: /Nova memória/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar memória' })).toBeNull()
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
  it('aprendizado autônomo, Memórias do Opex, as três listas do agente e o card de um cliente específico', async () => {
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
    await waitFor(() => expect(screen.getAllByText('Nenhuma memória')).toHaveLength(4))
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
    const roots = ['src/features/ai/components/memories', 'src/features/engramind/components/integration/migration']
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

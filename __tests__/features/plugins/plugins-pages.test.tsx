/** @vitest-environment happy-dom */
import '../../helpers/integrations-render'


import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Telas de Plugins (OPE-172, rodada 3): lista com o nome como link, debug e switch Ativo (confirmação
 * ao desligar) e o filtro Slot; detalhe só com o switch Ativo, Versões no componente "um item em uso"
 * (clicar numa consolidada a põe em uso, com confirmação; a prévia não é clicável e traz Ver/Aprovar),
 * o descritivo de cada mudança (e "Gerar descritivo") e a coluna de logs. Rodada 4: arquivar (botão no
 * cabeçalho, filtro "Arquivados") e o filtro Slot com busca em árvore (SearchPicker).
 */

const holder = vi.hoisted(() => ({
  list: { data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() },
  detail: { data: null as unknown, isPending: false, isError: false, error: null, refetch: vi.fn() },
  rollback: vi.fn(),
  approve: vi.fn(),
  setActive: vi.fn(),
  archive: vi.fn(),
  preview: vi.fn(async () => ({ previewOn: ['relogio'] })),
  summary: vi.fn(),
  source: { kind: 'owner', clientId: null as string | null },
  push: vi.fn(),
  search: new URLSearchParams(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: holder.push, replace: (url: string) => (holder.search = new URLSearchParams(url.split('?')[1] ?? '')) }),
  usePathname: () => '/plugins',
  useSearchParams: () => holder.search,
}))
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(async () => ({ data: { data: [] } })) }, apiErrorMessage: (_e: unknown, fallback: string) => fallback, apiErrorCode: () => null, unwrapApi: (v: unknown) => v }))
vi.mock('@/features/plugins/client/PluginSourceContext', () => ({ usePluginSource: () => holder.source }))
vi.mock("@nandobfer/integracoes/modules/react/central/IntegrationConsole", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({
  SEARCH_HIGHLIGHT_LIMIT: 1000,
  IntegrationConsole: React.forwardRef(function Console() {
    return <div data-testid="console" />
  }),
}))(importOriginal)) as Record<string, unknown>), }))
vi.mock('@/features/plugins/hooks/usePluginDebugLogs', () => ({ usePluginDebugLogs: () => ({ mode: 'manual', loading: false, error: null, refresh: vi.fn() }) }))
vi.mock('@/features/plugins/hooks/usePlugins', () => ({
  usePluginsRealtime: () => undefined,
  usePlugins: () => holder.list,
  usePlugin: () => holder.detail,
  usePluginKernel: () => ({ isPending: false, data: { mode: 'full', fibers: [{ pluginId: 'relogio', channel: 'stable', effects: ['tool:plugin_relogio_hora'], warning: null }], tools: [{ pluginId: 'relogio', name: 'plugin_relogio_hora', channel: 'stable' }], routes: [], crons: [] } }),
  usePluginRuntime: () => ({ isPending: false, data: { plugins: [], previewOn: [] } }),
  useTogglePluginPreview: () => ({ mutate: vi.fn(), mutateAsync: holder.preview, isPending: false }),
  useRollbackPlugin: () => ({ mutate: holder.rollback, isPending: false }),
  useSetPluginActive: () => ({ mutate: holder.setActive, isPending: false }),
  useSetPluginArchived: () => ({ mutate: holder.archive, isPending: false }),
  useApprovePluginPreview: () => ({ mutate: holder.approve, isPending: false }),
  useGeneratePluginVersionSummary: () => ({ mutate: holder.summary, isPending: false, variables: undefined }),
}))

import { OwnerPluginDetailPage, OwnerPluginsPage, ClientePluginDetailPage } from '@/features/plugins/components/PluginPages'

const summary = (number: number, state: string, extra: Record<string, unknown> = {}) => ({
  id: `v${number}`,
  number,
  state,
  author: 'local',
  source: { taskId: 't1', taskCode: 'OPE-172', workbenchId: 'wb1' },
  baseVersionId: null,
  tests: ['client/index.test.tsx'],
  hasServer: true,
  hasClient: true,
  createdAt: '2026-11-19T12:00:00.000Z',
  promotedAt: state === 'draft' || state === 'preview' ? null : '2026-11-19T12:00:00.000Z',
  slots: ['dashboard.widgets'],
  previewPath: '/dashboard',
  changeSummary: `Mudança da v${number}`,
  changeSummarySource: 'agent',
  ...extra,
})
const plugin = (overrides: Record<string, unknown> = {}) => ({
  id: 'relogio',
  name: 'Relógio',
  description: 'Hora no dashboard',
  scope: 'owner',
  clientId: null,
  clientName: null,
  apiVersion: '1.0',
  active: true,
  archivedAt: null,
  stable: summary(2, 'stable'),
  preview: summary(3, 'preview'),
  slots: ['dashboard.widgets'],
  previewWorkbenchId: 'wb1',
  runtimeError: null,
  createdAt: '2026-11-19T12:00:00.000Z',
  updatedAt: '2026-11-19T12:00:00.000Z',
  ...overrides,
})

beforeEach(() => {
  holder.source = { kind: 'owner', clientId: null }
  holder.list = { data: [], isLoading: false, isError: false, refetch: vi.fn() }
  holder.detail = { data: null, isPending: false, isError: false, error: null, refetch: vi.fn() }
  holder.search = new URLSearchParams()
  for (const fn of [holder.rollback, holder.approve, holder.setActive, holder.archive, holder.summary, holder.push]) fn.mockReset()
  holder.preview.mockClear()
})

describe('lista de plugins', () => {
  it('estado vazio com a orientação de criar uma tarefa Plugin', () => {
    render(<OwnerPluginsPage />)
    expect(screen.getByText('Nenhum plugin ainda')).toBeTruthy()
    expect(screen.getByText(/Crie uma tarefa do tipo Plugin/)).toBeTruthy()
  })

  it('o nome é o link para a página; sem ícone de abrir; debug ao lado do switch Ativo', async () => {
    holder.list.data = [plugin({ runtimeError: { channel: 'preview', versionId: 'v3', message: 'quebrou', at: '2026-11-19T12:00:00.000Z' } }), plugin({ id: 'painel', name: 'Painel', scope: 'client', clientName: 'ACME', preview: null, slots: ['portal.dashboard.widgets'] })]
    render(<OwnerPluginsPage />)
    const row = within(screen.getByTestId('plugin-row-relogio'))
    expect(row.getByRole('link', { name: 'Relógio' }).getAttribute('href')).toBe('/plugins/relogio')
    expect(row.queryByRole('button', { name: 'Visualizar' })).toBeNull()
    expect(row.getByText('Prévia: quebrou')).toBeTruthy()
    expect(within(screen.getByTestId('plugin-row-painel')).getByText('· ACME')).toBeTruthy()
    expect((row.getByRole('checkbox', { name: 'Desativar Relógio' }) as HTMLInputElement).checked).toBe(true)

    fireEvent.click(row.getByRole('button', { name: /Debug|Logs/ }))
    expect(await screen.findByText('Logs — Relógio')).toBeTruthy()
  })

  it('desligar pede confirmação; ligar é direto', async () => {
    holder.list.data = [plugin(), plugin({ id: 'painel', name: 'Painel', active: false })]
    render(<OwnerPluginsPage />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ativar Painel' }))
    expect(holder.setActive).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Desativar Relógio' }))
    expect(holder.setActive).toHaveBeenCalledTimes(1)
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }))
    expect(holder.setActive).toHaveBeenLastCalledWith(false)
  })

  it('filtro Slot mostra só os plugins do slot escolhido', () => {
    holder.list.data = [plugin(), plugin({ id: 'mesa', name: 'Na mesa', slots: ['workbench.panel'] })]
    window.history.replaceState(null, '', '/plugins?slots=workbench.panel')
    render(<OwnerPluginsPage />)
    expect(screen.queryByTestId('plugin-row-relogio')).toBeNull()
    expect(screen.getByTestId('plugin-row-mesa')).toBeTruthy()
    window.history.replaceState(null, '', '/plugins')
  })

  it('filtro Slot com área: escolher "Dashboards" cobre as seções e o fim da página', () => {
    holder.list.data = [plugin({ slots: ['dashboard.section.financeiro'] }), plugin({ id: 'mesa', name: 'Na mesa', slots: ['workbench.panel'] })]
    window.history.replaceState(null, '', '/plugins?slots=area:dashboard')
    render(<OwnerPluginsPage />)
    expect(screen.getByTestId('plugin-row-relogio')).toBeTruthy()
    expect(screen.queryByTestId('plugin-row-mesa')).toBeNull()
    window.history.replaceState(null, '', '/plugins')
  })

  it('filtro Slot é uma busca em árvore: sem termo, recuada por nível; com termo, o resultado no caminho dele; marcar filtra', async () => {
    holder.list.data = [plugin({ slots: ['sidebar.nav.agentes'] }), plugin({ id: 'mesa', name: 'Na mesa', slots: ['workbench.panel'] })]
    render(<OwnerPluginsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Slot' }))
    const list = await screen.findByRole('listbox', { name: 'Slot' })
    const agentes = within(list).getByRole('option', { name: /Menu Agentes/ })
    expect(agentes.getAttribute('data-depth')).toBe('3')
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar slot' }), { target: { value: 'Agentes' } })
    await waitFor(() => expect(within(list).getAllByRole('option').map((option) => option.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Casca do app')])))
    const match = within(list).getByRole('option', { name: /Menu Agentes/ })
    expect(match.textContent).toContain('Dono › Casca do app › Barra lateral')
    fireEvent.click(match)
    expect(match.getAttribute('aria-checked')).toBe('true')
    await waitFor(() => expect(screen.queryByTestId('plugin-row-mesa')).toBeNull())
    expect(screen.getByTestId('plugin-row-relogio')).toBeTruthy()
    window.history.replaceState(null, '', '/plugins')
  })

  it('arquivados ficam fora por padrão; "Arquivados: Mostrar" os traz com o selo e o switch desabilitado', async () => {
    holder.list.data = [plugin(), plugin({ id: 'velho', name: 'Velho', active: false, archivedAt: '2026-11-19T12:00:00.000Z' })]
    render(<OwnerPluginsPage />)
    expect(screen.queryByTestId('plugin-row-velho')).toBeNull()
    fireEvent.click(screen.getByLabelText('Mostrar plugins arquivados'))
    const row = within(await screen.findByTestId('plugin-row-velho'))
    expect(row.getByText('Arquivado')).toBeTruthy()
    expect((row.getByRole('checkbox', { name: 'Ativar Velho' }) as HTMLInputElement).disabled).toBe(true)
    window.history.replaceState(null, '', '/plugins')
  })

  it('a linha mostra os slots com o caminho completo', () => {
    holder.list.data = [plugin({ slots: ['dashboard.section.financeiro'] })]
    render(<OwnerPluginsPage />)
    expect(screen.getByLabelText('Slot: Dashboards › Seção Financeiro').textContent).toBe('Seção Financeiro')
  })

  it('portal: switch sem debug', () => {
    holder.source = { kind: 'client', clientId: 'cli1' }
    holder.list.data = [plugin({ scope: 'client', clientId: 'cli1', clientName: 'ACME' })]
    render(<OwnerPluginsPage />)
    const row = within(screen.getByTestId('plugin-row-relogio'))
    expect(row.getByRole('checkbox')).toBeTruthy()
    expect(row.queryByRole('button', { name: /Debug|Logs/ })).toBeNull()
  })

  it('erro com tentar novamente', () => {
    holder.list = { data: [], isLoading: false, isError: true, refetch: vi.fn() }
    render(<OwnerPluginsPage />)
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(holder.list.refetch).toHaveBeenCalled()
  })

  it('carregando: esqueleto no formato da linha', () => {
    holder.list = { data: [], isLoading: true, isError: false, refetch: vi.fn() }
    render(<OwnerPluginsPage />)
    expect(screen.getByTestId('plugin-rows-skeleton')).toBeTruthy()
  })
})

describe('detalhe do plugin', () => {
  const versions = () => [summary(3, 'preview'), summary(2, 'stable'), summary(1, 'archived', { changeSummary: null, changeSummarySource: null })]

  it('só o switch Ativo; sem cards de diferença nem de prévia; Em uso na estável e o descritivo de cada versão', () => {
    holder.detail.data = { ...plugin(), versions: versions() }
    render(<OwnerPluginDetailPage id="relogio" />)
    expect(screen.queryByText(/Diferença/)).toBeNull()
    expect(screen.queryByText(/só aparece para quem ligar a prévia/)).toBeNull()
    expect(screen.queryByText('Ligar prévia')).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Desativar Relógio' })).toBeTruthy()
    expect(screen.getByText('Em uso')).toBeTruthy()
    expect(screen.getByTestId('plugin-version-summary-3').textContent).toBe('Mudança da v3')
    expect(screen.getByTestId('plugin-version-summary-1').textContent).toBe('Sem descritivo desta mudança')
    expect(screen.getByText(/Ferramentas: plugin_relogio_hora/)).toBeTruthy()
  })

  it('clicar numa versão arquivada pede confirmação e a põe em uso; a prévia e a estável não são clicáveis', async () => {
    holder.detail.data = { ...plugin(), versions: versions() }
    render(<OwnerPluginDetailPage id="relogio" />)
    expect(screen.queryByRole('button', { name: 'Usar a versão v3' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Usar a versão v2' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Usar a versão v1' }))
    expect(await screen.findByText('Usar a versão v1?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta versão' }))
    expect(holder.rollback).toHaveBeenCalledWith('v1', expect.anything())
  })

  it('depois do rollback (v1 em uso), a v2 arquivada passa a ser clicável', () => {
    holder.detail.data = { ...plugin({ stable: summary(1, 'stable'), preview: null }), versions: [summary(2, 'archived'), summary(1, 'stable')] }
    render(<OwnerPluginDetailPage id="relogio" />)
    expect(screen.getByRole('button', { name: 'Usar a versão v2' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Usar a versão v1' })).toBeNull()
  })

  it('dono: a linha da prévia tem Ver prévia (liga a prévia e abre a tela) e Aprovar prévia', async () => {
    holder.detail.data = { ...plugin(), versions: versions() }
    render(<OwnerPluginDetailPage id="relogio" />)
    fireEvent.click(screen.getByRole('button', { name: /Ver prévia/ }))
    await waitFor(() => expect(holder.push).toHaveBeenCalledWith('/dashboard'))
    expect(holder.preview).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: /Aprovar prévia/ }))
    expect(holder.approve).toHaveBeenCalled()
  })

  it('Gerar descritivo só na versão sem descritivo', () => {
    holder.detail.data = { ...plugin(), versions: versions() }
    render(<OwnerPluginDetailPage id="relogio" />)
    const buttons = screen.getAllByRole('button', { name: /Gerar descritivo/ })
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0]!)
    expect(holder.summary).toHaveBeenCalledWith('v1')
  })

  it('o debug do cabeçalho abre a coluna de logs', async () => {
    holder.detail.data = { ...plugin(), versions: versions() }
    render(<OwnerPluginDetailPage id="relogio" />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir logs de debug' }))
    expect(await screen.findByTestId('console')).toBeTruthy()
  })

  it('erro de runtime aparece como alerta; sem versões, estado vazio', () => {
    holder.detail.data = { ...plugin({ runtimeError: { channel: 'stable', versionId: 'v2', message: 'falha ao importar', at: '2026-11-19T12:00:00.000Z' } }), versions: [] }
    render(<OwnerPluginDetailPage id="relogio" />)
    expect(screen.getByRole('alert').textContent).toContain('falha ao importar')
    expect(screen.getByText('Nenhuma versão ainda')).toBeTruthy()
  })

  it('portal: Ver e Aprovar prévia na linha da prévia; sem runtime, sem debug e sem Gerar descritivo', async () => {
    holder.source = { kind: 'client', clientId: 'cli1' }
    holder.detail.data = { ...plugin({ scope: 'client', clientId: 'cli1', clientName: 'ACME' }), versions: versions() }
    render(<ClientePluginDetailPage id="relogio" />)
    fireEvent.click(screen.getByRole('button', { name: /Aprovar prévia/ }))
    expect(holder.approve).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Ver prévia/ })).toBeTruthy()
    expect(screen.queryByText('Runtime no servidor')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Abrir logs de debug' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Gerar descritivo/ })).toBeNull()
    await waitFor(() => expect(screen.getAllByText('OPE-172').every((node) => node.tagName === 'SPAN')).toBe(true))
  })

  it('Arquivar pede confirmação; arquivado mostra o selo, Desarquivar, o switch desabilitado e nenhuma versão clicável', async () => {
    holder.detail.data = { ...plugin({ preview: null, previewWorkbenchId: null }), versions: [summary(2, 'stable'), summary(1, 'archived')] }
    const { unmount } = render(<OwnerPluginDetailPage id="relogio" />)
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar Relógio' }))
    expect(await screen.findByText('Arquivar Relógio?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }))
    expect(holder.archive).toHaveBeenCalledWith(true)
    unmount()

    // Estado depois da mutação (o que a resposta otimista e o refetch deixam na tela).
    holder.detail.data = { ...plugin({ active: false, archivedAt: '2026-11-19T13:00:00.000Z', preview: null, previewWorkbenchId: null }), versions: [summary(2, 'stable'), summary(1, 'archived')] }
    render(<OwnerPluginDetailPage id="relogio" />)
    expect(screen.getByText('Arquivado')).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: 'Ativar Relógio' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Usar a versão v1' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Desarquivar Relógio' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Desarquivar' }))
    expect(holder.archive).toHaveBeenLastCalledWith(false)
  })

  it('carregando: esqueleto do detalhe', () => {
    holder.detail = { data: null, isPending: true, isError: false, error: null, refetch: vi.fn() }
    render(<OwnerPluginDetailPage id="relogio" />)
    expect(screen.getByTestId('plugin-detail-skeleton')).toBeTruthy()
  })
})

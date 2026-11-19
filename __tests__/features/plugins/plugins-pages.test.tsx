/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Telas de Plugins (OPE-172): lista com filtros e estados, detalhe com versões, diferença, prévia e
 * rollback (com confirmação e o estado depois da mutação), e a aprovação da prévia no portal.
 */

const holder = vi.hoisted(() => ({
  list: { data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() },
  detail: { data: null as unknown, isPending: false, isError: false, error: null, refetch: vi.fn() },
  rollback: vi.fn(),
  approve: vi.fn(),
  setActive: vi.fn(),
  source: { kind: 'owner', clientId: null },
  push: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: holder.push }), usePathname: () => '/plugins', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/api', () => ({ api: {}, apiErrorMessage: (_e: unknown, fallback: string) => fallback, apiErrorCode: () => null, unwrapApi: (v: unknown) => v }))
vi.mock('@/features/plugins/client/PluginSourceContext', () => ({ usePluginSource: () => holder.source }))
vi.mock('@/features/plugins/hooks/usePlugins', () => ({
  usePluginsRealtime: () => undefined,
  usePlugins: () => holder.list,
  usePlugin: () => holder.detail,
  usePluginDiff: () => ({ isPending: false, isError: false, data: { from: { id: 'v1', number: 1 }, to: { id: 'v2', number: 2 }, files: [{ path: 'client/index.tsx', status: 'modified', additions: 1, deletions: 1, patch: '--- a/client/index.tsx\n+++ b/client/index.tsx\n@@ -1 +1 @@\n-antes\n+depois' }] } }),
  usePluginKernel: () => ({ isPending: false, data: { mode: 'full', fibers: [{ pluginId: 'relogio', channel: 'stable', effects: ['tool:plugin_relogio_hora'], warning: null }], tools: [{ pluginId: 'relogio', name: 'plugin_relogio_hora', channel: 'stable' }], routes: [], crons: [] } }),
  usePluginRuntime: () => ({ isPending: false, data: { plugins: [], previewOn: [] } }),
  useTogglePluginPreview: () => ({ mutate: vi.fn(), isPending: false }),
  useRollbackPlugin: () => ({ mutate: holder.rollback, isPending: false }),
  useSetPluginActive: () => ({ mutate: holder.setActive, isPending: false }),
  useApprovePluginPreview: () => ({ mutate: holder.approve, isPending: false }),
}))

import { OwnerPluginDetailPage, OwnerPluginsPage, ClientePluginDetailPage } from '@/features/plugins/components/PluginPages'

const summary = (number: number, state: string, extra: Record<string, unknown> = {}) => ({ id: `v${number}`, number, state, author: 'local', source: { taskId: 't1', taskCode: 'OPE-172', workbenchId: 'wb1' }, baseVersionId: null, tests: ['client/index.test.tsx'], hasServer: true, hasClient: true, createdAt: '2026-11-19T12:00:00.000Z', promotedAt: state === 'draft' || state === 'preview' ? null : '2026-11-19T12:00:00.000Z', ...extra })
const plugin = (overrides: Record<string, unknown> = {}) => ({
  id: 'relogio',
  name: 'Relógio',
  description: 'Hora no dashboard',
  scope: 'owner',
  clientId: null,
  clientName: null,
  apiVersion: '1.0',
  active: true,
  stable: summary(2, 'stable'),
  preview: summary(3, 'preview'),
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
  holder.rollback.mockReset()
  holder.approve.mockReset()
})

describe('lista de plugins', () => {
  it('estado vazio com a orientação de criar uma tarefa Plugin', () => {
    render(<OwnerPluginsPage />)
    expect(screen.getByText('Nenhum plugin ainda')).toBeTruthy()
    expect(screen.getByText(/Crie uma tarefa do tipo Plugin/)).toBeTruthy()
  })

  it('lista com escopo, versões e erro de runtime; abrir vai ao detalhe', () => {
    holder.list.data = [plugin({ runtimeError: { channel: 'preview', versionId: 'v3', message: 'quebrou', at: '2026-11-19T12:00:00.000Z' } }), plugin({ id: 'painel', name: 'Painel', scope: 'client', clientName: 'ACME', preview: null })]
    render(<OwnerPluginsPage />)
    const row = within(screen.getByTestId('plugin-row-relogio'))
    expect(row.getByText('Prévia: quebrou')).toBeTruthy()
    expect(row.getByText('v2')).toBeTruthy()
    expect(row.getByText('v3')).toBeTruthy()
    expect(within(screen.getByTestId('plugin-row-painel')).getByText('· ACME')).toBeTruthy()
    fireEvent.click(row.getByRole('button', { name: 'Visualizar' }))
    expect(holder.push).toHaveBeenCalledWith('/plugins/relogio')
  })

  it('erro com tentar novamente', () => {
    holder.list = { data: [], isLoading: false, isError: true, refetch: vi.fn() }
    render(<OwnerPluginsPage />)
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(holder.list.refetch).toHaveBeenCalled()
  })
})

describe('detalhe do plugin', () => {
  it('mostra as versões, a diferença, o runtime e faz rollback com confirmação', async () => {
    holder.detail.data = { ...plugin(), versions: [summary(3, 'preview'), summary(2, 'stable'), summary(1, 'archived')] }
    render(<OwnerPluginDetailPage id="relogio" />)
    expect(screen.getByText('Diferença v1 → v2')).toBeTruthy()
    expect(screen.getByText('+depois')).toBeTruthy()
    expect(screen.getByText(/Ferramentas: plugin_relogio_hora/)).toBeTruthy()
    expect(screen.getByText(/só aparece para quem ligar a prévia/)).toBeTruthy()
    // Só a v1 (consolidada antes) oferece rollback; a estável atual e a prévia não.
    expect(within(screen.getByTestId('plugin-version-2')).queryByRole('button', { name: /Rollback/ })).toBeNull()
    expect(within(screen.getByTestId('plugin-version-3')).queryByRole('button', { name: /Rollback/ })).toBeNull()
    fireEvent.click(within(screen.getByTestId('plugin-version-1')).getByRole('button', { name: /Rollback/ }))
    expect(await screen.findByText('Voltar para a versão 1?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fazer rollback' }))
    expect(holder.rollback).toHaveBeenCalledWith('v1', expect.anything())
  })

  it('depois do rollback (v1 estável), a v2 arquivada passa a oferecer rollback', () => {
    holder.detail.data = { ...plugin({ stable: summary(1, 'stable'), preview: null }), versions: [summary(2, 'archived'), summary(1, 'stable')] }
    render(<OwnerPluginDetailPage id="relogio" />)
    expect(within(screen.getByTestId('plugin-version-2')).getByRole('button', { name: /Rollback/ })).toBeTruthy()
    expect(within(screen.getByTestId('plugin-version-1')).queryByRole('button', { name: /Rollback/ })).toBeNull()
  })

  it('erro de runtime aparece como alerta; sem versões, estado vazio', () => {
    holder.detail.data = { ...plugin({ runtimeError: { channel: 'stable', versionId: 'v2', message: 'falha ao importar', at: '2026-11-19T12:00:00.000Z' } }), versions: [] }
    render(<OwnerPluginDetailPage id="relogio" />)
    expect(screen.getByRole('alert').textContent).toContain('falha ao importar')
    expect(screen.getByText('Nenhuma versão ainda')).toBeTruthy()
  })

  it('portal: o admin do cliente aprova a prévia e não vê o runtime do servidor', async () => {
    holder.source = { kind: 'client', clientId: 'cli1' }
    holder.detail.data = { ...plugin({ scope: 'client', clientId: 'cli1', clientName: 'ACME' }), versions: [summary(3, 'preview'), summary(2, 'stable')] }
    render(<ClientePluginDetailPage id="relogio" />)
    fireEvent.click(screen.getByRole('button', { name: /Aprovar prévia/ }))
    expect(holder.approve).toHaveBeenCalled()
    expect(screen.queryByText('Runtime no servidor')).toBeNull()
    // No portal a origem da versão é só o código (sem link para a tarefa do app do dono).
    await waitFor(() => expect(screen.getAllByText('OPE-172').every((node) => node.tagName === 'SPAN')).toBe(true))
  })
})

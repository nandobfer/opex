/** @vitest-environment happy-dom */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Slots de interface (OPE-172): o slot monta os componentes que os plugins vigentes declararam, cada
 * um com fronteira de erro própria; sem contribuição não renderiza nada; trocar de revisão (prévia,
 * consolidação, rollback) troca o componente sem recarregar a página.
 */

const holder = vi.hoisted(() => ({
  runtime: { plugins: [] as unknown[], previewOn: [] as string[] },
  modules: new Map<string, unknown>(),
  post: vi.fn(async () => ({ data: {} })),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/lib/api', () => ({ api: { post: holder.post }, apiErrorMessage: (_e: unknown, fallback: string) => fallback, unwrapApi: (value: unknown) => value }))
vi.mock('@/features/plugins/hooks/usePlugins', () => ({
  usePluginsRealtime: () => undefined,
  usePluginRuntime: () => ({ data: holder.runtime, isPending: false, isError: false }),
}))
vi.mock('@/features/plugins/client/loader', () => ({
  loadPluginClient: async (entry: { revision: string }) => {
    const loaded = holder.modules.get(entry.revision)
    if (loaded instanceof Error) throw loaded
    return loaded
  },
  ensurePluginCss: async () => undefined,
  pluginExport: (module: { slots?: Record<string, unknown> }, kind: 'slots', name: string) => module?.[kind]?.[name] ?? null,
}))

import { PluginSlot, slotContributions } from '@/features/plugins/client/PluginSlot'
import { usePluginHost } from '@/features/plugins/client/sdk'

const entry = (id: string, revision: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id === 'relogio' ? 'Relógio' : 'Quebrado',
  versionId: `v-${revision}`,
  versionNumber: Number(revision.split('-')[0]),
  channel: 'stable',
  revision,
  bundleUrl: '/x.js',
  cssUrl: null,
  slots: [{ slot: 'dashboard.widgets', export: 'Widget', title: null, order: 100 }],
  pages: [],
  nav: [],
  ...overrides,
})

function Relogio({ label }: { label: string }) {
  const host = usePluginHost()
  return <p>{`${label} · v${host.versionNumber} · ${host.channel}`}</p>
}

const renderSlot = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const ui = () => (
    <QueryClientProvider client={client}>
      <PluginSlot name="dashboard.widgets" props={{}} />
    </QueryClientProvider>
  )
  const view = render(ui())
  return { ...view, rerenderSlot: () => view.rerender(ui()) }
}

beforeEach(() => {
  holder.post.mockClear()
  holder.runtime = { plugins: [], previewOn: [] }
  holder.modules.clear()
})

describe('PluginSlot', () => {
  it('sem contribuição não renderiza nada', () => {
    const { container } = renderSlot()
    expect(container.innerHTML).toBe('')
  })

  it('monta o widget com o host do plugin e isola o erro de outro plugin', async () => {
    function Broken(): React.ReactNode {
      throw new Error('falha no render')
    }
    holder.modules.set('1-a', { slots: { Widget: () => <Relogio label="Relógio" /> } })
    holder.modules.set('3-b', { slots: { Widget: Broken } })
    holder.runtime = { plugins: [entry('relogio', '1-a'), entry('quebrado', '3-b', { slots: [{ slot: 'dashboard.widgets', export: 'Widget', title: null, order: 1 }] })], previewOn: [] }
    renderSlot()
    expect(await screen.findByText('Relógio · v1 · stable')).toBeTruthy()
    expect(await screen.findByText('O plugin Quebrado falhou')).toBeTruthy()
    expect(screen.getByText('falha no render')).toBeTruthy()
    // O erro vai para o debug do plugin (uma vez por revisão e mensagem).
    await waitFor(() => expect(holder.post).toHaveBeenCalledWith('/plugins/quebrado/logs', expect.objectContaining({ message: 'falha no render', channel: 'stable', where: 'slot Widget' })))
  })

  it('falha ao carregar o módulo também vai para o debug', async () => {
    holder.modules.set('4-c', new Error("Identifier 'm' has already been declared"))
    holder.runtime = { plugins: [entry('relogio', '4-c')], previewOn: [] }
    renderSlot()
    expect(await screen.findByText("Identifier 'm' has already been declared")).toBeTruthy()
    await waitFor(() => expect(holder.post).toHaveBeenCalledWith('/plugins/relogio/logs', expect.objectContaining({ message: "Identifier 'm' has already been declared", where: 'carregar o módulo (slot Widget)' })))
  })

  it('a troca de revisão (prévia ligada) troca o componente ao vivo, com o selo da prévia', async () => {
    holder.modules.set('1-a', { slots: { Widget: () => <Relogio label="Estável" /> } })
    holder.modules.set('2-b', { slots: { Widget: () => <Relogio label="Nova" /> } })
    holder.runtime = { plugins: [entry('relogio', '1-a')], previewOn: [] }
    const view = renderSlot()
    expect(await screen.findByText('Estável · v1 · stable')).toBeTruthy()

    holder.runtime = { plugins: [entry('relogio', '2-b', { channel: 'preview' })], previewOn: ['relogio'] }
    view.rerenderSlot()
    expect(await screen.findByText('Nova · v2 · preview')).toBeTruthy()
    expect(screen.getByText('Prévia v2')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Estável · v1 · stable')).toBeNull())
  })

  it('export ausente vira aviso em pt-BR no slot', async () => {
    holder.modules.set('1-a', { slots: {} })
    holder.runtime = { plugins: [entry('relogio', '1-a')], previewOn: [] }
    renderSlot()
    expect(await screen.findByText('O plugin não exporta "Widget"')).toBeTruthy()
  })
})

describe('slotContributions', () => {
  it('ordena por order e depois pelo nome', () => {
    const items = slotContributions([entry('relogio', '1-a') as never, entry('quebrado', '3-b', { slots: [{ slot: 'dashboard.widgets', export: 'W', title: null, order: 1 }] }) as never], 'dashboard.widgets')
    expect(items.map((item) => item.entry.id)).toEqual(['quebrado', 'relogio'])
  })
})

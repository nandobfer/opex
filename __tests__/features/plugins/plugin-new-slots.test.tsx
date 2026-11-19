/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Slots novos (OPE-172, rodada 3): a aba de plugin na tarefa do portal (`portal.task.panel`) monta o
 * componente com `{ taskId, clientId }`; o menu do portal (`portal.nav`) leva às páginas `/cliente/x/...`.
 */

const holder = vi.hoisted(() => ({ props: null as unknown }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/lib/api', () => ({ api: {}, apiErrorMessage: (_e: unknown, fallback: string) => fallback, unwrapApi: (v: unknown) => v }))
vi.mock('@/features/plugins/client/PluginSourceContext', () => ({ usePluginSource: () => ({ kind: 'client', clientId: 'cli1' }) }))
vi.mock('@/features/plugins/client/usePluginSlotTabs', () => ({
  usePluginSlotTabs: (slot: string) => (slot === 'portal.task.panel' ? [{ id: 'plugin:painel:Aba', label: 'Painel do cliente', entry: { id: 'painel', revision: '1-a' }, slot: { export: 'Aba' } }] : []),
}))
vi.mock('@/features/plugins/client/PluginContribution', () => ({
  PluginContribution: ({ props }: { props: unknown }) => {
    holder.props = props
    return <p>conteúdo do plugin</p>
  },
}))
vi.mock('@/features/orcamentos/portal/components/ClienteAttachmentsSection', () => ({ ClienteAttachmentsSection: () => null }))
vi.mock('@/features/orcamentos/portal/components/ClienteCommentsSection', () => ({ ClienteCommentsSection: () => null }))
vi.mock('@/features/tasks/components/detail/TaskDetailSections', () => ({ TaskDescription: () => <p>descrição</p>, TaskTechnicalSpec: () => null }))

import { ClienteTaskTabs, type ClienteTaskTabId } from '@/features/orcamentos/portal/components/ClienteTaskTabs'
import { pluginNavSection } from '@/features/plugins/client/usePluginNav'

function Tabs() {
  const [tab, setTab] = React.useState<ClienteTaskTabId>('description')
  return <ClienteTaskTabs task={{ id: 't1', attachmentsCount: 0, comments: [], description: '', technicalSpec: '' } as never} value={tab} onValueChange={setTab} />
}

describe('slots novos', () => {
  it('portal.task.panel: a aba do plugin aparece e monta com a tarefa e o cliente', () => {
    render(<Tabs />)
    expect(screen.getByText('descrição')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Painel do cliente' }))
    expect(screen.getByText('conteúdo do plugin')).toBeTruthy()
    expect(holder.props).toEqual({ taskId: 't1', clientId: 'cli1' })
  })

  it('portal.nav: itens do menu do portal levam a /cliente/x/{id}/{página}', () => {
    const section = pluginNavSection([{ id: 'painel', nav: [{ label: 'Painel', page: 'resumo', icon: 'Puzzle' }] }] as never, 'client')
    expect(section?.items.map((item) => item.href)).toEqual(['/cliente/x/painel/resumo'])
    expect(pluginNavSection([{ id: 'relogio', nav: [{ label: 'Hora', page: '', icon: 'Puzzle' }] }] as never)?.items[0]?.href).toBe('/x/relogio')
  })
})

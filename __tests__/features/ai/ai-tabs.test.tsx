/** @vitest-environment happy-dom */
import React, { useEffect, useImperativeHandle } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))

import { AI_TAB_ALIASES, AI_TABS } from '@/features/ai/constants'
import { AI_EDITOR_TABS } from '@/features/ai/tabs'
import { canonicalAliasUrl, parseTab } from '@/features/integrations/components/tabs/useIntegrationTab'
import { MergedFeaturesTab } from '@/features/ai/components/shared/MergedFeaturesTab'
import type { FeatureSectionProps } from '@/features/ai/components/shared/feature-section'

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('abas de Integrações › Inteligência Artificial (OPE-122)', () => {
  it('Provedores primeiro e depois os agentes, na ordem do fluxo e sem "Agente"', () => {
    expect(AI_EDITOR_TABS.map((tab) => tab.label)).toEqual(['Provedores', 'Opex', 'Maddox', 'Orçamentista', 'Catalogador', 'Refinador', 'Desenvolvedor', 'Arquiteto', 'Adversário', 'Revisor', 'Mentor', 'Rotineiros'])
    expect(AI_EDITOR_TABS.map((tab) => tab.id)).toEqual([...AI_TABS])
  })

  it('links antigos abrem a aba nova; Entender tarefas e desconhecido abrem Provedores', () => {
    const tab = (value: string) => parseTab(`?aba=${value}`, AI_TABS, 'provedores', 'aba', AI_TAB_ALIASES)
    expect(tab('orcamentos')).toBe('orcamentista')
    expect(tab('estimar-prazos')).toBe('orcamentista')
    expect(tab('resumos-tarefas')).toBe('catalogador')
    expect(tab('tags-tarefas')).toBe('catalogador')
    expect(tab('entender-tarefas')).toBe('provedores')
    expect(tab('qualquer-coisa')).toBe('provedores')
    expect(tab('revisao-pr')).toBe('revisao-pr')
  })

  it('o link antigo vira a URL canônica com a seção a destacar', () => {
    const location = { pathname: '/integracoes/ia', search: '?aba=estimar-prazos&x=1', hash: '' }
    expect(canonicalAliasUrl(location, AI_TAB_ALIASES, 'provedores')).toBe('/integracoes/ia?aba=orcamentista&x=1&secao=estimate-hours')
    expect(canonicalAliasUrl({ ...location, search: '?aba=entender-tarefas' }, AI_TAB_ALIASES, 'provedores')).toBe('/integracoes/ia')
    expect(canonicalAliasUrl({ ...location, search: '?aba=orcamentista' }, AI_TAB_ALIASES, 'provedores')).toBeNull()
  })
})

function FakeSection({ ref, onStateChange, dirty, save }: FeatureSectionProps & { dirty: boolean; save: () => Promise<boolean> }) {
  useEffect(() => onStateChange({ dirty, savable: dirty, pending: false }), [dirty, onStateChange])
  useImperativeHandle(ref, () => ({ save, undo: vi.fn() }), [save])
  return <p>seção</p>
}

describe('aba fundida com um rodapé único', () => {
  it('Salvar grava só as seções alteradas, em sequência, e avisa qual falhou', async () => {
    const saveA = vi.fn(async () => true)
    const saveB = vi.fn(async () => false)
    const saveC = vi.fn(async () => true)
    const onDirty = vi.fn()
    render(
      <MergedFeaturesTab
        onDirtyChange={onDirty}
        sections={[
          { id: 'a', title: 'Orçamentos', render: (props) => <FakeSection {...props} dirty save={saveA} /> },
          { id: 'b', title: 'Estimar prazos', render: (props) => <FakeSection {...props} dirty save={saveB} /> },
          { id: 'c', title: 'Intocada', render: (props) => <FakeSection {...props} dirty={false} save={saveC} /> },
        ]}
      />,
    )
    expect(onDirty).toHaveBeenLastCalledWith(true)
    expect(screen.getAllByRole('button', { name: /Salvar/ })).toHaveLength(1)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    })
    expect(saveA).toHaveBeenCalledTimes(1)
    expect(saveB).toHaveBeenCalledTimes(1)
    expect(saveC).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('Não foi possível salvar: Estimar prazos. Salva: Orçamentos')
  })

  it('cada feature tem a própria seção (âncora dos links antigos)', () => {
    render(<MergedFeaturesTab onDirtyChange={vi.fn()} sections={[{ id: 'task-summary', title: 'Resumos de tarefas', render: (props) => <FakeSection {...props} dirty={false} save={vi.fn(async () => true)} /> }]} />)
    expect(document.getElementById('ai-section-task-summary')?.getAttribute('aria-label')).toBe('Resumos de tarefas')
    expect((screen.getByRole('button', { name: /Salvar/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})

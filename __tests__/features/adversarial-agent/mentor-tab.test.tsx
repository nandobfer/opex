/** @vitest-environment happy-dom */

import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Aba "Agente Mentor" montada inteira, com a configuração salva (decisor e redator com provedor,
 * modelo e variante), depois de salvar e dentro da página Inteligência Artificial (AiEditorForm, num <form>):
 * cobre crash de render e o bug do Radix Select que apaga o valor salvo ao carregar (MT-3).
 */

const mocks = vi.hoisted(() => ({
  settingsQuery: null as unknown,
  mutateAsync: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/ai/hooks/useAi', () => ({
  useAiFeatureRealtime: vi.fn(),
  // Como o hook real: o JEV (decisão estruturada) só entra com `includeAll`.
  useAiProviderStatuses: (includeAll = false) => ({
    providers: (includeAll ? ['gemini', 'anthropic', 'jev'] : ['gemini', 'anthropic']).map((id) => ({ id, name: id === 'jev' ? 'JEV' : id, configured: true, connected: true })),
  }),
  useAiModels: (provider: string | null) => ({
    data:
      provider === 'gemini'
        ? [{ id: 'flash', name: 'Gemini Flash', variants: ['low', 'high'], group: null, contextWindow: null, free: false }]
        : provider === 'anthropic'
          ? [{ id: 'claude', name: 'Claude Sonnet', variants: ['medium', 'high'], group: null, contextWindow: null, free: false }]
          : [],
    isLoading: false,
    isError: false,
    error: null,
  }),
}))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useCentrals: () => ({ data: [], isLoading: false }) }))
vi.mock('@/features/adversarial-agent/hooks/useMentor', () => ({
  useMentorSettings: () => mocks.settingsQuery,
  useSaveMentorSettings: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
  useMentorRuns: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useMentorRealtime: vi.fn(),
  useMentorRunDecision: () => ({ mutate: vi.fn(), isPending: false }),
}))

// Demais abas e peças da página: fora do escopo deste teste.
const { stub } = vi.hoisted(() => ({ stub: (name: string) => ({ [name]: () => null }) }))
vi.mock('@/features/integrations/components/detail/DetailHeader', () => stub('DetailHeader'))
vi.mock('@/features/integrations/components/detail/DetailActions', () => stub('DetailActions'))
vi.mock('@/features/integrations/components/detail/GeneralCard', () => stub('GeneralCard'))
vi.mock('@/features/ai/components/AiProvidersTab', () => stub('AiProvidersTab'))
vi.mock('@/features/ai/components/understand-task/UnderstandTaskTab', () => stub('UnderstandTaskTab'))
vi.mock('@/features/ai/components/task-summary/TaskSummaryTab', () => stub('TaskSummaryTab'))
vi.mock('@/features/ai/components/task-tags/TaskTagsTab', () => stub('TaskTagsTab'))
vi.mock('@/features/ai/components/budget-preview/BudgetPreviewTab', () => stub('BudgetPreviewTab'))
vi.mock('@/features/ai/components/memory-summary/MemorySummaryTab', () => stub('MemorySummaryTab'))
vi.mock('@/features/ai/components/estimate-hours/EstimateHoursTab', () => stub('EstimateHoursTab'))
vi.mock('@/features/ai/components/task-refinement/TaskRefinementTab', () => stub('TaskRefinementTab'))
vi.mock('@/features/agentic/components/settings/AgenticTab', () => stub('AgenticTab'))
vi.mock('@/features/pr-review/components/PrReviewTab', () => stub('PrReviewTab'))
vi.mock('@/features/opex-agent/components/settings/OpexAgentTab', () => ({ OpexAgentTab: () => null, OPEX_AI_TAB_DEF: { id: 'agente-opex', label: 'Agente Opex', icon: () => null } }))
vi.mock('@/features/adversarial-agent/components/settings/AdversarialAgentTab', () => ({
  AdversarialAgentTab: () => null,
  ADVERSARIAL_AI_TAB_DEF: { id: 'agente-adversario', label: 'Agente Adversário', icon: () => null },
}))

import { AiEditorForm } from '@/features/ai/components/AiEditorForm'
import { MentorAgentTab } from '@/features/adversarial-agent/components/mentor/MentorAgentTab'
import { DEFAULT_MENTOR_SETTINGS, type MentorSettings } from '@/features/adversarial-agent/mentor/schemas'
import type { MentorSettingsDto } from '@/features/adversarial-agent/mentor/types'

const SAVED: MentorSettings = {
  ...structuredClone(DEFAULT_MENTOR_SETTINGS),
  enabled: true,
  decider: { provider: 'gemini', model: 'flash', variant: 'high' },
  level: 'selective',
  writer: { ...DEFAULT_MENTOR_SETTINGS.writer, provider: 'anthropic', model: 'claude', variant: 'medium' },
  saveMode: 'suggest',
  context: { ...DEFAULT_MENTOR_SETTINGS.context, approvedPlan: true },
}
const dto = (settings: MentorSettings): MentorSettingsDto => ({ settings, isDefault: false, availability: { available: true, reason: null }, updatedAt: '2026-10-29T12:00:00.000Z' })

const trigger = (id: string) => document.getElementById(id) as HTMLElement
const saveButton = () => screen.getByRole('button', { name: /Salvar/ }) as HTMLButtonElement
const dirtyCalls = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.filter(([dirty]) => dirty === true)

/** Dentro de um <form>, como na página (AiEditorForm usa um motion.form). */
const renderTab = (onDirtyChange = vi.fn()) => ({ onDirtyChange, ...render(<form><MentorAgentTab onDirtyChange={onDirtyChange} /></form>) })

function expectSavedValuesShown() {
  expect(trigger('mentor-decider-model').textContent).toContain('Gemini Flash')
  expect(trigger('mentor-decider-variant').textContent).toContain('high')
  expect(trigger('mentor-writer-model').textContent).toContain('Claude Sonnet')
  expect(trigger('mentor-writer-variant').textContent).toContain('medium')
  expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('Seletivo')
}

beforeEach(() => {
  mocks.settingsQuery = { data: dto(SAVED), isLoading: false, isError: false, refetch: vi.fn() }
  mocks.mutateAsync.mockReset()
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('aba Agente Mentor com a configuração salva', () => {
  it('monta a tela inteira com provedor, modelo e variante salvos, sem nascer alterada', () => {
    const { onDirtyChange } = renderTab()
    expectSavedValuesShown()
    expect(screen.getByText('Gatilhos')).toBeTruthy()
    expect(screen.getByText('Redator e gravação')).toBeTruthy()
    expect((screen.getByRole('radio', { name: 'Sugerir e aguardar aprovação' }) as HTMLElement).getAttribute('aria-checked')).toBe('true')
    expect(dirtyCalls(onDirtyChange)).toEqual([])
    expect(saveButton().disabled).toBe(true)
  })

  it('salvar envia os valores salvos intactos e, com a resposta, volta ao estado limpo mostrando os mesmos valores', async () => {
    const next = { ...SAVED, triggers: { ...SAVED.triggers, developer: { ...SAVED.triggers.developer, skipDecider: true } } }
    mocks.mutateAsync.mockResolvedValue(dto(next))
    const { onDirtyChange } = renderTab()
    const skip = screen.getByLabelText(/Pedidos do desenvolvedor pulam o decisor/) as HTMLInputElement
    fireEvent.click(skip)
    expect(skip.checked).toBe(true)
    await vi.waitFor(() => expect(saveButton().disabled).toBe(false))
    await act(async () => {
      fireEvent.click(saveButton())
    })
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ decider: SAVED.decider, writer: SAVED.writer, level: 'selective', triggers: expect.objectContaining({ developer: expect.objectContaining({ skipDecider: true }) }) }))
    expect(onDirtyChange.mock.calls.at(-1)).toEqual([false])
    expect(saveButton().disabled).toBe(true)
    expectSavedValuesShown()
  })

  it('decisor: o JEV conectado pode ser escolhido (não aparece como "não conectado")', () => {
    renderTab()
    const jev = screen.getByRole('radio', { name: 'JEV' })
    expect(jev.hasAttribute('disabled') || jev.getAttribute('aria-disabled') === 'true').toBe(false)
    expect(jev.getAttribute('title') ?? '').not.toContain('não conectado')
  })

  it('seções Contexto e Execuções montam com o estado salvo', () => {
    renderTab()
    fireEvent.click(screen.getByRole('radio', { name: 'Contexto' }))
    expect((screen.getByLabelText(/^Plano aprovado/) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/^Mensagem do usuário/) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Execuções' }))
    expect(screen.getByText('Nenhuma execução ainda')).toBeTruthy()
  })
})

describe('página Inteligência Artificial (AiEditorForm)', () => {
  const page = () => (
    <AiEditorForm def={{} as never} data={{} as never} draft={{} as never} setDraft={vi.fn()} dirty={false} pending={false} onSave={vi.fn(async () => true)} onUndo={vi.fn()} />
  )

  it('?aba=agente-mentor monta a aba com a configuração salva, logo depois do Agente Adversário', () => {
    window.history.replaceState(null, '', '/integracoes/ia?aba=agente-mentor')
    render(page())
    expect(screen.getByRole('tab', { name: /Agente Mentor/ })).toBeTruthy()
    const names = screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())
    expect(names.indexOf('Agente Mentor')).toBe(names.indexOf('Agente Adversário') + 1)
    expectSavedValuesShown()
  })

  it('a aba do desenvolvimento agêntico se chama "Agente Desenvolvedor" e usa o ícone </> (code-xml)', () => {
    window.history.replaceState(null, '', '/integracoes/ia?aba=agente-mentor')
    render(page())
    expect(screen.getByRole('tablist', { name: 'Seções de Inteligência Artificial' })).toBeTruthy()
    const tab = screen.getByRole('tab', { name: /Agente Desenvolvedor/ })
    expect(tab.querySelector('svg')?.getAttribute('class')).toContain('lucide-code-xml')
    expect(screen.queryByRole('tab', { name: /Desenvolvimento agêntico/ })).toBeNull()
  })
})

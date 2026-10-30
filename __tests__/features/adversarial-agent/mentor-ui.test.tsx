/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), runs: [] as unknown[] }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiModels: () => ({ data: [], isLoading: false, isError: false }) }))
vi.mock('@/features/adversarial-agent/hooks/useMentor', () => ({
  useMentorRuns: () => ({ data: mocks.runs, isLoading: false, isError: false, refetch: vi.fn() }),
  useMentorRealtime: vi.fn(),
  useMentorRunDecision: () => ({ mutate: mocks.mutate, isPending: false }),
}))

import { MentorDeciderCard } from '@/features/adversarial-agent/components/mentor/MentorDeciderCard'
import { MentorRouterCard } from '@/features/adversarial-agent/components/mentor/MentorRouterCard'
import { MentorTriggersCard } from '@/features/adversarial-agent/components/mentor/MentorTriggersCard'
import { MentorRunsSection } from '@/features/adversarial-agent/components/mentor/MentorRunsSection'
import { DEFAULT_MENTOR_SETTINGS, type MentorSettings } from '@/features/adversarial-agent/mentor/schemas'
import type { MentorRunDto } from '@/features/adversarial-agent/mentor/types'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.runs = []
})

function WithForm({ children }: { children: (form: ReturnType<typeof useForm<MentorSettings>>) => React.ReactNode }) {
  const form = useForm<MentorSettings>({ defaultValues: structuredClone(DEFAULT_MENTOR_SETTINGS) })
  return <>{children(form)}</>
}

const run = (overrides: Partial<MentorRunDto> = {}): MentorRunDto => ({
  id: 'r1',
  workbenchId: 'w1',
  centralId: 'c1',
  taskId: 't1',
  taskCode: 'OPE-746',
  taskTitle: 'Modelos',
  sources: ['user', 'developer'],
  trigger: 'preview_correction',
  userMessage: 'Salvar derrubou o app',
  lessonCount: 1,
  status: 'suggested',
  level: 'balanced',
  score: 0.82,
  threshold: 0.65,
  deciderReason: 'Genérico',
  target: 'adversarial',
  routerConfidence: 0.7,
  routerReason: 'classe de erro de revisão',
  routerProbabilities: null,
  writerAction: 'create',
  writerReason: 'novo',
  sanitizerReason: null,
  proposal: { action: 'create', memoryId: null, text: 'Confira providers.', target: 'adversarial', centralId: null },
  memoryId: null,
  error: null,
  costUsd: 0.01,
  durationMs: 1200,
  createdAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  ...overrides,
})

describe('aba do Agente Mentor', () => {
  it('rigor da curadoria: 5 níveis; trocar o nível troca o limiar e o que grava', () => {
    render(<WithForm>{(form) => <MentorDeciderCard form={form} providers={[]} />}</WithForm>)
    for (const label of ['Generoso', 'Receptivo', 'Equilibrado', 'Seletivo', 'Implacável']) expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByText(/Grava \(nota a partir de 65%\)/)).toBeTruthy()
    const skips = screen.getByText('Não grava').closest('p')!
    expect(skips.classList.contains('text-destructive')).toBe(true)
    expect(skips.parentElement!.classList.contains('border-destructive/30')).toBe(true)
    fireEvent.click(screen.getByText('Seletivo'))
    expect(screen.getByText(/Grava \(nota a partir de 80%\)/)).toBeTruthy()
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('Seletivo')
  })

  it('gatilhos: mensagens do usuário ligadas, turnos da IA desligados; desligar pedidos esconde as etapas', () => {
    render(<WithForm>{(form) => <MentorTriggersCard form={form} />}</WithForm>)
    const checked = (name: RegExp) => (screen.getByLabelText(name) as HTMLInputElement).checked
    expect(checked(/Correção da prévia/)).toBe(true)
    expect(checked(/^Implementação e correções$/)).toBe(false)
    expect(screen.getByText('Pedidos do desenvolvedor pulam o decisor')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceitar pedidos do agente desenvolvedor/ }))
    expect(screen.queryByText('Pedidos do desenvolvedor pulam o decisor')).toBeNull()
  })

  it('execuções: sugestão abre com o texto editável; aprovar envia o texto editado', () => {
    mocks.runs = [run()]
    render(<MentorRunsSection />)
    expect(screen.getByText('Sugestão')).toBeTruthy()
    expect(screen.getByText(/nota 82% \/ limiar 65%/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ver a execução do Mentor em OPE-746/ }))
    const textarea = screen.getByLabelText(/Memória sugerida/) as HTMLTextAreaElement
    expect(textarea.value).toBe('Confira providers.')
    fireEvent.change(textarea, { target: { value: 'Confira os providers das telas.' } })
    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ id: 'r1', decision: 'approve', text: 'Confira os providers das telas.', target: 'adversarial' }, expect.anything())
  })

  it('OPE-97: a execução mostra o destino do Triador; na sugestão, trocar o destino vai na aprovação', () => {
    mocks.runs = [run({ proposal: { action: 'update', memoryId: 'm1', text: 'Confira providers.', target: 'adversarial', centralId: null } })]
    render(<MentorRunsSection />)
    expect(screen.getByText('Adversário')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ver a execução do Mentor em OPE-746/ }))
    expect(screen.getByText(/Agente Adversário · confiança 70%/)).toBeTruthy()
    expect((screen.getByRole('radio', { name: 'Adversário' }) as HTMLElement).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'Desenvolvedor · central' }))
    expect(screen.getByText('Em outra lista, a fusão vira uma memória nova.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ id: 'r1', decision: 'approve', text: 'Confira providers.', target: 'developer-central' }, expect.anything())
  })

  it('OPE-97: Triador e destinos — três destinos ligados mostram o modelo; com um só, o Triador some', () => {
    render(<WithForm>{(form) => <MentorRouterCard form={form} providers={[]} />}</WithForm>)
    const box = (name: RegExp) => screen.getByRole('checkbox', { name }) as HTMLElement
    for (const name of [/^Agente Adversário/, /globais/, /da central/]) expect(box(name).getAttribute('aria-checked') ?? String((box(name) as HTMLInputElement).checked)).toBe('true')
    expect(screen.getByText('Instruções adicionais do Triador (opcional)')).toBeTruthy()
    fireEvent.click(box(/globais/))
    fireEvent.click(box(/da central/))
    expect(screen.queryByText('Instruções adicionais do Triador (opcional)')).toBeNull()
    expect(screen.getByText(/Só um destino ligado: as memórias vão sempre para "Agente Adversário"/)).toBeTruthy()
  })

  it('execuções: vazio mostra o estado vazio; execução falha mostra o erro', () => {
    const { rerender } = render(<MentorRunsSection />)
    expect(screen.getByText('Nenhuma execução ainda')).toBeTruthy()
    mocks.runs = [run({ status: 'failed', error: 'Gemini fora do ar', proposal: null })]
    rerender(<MentorRunsSection />)
    fireEvent.click(screen.getByRole('button', { name: /Ver a execução/ }))
    expect(screen.getByText('Gemini fora do ar')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Aprovar/ })).toBeNull()
  })
})

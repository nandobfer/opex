import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Pontos de montagem do Agente Mentor no fluxo da mesa (gatilhos, instrução do bloco, fila). */

const mocks = vi.hoisted(() => ({ settingsFor: vi.fn(), enqueue: vi.fn(async () => 'run-1'), recordFailed: vi.fn(async () => 'run-f') }))
vi.mock('@/features/adversarial-agent/server/mentor/settings', () => ({ mentorSettingsFor: mocks.settingsFor }))
vi.mock('@/features/adversarial-agent/server/mentor/queue', () => ({ enqueueMentorRun: mocks.enqueue, recordFailedMentorRun: mocks.recordFailed }))

import { DEFAULT_MENTOR_SETTINGS, type MentorSettings } from '@/features/adversarial-agent/mentor/schemas'
import { mentorAfterTurns, mentorDiscardLiveMessages, mentorPrepareTurn, mentorRecordLiveMessage, mentorTriggerOf, type MentorAfterTurnsInput } from '@/features/adversarial-agent/server/mentor/hooks'

const enabled = (): MentorSettings => structuredClone({ ...DEFAULT_MENTOR_SETTINGS, enabled: true })
const lesson = { problem: 'Crash', shouldHaveCaught: 'Provider', why: 'Genérico' }
const base = (overrides: Partial<MentorAfterTurnsInput> = {}): MentorAfterTurnsInput => ({
  workbenchId: 'w1',
  centralId: 'c1',
  taskId: 't1',
  taskCode: 'OPE-1',
  taskTitle: 'Tarefa',
  projectName: 'App',
  repo: null,
  approvedPlan: '# Plano',
  origin: { action: 'request-correction', userText: 'Salvar quebrou', feedback: 'Salvar quebrou' },
  turns: [{ stage: 'planning', text: 'Plano novo', lesson: null, lessonError: null }, { stage: 'implementing', text: 'Corrigido', lesson: null, lessonError: null }],
  ...overrides,
})
const enqueued = () => (mocks.enqueue.mock.calls[0] as unknown as [{ case: Record<string, unknown>; approvedPlan: string | null }])[0]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.settingsFor.mockResolvedValue(enabled())
})

describe('gatilhos do Agente Mentor', () => {
  it('mapeia a ação da mesa para o tipo de mensagem e o texto do usuário', () => {
    expect(mentorTriggerOf({ action: 'revise-plan', userText: 'x', feedback: 'Use pnpm' })).toEqual({ trigger: 'plan_revision', text: 'Use pnpm' })
    expect(mentorTriggerOf({ action: 'implement', userText: 'Plano aprovado: implementar\n\nUse o provider', feedback: null })).toEqual({ trigger: 'implement_info', text: 'Use o provider' })
    expect(mentorTriggerOf({ action: 'implement', userText: 'Plano aprovado: implementar', feedback: null })).toBeNull()
    expect(mentorTriggerOf({ action: 'pr-feedback', userText: null, feedback: 'Ajuste o teste' })).toEqual({ trigger: 'pr_feedback', text: 'Ajuste o teste' })
    expect(mentorTriggerOf({ action: 'adversarial-fix', userText: 'Corrigir os bloqueios do agente adversário\n\nF2 é intencional', feedback: null })).toEqual({ trigger: 'adversarial_guidance', text: 'F2 é intencional' })
    expect(mentorTriggerOf({ action: 'approve', userText: 'Prévia aprovada', feedback: null })).toBeNull()
  })

  it('mensagem do usuário: enfileira uma execução com as respostas da cadeia', async () => {
    expect(await mentorAfterTurns(base())).toBe('run-1')
    expect(enqueued().case).toMatchObject({ sources: ['user'], trigger: 'preview_correction', userMessage: 'Salvar quebrou', responses: [{ stage: 'planning' }, { stage: 'implementing' }] })
    expect(enqueued().approvedPlan).toBeNull()
  })

  it('mensagem do usuário + pedido do desenvolvedor no mesmo turno: uma execução só', async () => {
    await mentorAfterTurns(base({ turns: [{ stage: 'implementing', text: 'Corrigido', lesson, lessonError: null }] }))
    expect(mocks.enqueue).toHaveBeenCalledTimes(1)
    expect(enqueued().case).toMatchObject({ sources: ['user', 'developer'], lessons: [lesson] })
  })

  it('gatilho desligado ou Mentor fora do escopo: nada roda', async () => {
    const settings = enabled()
    settings.triggers.user.preview_correction = false
    mocks.settingsFor.mockResolvedValueOnce(settings)
    expect(await mentorAfterTurns(base())).toBeNull()
    mocks.settingsFor.mockResolvedValueOnce(null)
    expect(await mentorAfterTurns(base())).toBeNull()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('turnos da IA só disparam quando ligados', async () => {
    const settings = enabled()
    settings.triggers.ai.implementing = true
    mocks.settingsFor.mockResolvedValueOnce(settings)
    await mentorAfterTurns(base({ origin: { action: 'approve', userText: null, feedback: null } }))
    expect(enqueued().case).toMatchObject({ sources: ['ai'], trigger: null })
  })

  it('chat ao vivo entra na avaliação do fim do turno em andamento', async () => {
    mentorRecordLiveMessage('w1', 'O botão sumiu')
    await mentorAfterTurns(base({ origin: { action: null, userText: null, feedback: null } }))
    expect(enqueued().case).toMatchObject({ sources: ['user'], trigger: 'live_chat', userMessage: 'O botão sumiu' })
  })

  it('cadeia sem avaliação (reconexão/limpeza) descarta o chat ao vivo: não contamina a próxima cadeia', async () => {
    mentorRecordLiveMessage('w1', 'Mensagem da reconexão')
    mentorDiscardLiveMessages('w1')
    await mentorAfterTurns(base({ origin: { action: null, userText: null, feedback: null }, turns: [{ stage: 'implementing', text: 'Outra cadeia', lesson: null, lessonError: null }] }))
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('bloco de lição inválido sem outro gatilho: execução falha visível', async () => {
    await mentorAfterTurns(base({ origin: { action: null, userText: null, feedback: null }, turns: [{ stage: 'implementing', text: 'x', lesson: null, lessonError: 'Bloco inválido' }] }))
    expect(mocks.recordFailed).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'Bloco inválido')
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('falha ao enfileirar não lança', async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error('banco fora'))
    await expect(mentorAfterTurns(base())).resolves.toBeNull()
  })
})

describe('instrução do bloco de lição', () => {
  it('entra só nas etapas ligadas e com pedidos aceitos', async () => {
    expect(await mentorPrepareTurn({ centralId: 'c1', stage: 'implementing', text: 'Implemente' })).toContain('```opex-lesson')
    expect(await mentorPrepareTurn({ centralId: 'c1', stage: 'planning', text: 'Planeje' })).toBe('Planeje')
    expect(await mentorPrepareTurn({ centralId: 'c1', stage: 'opening_pr', text: 'Abra o PR' })).toBe('Abra o PR')
    mocks.settingsFor.mockResolvedValueOnce(null)
    expect(await mentorPrepareTurn({ centralId: 'c1', stage: 'implementing', text: 'Implemente' })).toBe('Implemente')
  })
})

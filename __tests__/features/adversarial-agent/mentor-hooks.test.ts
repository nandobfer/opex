import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Pontos de montagem do Agente Mentor no fluxo da mesa (gatilhos, rodadas do adversário, fila). */

const mocks = vi.hoisted(() => ({ settingsFor: vi.fn(), enqueue: vi.fn(async () => 'run-1'), recordFailed: vi.fn(async () => 'run-f'), audits: [] as { dadosNovos: Record<string, unknown>; timestamp: Date }[], reviews: [] as Record<string, unknown>[] }))
vi.mock('@/lib/db/models/AuditLog', () => ({
  AuditLog: {
    find: (filter: { 'dadosNovos.mesa': string; timestamp: { $gte: Date } }) => {
      const rows = mocks.audits.filter((row) => row.dadosNovos.mesa === filter['dadosNovos.mesa'] && String(row.dadosNovos.ator ?? '').startsWith('agente:') && row.timestamp >= filter.timestamp.$gte)
      const chain = { sort: () => chain, limit: () => chain, select: () => chain, lean: async () => rows }
      return chain
    },
  },
}))
vi.mock('@/features/adversarial-agent/server/models', () => ({
  AdversarialReview: {
    findOne: () => {
      const chain = { sort: () => chain, select: () => chain, lean: async () => mocks.reviews.at(-1) ?? null }
      return chain
    },
  },
}))
vi.mock('@/features/adversarial-agent/server/mentor/settings', () => ({ mentorSettingsFor: mocks.settingsFor }))
vi.mock('@/features/adversarial-agent/server/mentor/queue', () => ({ enqueueMentorRun: mocks.enqueue, recordFailedMentorRun: mocks.recordFailed }))

import { DEFAULT_MENTOR_SETTINGS, type MentorSettings } from '@/features/adversarial-agent/mentor/schemas'
import { mentorAdversarialTurn, mentorAfterTurns, mentorDiscardLiveMessages, mentorRecordLiveMessage, mentorTriggerOf, mentorSourcesFor, type MentorAfterTurnsInput } from '@/features/adversarial-agent/server/mentor/hooks'

const enabled = (): MentorSettings => structuredClone({ ...DEFAULT_MENTOR_SETTINGS, enabled: true })
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
  turns: [{ stage: 'planning', text: 'Plano novo' }, { stage: 'implementing', text: 'Corrigido' }],
  ...overrides,
})
const enqueued = () => (mocks.enqueue.mock.calls[0] as unknown as [{ case: Record<string, unknown>; approvedPlan: string | null }])[0]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.audits = []
  mocks.reviews = []
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

  it('OPE-104: o pedido do desenvolvedor (opex-lesson) saiu: a configuração padrão não tem mais essa porta', () => {
    expect('developer' in DEFAULT_MENTOR_SETTINGS.triggers).toBe(false)
    expect(DEFAULT_MENTOR_SETTINGS.triggers.ai).toEqual({ planning: false, implementing: false, adversarial_review: false })
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
    await mentorAfterTurns(base({ origin: { action: null, userText: null, feedback: null }, turns: [{ stage: 'implementing', text: 'Outra cadeia' }] }))
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('"Revisões do adversário": a rodada só dispara o Mentor quando a opção está ligada', async () => {
    const turns = [{ stage: 'adversarial_review', text: 'Bloqueou: F1 crash ao salvar' }]
    const origin = { action: null, userText: null, feedback: null }
    expect(mentorSourcesFor(enabled(), { origin, turns }, []).sources).toEqual([])
    const settings = enabled()
    settings.triggers.ai.adversarial_review = true
    mocks.settingsFor.mockResolvedValueOnce(settings)
    await mentorAfterTurns(base({ origin, turns }))
    expect(enqueued().case).toMatchObject({ sources: ['ai'], responses: [{ stage: 'adversarial_review', text: 'Bloqueou: F1 crash ao salvar' }] })
  })

  it('a rodada mais recente do adversário vira um turno da cadeia (relatório ou resumo)', async () => {
    expect(await mentorAdversarialTurn('w1')).toBeNull()
    mocks.reviews.push({ report: null, summary: 'Aprovado sem achados' })
    expect(await mentorAdversarialTurn('w1')).toEqual({ stage: 'adversarial_review', text: 'Aprovado sem achados' })
  })

  it('memórias que o próprio agente gravou na cadeia vão ao Mentor (não repete o que ele já aprendeu)', async () => {
    const since = new Date('2026-11-01T10:00:00Z')
    mocks.audits.push(
      { dadosNovos: { mesa: 'w1', ator: 'agente:desenvolvedor', texto: 'Use pnpm' }, timestamp: new Date('2026-11-01T10:05:00Z') },
      { dadosNovos: { mesa: 'w1', ator: 'agente:desenvolvedor', texto: 'Antiga' }, timestamp: new Date('2026-11-01T09:00:00Z') },
      { dadosNovos: { mesa: 'w2', ator: 'agente:desenvolvedor', texto: 'Outra mesa' }, timestamp: new Date('2026-11-01T10:05:00Z') },
    )
    await mentorAfterTurns(base({ since }))
    expect(enqueued().case).toMatchObject({ selfLearned: ['Use pnpm'] })
  })

  it('falha ao enfileirar não lança', async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error('banco fora'))
    await expect(mentorAfterTurns(base())).resolves.toBeNull()
  })
})

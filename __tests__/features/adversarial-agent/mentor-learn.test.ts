import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPE-165: aprendizado do Agente Mentor na conclusão da mesa — transcrição → digestor (casos) → decisor →
 * Triador → redator (operações) → sanitizador → aplicação automática, com orçamento e falhas registradas.
 */

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => undefined),
  publishAppEvent: vi.fn(async () => undefined),
  publishWorkbenchEvent: vi.fn(),
  streamAi: vi.fn(),
  askJev: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  limitsFor: vi.fn(),
  transcript: vi.fn(),
}))
const store = vi.hoisted(() => ({ runs: null as unknown, cases: null as unknown }))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { EXECUTAR: 'EXECUTAR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local', name: 'Eu' }), LOCAL_USER_ID: 'local' }))
vi.mock('@/lib/ai/stream', () => ({ streamAi: mocks.streamAi }))
vi.mock('@/lib/ai/jev', () => ({ askJevSystemOne: mocks.askJev }))
vi.mock('@/features/agentic/server/hub', () => ({ prepareHub: vi.fn(async () => undefined), publishWorkbenchEvent: mocks.publishWorkbenchEvent, flushWorkbenchEvents: vi.fn(async () => undefined) }))
vi.mock('@/features/ai/server/memory-settings', () => ({ memoryLimitsFor: mocks.limitsFor }))
vi.mock('@/features/ai/server/agent-memory-service', () => ({ listAgentMemories: mocks.list, createAgentMemory: mocks.create, updateAgentMemory: mocks.update, resolveCategory: vi.fn(async (value: string) => (value === 'PROJECT_RULES' ? value : Promise.reject(new Error('fora')))) }))
vi.mock('@/features/adversarial-agent/server/mentor/transcript', () => ({ loadWorkbenchTranscript: mocks.transcript }))
vi.mock('@/features/adversarial-agent/server/mentor/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  store.runs = memoryModel()
  store.cases = memoryModel()
  return { MentorRun: store.runs, MentorRunCase: store.cases, mentorDb: async () => undefined }
})

import { DEFAULT_MENTOR_SETTINGS, type MentorSettings } from '@/features/adversarial-agent/mentor/schemas'
import type { MentorTarget } from '@/features/adversarial-agent/mentor/constants'
import { enqueueMentorLearning, mentorChainOf } from '@/features/adversarial-agent/server/mentor/queue'
import type { MentorLearningInput } from '@/features/adversarial-agent/server/mentor/learn'

type Model = { docs: Record<string, unknown>[] }
const runs = () => store.runs as Model
const cases = () => store.cases as Model

async function* events(...items: unknown[]) {
  for (const item of items) yield item
}
const reply = (json: unknown, costUsd = 0.01) => events({ type: 'delta', text: JSON.stringify(json) }, { type: 'done', finishReason: 'stop', usage: { costUsd }, durationMs: 1 })

const settings = (overrides: Partial<MentorSettings> = {}): MentorSettings => ({
  ...structuredClone(DEFAULT_MENTOR_SETTINGS),
  enabled: true,
  digest: { ...DEFAULT_MENTOR_SETTINGS.digest, provider: 'gemini', model: 'flash-long' },
  decider: { provider: 'gemini', model: 'flash', variant: null },
  router: { provider: 'gemini', model: 'flash', variant: null, instructions: '' },
  writer: { ...DEFAULT_MENTOR_SETTINGS.writer, provider: 'anthropic', model: 'claude' },
  ...overrides,
})
const TARGETS: MentorTarget[] = ['adversarial', 'developer-global', 'developer-central']

const input = (overrides: Partial<MentorLearningInput> = {}): MentorLearningInput => ({
  workbenchId: 'w1',
  centralId: 'c1',
  taskId: 't1',
  taskCode: 'OPE-746',
  taskTitle: 'Salvar modelo de mensagem',
  projectName: 'SmartDesk',
  repo: 'org/smart-desk',
  completedAt: new Date('2026-11-13T15:00:00Z'),
  completionKind: 'merge',
  ...overrides,
})

const transcript = (overrides: Record<string, unknown> = {}) => ({
  text: '# Mesa da tarefa OPE-746\n[Dono] Salvar derrubou o app',
  originalChars: 900_000,
  sentChars: 380_000,
  compacted: true,
  level: 2,
  aboveThreshold: false,
  eventCount: 1200,
  forkCount: 1,
  hasConversation: true,
  ownerMessages: ['Salvar derrubou o app porque faltava o provider no topo da tela de modelos'],
  ...overrides,
})

const lesson = (overrides: Record<string, unknown> = {}) => ({ lesson: 'Componentes que exigem provider precisam ser renderizados abaixo dele', evidence: ['faltava o provider'], nature: 'negative', scope: 'any_project', detection: 'Teste de render da tela', ...overrides })
const memory = (id: string, resumo: string, overrides: Record<string, unknown> = {}) => ({ id, resumo, texto: `${resumo}.`, versao: 2, doDono: false, ativa: true, ...overrides })

const GLOBAL_RULE = 'Antes de usar um componente que depende de provider, confira se a árvore o envolve e cubra com um teste de render.'
const CENTRAL_RULE = 'Neste projeto, os providers da tela ficam em src/app/providers.tsx.'

async function learn(s = settings(), targets = TARGETS, i = input()) {
  const id = await enqueueMentorLearning(i, s, targets)
  await mentorChainOf(i.workbenchId)
  return runs().docs.find((doc) => String(doc._id) === id)!
}

beforeEach(() => {
  vi.clearAllMocks()
  runs().docs.length = 0
  cases().docs.length = 0
  mocks.transcript.mockResolvedValue(transcript())
  mocks.limitsFor.mockResolvedValue({ textMin: 3, textMax: 4000 })
  mocks.list.mockImplementation(async (agent: string) =>
    agent === 'adversarial' ? [memory('m_adv', 'Providers')] : agent === 'developer-global' ? [memory('m_g1', 'Testes de tela'), memory('m_g2', 'Testes de render'), memory('m_dono', 'Do dono', { doDono: true }), memory('m_arq', 'Arquivada', { ativa: false })] : [memory('m_c1', 'Pasta de providers')],
  )
  mocks.create.mockImplementation(async (agent: string) => ({ memoria: { id: `new-${agent}` } }))
  mocks.update.mockImplementation(async (_agent: string, id: string) => ({ memoria: { id } }))
})

describe('aprendizado na conclusão da mesa', () => {
  it('uma execução grava em várias listas: cria nas globais, atualiza e arquiva na central; registra transcrição, custo e operações', async () => {
    mocks.streamAi
      .mockReturnValueOnce(reply({ cases: [lesson(), lesson({ lesson: 'A pasta de providers deste projeto mudou', scope: 'this_project', nature: 'positive', detection: null })] }, 0.05))
      .mockReturnValueOnce(reply({ score: 0.9 }))
      .mockReturnValueOnce(reply({ target: 'developer-global' }))
      .mockReturnValueOnce(reply({ operations: [{ op: 'create', text: GLOBAL_RULE, category: 'PROJECT_RULES', reason: 'nova' }] }))
      .mockReturnValueOnce(reply({ score: 0.8 }))
      .mockReturnValueOnce(reply({ target: 'developer-central' }))
      .mockReturnValueOnce(reply({ operations: [{ op: 'update', memoryId: 'm_c1', text: CENTRAL_RULE }] }))
    const doc = await learn()
    expect(doc).toMatchObject({ status: 'learned', kind: 'learning', caseCount: 2, digestModel: 'gemini/flash-long', operationCounts: { create: 1, update: 1 }, targetCounts: { 'developer-global': 1, 'developer-central': 1 } })
    expect(doc.transcript).toMatchObject({ originalChars: 900_000, sentChars: 380_000, compacted: true, forkCount: 1 })
    expect(doc.costUsd).toBeCloseTo(0.11)
    expect(mocks.streamAi.mock.calls[0]![0]).toMatchObject({ provider: 'gemini', model: 'flash-long', consumption: { origin: 'adversarial-mentor-digest', subject: 'OPE-746' } })
    expect(mocks.create).toHaveBeenCalledWith('developer-global', GLOBAL_RULE, 'local', expect.objectContaining({ categoria: 'PROJECT_RULES', agent: { consumer: 'mentor', label: 'Mentor · OPE-746' }, auditContext: expect.objectContaining({ mesa: 'w1', tarefa: 'OPE-746', operacao: 'create' }) }))
    expect(mocks.update).toHaveBeenCalledWith('developer-central', 'm_c1', { texto: CENTRAL_RULE, versao: 2 }, 'local', expect.objectContaining({ centralId: 'c1' }))
    expect(cases().docs.map((item) => item.status)).toEqual(['applied', 'applied'])
    // Aviso na mesa só com as referências (nunca o texto da memória).
    const notice = mocks.publishWorkbenchEvent.mock.calls.find((call) => (call[1] as { type: string }).type === 'notice')![1]
    expect(notice.memories).toHaveLength(2)
    expect(JSON.stringify(notice)).not.toContain(GLOBAL_RULE)
    // Eventos de tempo real com payload mínimo.
    for (const call of mocks.publishAppEvent.mock.calls as unknown as [string, Record<string, unknown>][]) expect(Object.keys(call[1]).every((key) => key === 'runId')).toBe(true)
  })

  it('fundir arquiva as absorvidas; arquivar memória obsoleta usa a versão lida; a arquivada não aparece ao redator', async () => {
    mocks.streamAi
      .mockReturnValueOnce(reply({ cases: [lesson()] }))
      .mockReturnValueOnce(reply({ score: 0.9 }))
      .mockReturnValueOnce(reply({ target: 'developer-global' }))
      .mockReturnValueOnce(reply({ operations: [{ op: 'merge', into: 'm_g1', absorb: [{ memoryId: 'm_g2' }], text: GLOBAL_RULE }] }))
    const doc = await learn()
    expect(doc).toMatchObject({ status: 'learned', operationCounts: { merge: 1 } })
    expect(mocks.update).toHaveBeenCalledWith('developer-global', 'm_g1', { texto: GLOBAL_RULE, versao: 2 }, 'local', expect.anything())
    expect(mocks.update).toHaveBeenCalledWith('developer-global', 'm_g2', { ativa: false, versao: 2 }, 'local', expect.objectContaining({ auditContext: expect.objectContaining({ absorvidaPor: 'm_g1' }) }))
    expect(mocks.streamAi.mock.calls[3]![0].prompt).not.toContain('m_arq')
  })

  it('memória do dono: arquivar é recusado e volta ao redator; a segunda resposta é aplicada', async () => {
    mocks.streamAi
      .mockReturnValueOnce(reply({ cases: [lesson()] }))
      .mockReturnValueOnce(reply({ score: 0.9 }))
      .mockReturnValueOnce(reply({ target: 'developer-global' }))
      .mockReturnValueOnce(reply({ operations: [{ op: 'archive', memoryId: 'm_dono', reason: 'obsoleta' }] }))
      .mockReturnValueOnce(reply({ operations: [{ op: 'update', memoryId: 'm_dono', text: GLOBAL_RULE }] }))
    expect(await learn()).toMatchObject({ status: 'learned', operationCounts: { update: 1 } })
    expect(mocks.streamAi.mock.calls[4]![0].prompt).toContain('escrita pelo dono')
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update).not.toHaveBeenCalledWith(expect.anything(), 'm_dono', expect.objectContaining({ ativa: false }), expect.anything(), expect.anything())
  })

  it('abaixo do limiar ou skip do redator: o caso não grava e a execução termina sem lição', async () => {
    mocks.streamAi
      .mockReturnValueOnce(reply({ cases: [lesson(), lesson()] }))
      .mockReturnValueOnce(reply({ score: 0.2 }))
      .mockReturnValueOnce(reply({ score: 0.9 }))
      .mockReturnValueOnce(reply({ target: 'adversarial' }))
      .mockReturnValueOnce(reply({ operations: [], skip: { kind: 'covered', memoryId: 'm_adv', reason: 'já coberta' } }))
    expect(await learn()).toMatchObject({ status: 'skipped' })
    expect(cases().docs).toMatchObject([{ status: 'skipped', score: 0.2 }, { status: 'skipped', skipKind: 'covered', coveredBy: 'm_adv' }])
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('digestor sem lições: execução sem casos', async () => {
    mocks.streamAi.mockReturnValueOnce(reply({ cases: [] }))
    expect(await learn()).toMatchObject({ status: 'skipped', caseCount: 0 })
  })

  it('sanitizador: texto que copia a mensagem do dono volta ao redator; recusado de novo, o caso é descartado', async () => {
    const copied = 'Salvar derrubou o app porque faltava o provider no topo da tela de modelos'
    mocks.streamAi
      .mockReturnValueOnce(reply({ cases: [lesson()] }))
      .mockReturnValueOnce(reply({ score: 0.9 }))
      .mockReturnValueOnce(reply({ target: 'developer-global' }))
      .mockReturnValueOnce(reply({ operations: [{ op: 'create', text: copied }] }))
      .mockReturnValueOnce(reply({ operations: [{ op: 'create', text: copied }] }))
    expect(await learn()).toMatchObject({ status: 'skipped' })
    expect(cases().docs[0]).toMatchObject({ status: 'discarded', rejection: expect.any(String) })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('orçamento: passar dele aborta e registra o motivo, mantendo o que já foi aplicado', async () => {
    mocks.streamAi
      .mockReturnValueOnce(reply({ cases: [lesson(), lesson()] }, 0.1))
      .mockReturnValueOnce(reply({ score: 0.9 }, 0.05))
      .mockReturnValueOnce(reply({ target: 'developer-global' }, 0.05))
      .mockReturnValueOnce(reply({ operations: [{ op: 'create', text: GLOBAL_RULE }] }, 0.05))
      .mockReturnValueOnce(reply({ score: 0.9 }, 0.2))
    const doc = await learn(settings({ digest: { ...settings().digest, budgetUsd: 0.3 } }))
    expect(doc).toMatchObject({ status: 'failed', abortReason: 'budget', operationCounts: { create: 1 } })
    expect(doc.error).toContain('Orçamento de US$ 0.30 excedido')
    expect(mocks.streamAi).toHaveBeenCalledTimes(5)
  })

  it('transcrição vazia, falha do provedor ou JSON inválido do digestor: execução falha com o erro (a mesa não muda)', async () => {
    mocks.transcript.mockResolvedValueOnce(transcript({ hasConversation: false }))
    expect(await learn()).toMatchObject({ status: 'failed', error: expect.stringContaining('Transcrição vazia') })
    mocks.streamAi.mockReturnValueOnce(events({ type: 'error', message: 'Provedor fora do ar' }))
    expect(await learn(settings(), TARGETS, input({ completedAt: new Date('2026-11-14T00:00:00Z') }))).toMatchObject({ status: 'failed', error: 'Provedor fora do ar' })
    mocks.streamAi.mockReturnValueOnce(reply('sem casos'))
    expect(await learn(settings(), TARGETS, input({ completedAt: new Date('2026-11-15T00:00:00Z') }))).toMatchObject({ status: 'failed', error: expect.stringContaining('JSON esperado') })
  })

  it('um caso que falha não derruba os outros', async () => {
    mocks.streamAi
      .mockReturnValueOnce(reply({ cases: [lesson(), lesson()] }))
      .mockReturnValueOnce(events({ type: 'error', message: 'decisor fora' }))
      .mockReturnValueOnce(reply({ score: 0.9 }))
      .mockReturnValueOnce(reply({ target: 'developer-global' }))
      .mockReturnValueOnce(reply({ operations: [{ op: 'create', text: GLOBAL_RULE }] }))
    expect(await learn()).toMatchObject({ status: 'learned' })
    expect(cases().docs.map((item) => item.status)).toEqual(['failed', 'applied'])
  })

  it('só os destinos que valem: sem o Adversário, o Triador nunca o recebe', async () => {
    mocks.streamAi
      .mockReturnValueOnce(reply({ cases: [lesson()] }))
      .mockReturnValueOnce(reply({ score: 0.9 }))
      .mockReturnValueOnce(reply({ target: 'adversarial' }))
    const doc = await learn(settings(), ['developer-global', 'developer-central'])
    expect(doc).toMatchObject({ status: 'failed' })
    expect(cases().docs[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('Triador') })
    expect(mocks.list).not.toHaveBeenCalledWith('adversarial', expect.anything())
  })
})

describe('idempotência e recuperação', () => {
  it('a mesma conclusão (índice único) não gera duas execuções', async () => {
    const model = store.runs as { create: (doc: Record<string, unknown>) => Promise<unknown> }
    const original = model.create
    model.create = vi.fn(async () => Promise.reject(Object.assign(new Error('E11000 duplicate key'), { code: 11000 })))
    try {
      expect(await enqueueMentorLearning(input(), settings(), TARGETS)).toBeNull()
    } finally {
      model.create = original
    }
  })

  it('execução sem batimento há mais de 90 s vira falha; com batimento recente, não', async () => {
    const { recoverOrphanMentorRuns, resetMentorRecovery } = await import('@/features/adversarial-agent/server/mentor/queue')
    const now = new Date('2026-11-13T16:00:00Z')
    runs().docs.push(
      { _id: 'velha', kind: 'learning', status: 'running', heartbeatAt: new Date(now.getTime() - 120_000), createdAt: now },
      { _id: 'viva', kind: 'learning', status: 'running', heartbeatAt: new Date(now.getTime() - 10_000), createdAt: now },
    )
    resetMentorRecovery()
    await recoverOrphanMentorRuns(now)
    expect(runs().docs.find((doc) => doc._id === 'velha')).toMatchObject({ status: 'failed', error: expect.stringContaining('interrompida') })
    expect(runs().docs.find((doc) => doc._id === 'viva')).toMatchObject({ status: 'running' })
  })
})

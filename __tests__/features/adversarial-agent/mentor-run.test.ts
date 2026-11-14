import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Execuções do Agente Mentor (`run.ts`): sugestões antigas do modo Sugerir (aprovar/descartar), resumo da
 * memória gravada, lista e as execuções de aprendizado da mesa (OPE-165). O pipeline novo está em mentor-learn.test.ts.
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
  get: vi.fn(),
}))
const store = vi.hoisted(() => ({ runs: null as unknown, reviews: null as unknown, cases: null as unknown }))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { EXECUTAR: 'EXECUTAR', APROVAR: 'APROVAR', DEVOLVER: 'DEVOLVER' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local', name: 'Eu' }), LOCAL_USER_ID: 'local' }))
vi.mock('@/lib/ai/stream', () => ({ streamAi: mocks.streamAi }))
vi.mock('@/lib/ai/jev', () => ({ askJevSystemOne: mocks.askJev }))
vi.mock('@/features/agentic/server/hub', () => ({ prepareHub: vi.fn(async () => undefined), publishWorkbenchEvent: mocks.publishWorkbenchEvent, flushWorkbenchEvents: vi.fn(async () => undefined) }))
// Memórias do adversário: a lista `adversarial` do serviço de memórias dos agentes.
vi.mock('@/features/ai/server/memory-settings', () => ({ memoryLimitsFor: mocks.limitsFor }))
vi.mock('@/features/ai/server/agent-memory-service', () => ({ listAgentMemories: mocks.list, getAgentMemory: mocks.get, createAgentMemory: mocks.create, updateAgentMemory: mocks.update }))
vi.mock('@/features/adversarial-agent/server/central-options', () => ({ listCentralOptions: vi.fn(async () => [{ id: 'c1', projectName: 'App' }]) }))
vi.mock('@/features/adversarial-agent/server/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  store.reviews = memoryModel()
  return { AdversarialReview: store.reviews }
})
vi.mock('@/features/adversarial-agent/server/mentor/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  store.runs = memoryModel()
  store.cases = memoryModel()
  return { MentorRun: store.runs, MentorRunCase: store.cases, mentorDb: async () => undefined }
})

import { approveMentorRun, discardMentorRun, getMentorLearningRun, getMentorRunMemory, listMentorRuns, listWorkbenchMentorRuns, retryableRunIds } from '@/features/adversarial-agent/server/mentor/run'

type Model = { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: unknown }> }
const runs = () => store.runs as Model
const cases = () => store.cases as Model

const RULE = 'Confira se componentes que exigem provider são renderizados abaixo dele e se há teste de render da tela.'

/** Execução antiga (antes da OPE-165): uma lição por cadeia de turnos, com a proposta do redator. */
const seed = (overrides: Record<string, unknown> = {}) =>
  runs().create({
    workbenchId: 'w1', centralId: 'c1', taskId: 't1', taskCode: 'OPE-9', taskTitle: 'Antiga', sources: ['user'], trigger: null, userMessage: null, lessonCount: 0,
    status: 'created', level: 'balanced', score: 0.9, threshold: 0.65, deciderReason: null, writerAction: 'create', writerReason: null, sanitizerReason: null,
    proposal: { action: 'create', memoryId: null, text: RULE, target: 'adversarial', centralId: null }, memoryId: 'm_abc', error: null, costUsd: 0, durationMs: null, createdAt: new Date(),
    ...overrides,
  })

beforeEach(() => {
  vi.clearAllMocks()
  runs().docs.length = 0
  cases().docs.length = 0
  mocks.list.mockResolvedValue([{ id: 'm1', resumo: 'Providers', texto: 'Confira providers.', autor: 'Eu', criadaEm: '', atualizadaEm: '' }])
  mocks.create.mockImplementation(async () => ({ memoria: { id: 'new' }, formatadaPorIa: true }))
  mocks.update.mockImplementation(async (_agent: string, id: string) => ({ memoria: { id }, formatadaPorIa: true }))
})

describe('sugestões antigas (o modo Sugerir saiu na OPE-165)', () => {
  it('aprovar (com texto editado) grava; descartar não grava; decidida não pode ser decidida de novo', async () => {
    const pending = await seed({ status: 'suggested', memoryId: null })
    expect(await approveMentorRun(String(pending._id), 'Regra editada pelo dono.', 'local')).toMatchObject({ status: 'created', memoryId: 'new' })
    expect(mocks.create).toHaveBeenCalledWith('adversarial', 'Regra editada pelo dono.', 'local', expect.objectContaining({ agent: { consumer: 'mentor', label: 'Mentor · OPE-9' } }))
    await expect(approveMentorRun(String(pending._id), undefined, 'local')).rejects.toMatchObject({ status: 409 })
    const other = await seed({ status: 'suggested', memoryId: null })
    expect(await discardMentorRun(String(other._id), 'local')).toMatchObject({ status: 'discarded' })
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('regressão: sugestão gravada antes do Triador (sem destino) é aprovada no Agente Adversário', async () => {
    const legacy = await seed({ status: 'suggested', memoryId: null, proposal: { action: 'create', memoryId: null, text: RULE } })
    expect((await listMentorRuns()).items.find((item) => item.id === String(legacy._id))).toMatchObject({ kind: 'legacy', target: 'adversarial', proposal: { target: 'adversarial', centralId: null } })
    expect(await approveMentorRun(String(legacy._id), undefined, 'local')).toMatchObject({ status: 'created', target: 'adversarial' })
  })
})

describe('OPE-128: resumo da memória gravada (getMentorRunMemory)', () => {
  it('memória gravada: devolve o resumo do Engramind (e se ainda está sendo gerado)', async () => {
    mocks.get.mockResolvedValueOnce({ id: 'm_abc', resumo: 'Conferir providers', resumoPendente: true, atualizadaEm: '2026-11-03T10:00:00.000Z' })
    const doc = await seed()
    expect(await getMentorRunMemory(String(doc._id))).toEqual({ state: 'ok', resumo: 'Conferir providers', resumoPendente: true, atualizadaEm: '2026-11-03T10:00:00.000Z' })
    expect(mocks.get).toHaveBeenCalledWith('adversarial', 'm_abc', null)
  })

  it('sem memória gravada: estado vazio; memória excluída: missing; outro erro sobe', async () => {
    expect(await getMentorRunMemory(String((await seed({ status: 'suggested', memoryId: null }))._id))).toMatchObject({ state: 'none' })
    const { DomainError } = await import('@/lib/api/route')
    const doc = await seed()
    mocks.get.mockRejectedValueOnce(new DomainError(404, 'Memória não encontrada', 'NOT_FOUND'))
    expect(await getMentorRunMemory(String(doc._id))).toMatchObject({ state: 'missing' })
    mocks.get.mockRejectedValueOnce(new Error('Engramind fora do ar'))
    await expect(getMentorRunMemory(String(doc._id))).rejects.toThrow('Engramind fora do ar')
    await expect(getMentorRunMemory('nao-e-id')).rejects.toMatchObject({ status: 404, code: 'MENTOR_RUN_NOT_FOUND' })
  })
})

describe('OPE-165: execuções de aprendizado da mesa', () => {
  const COMPLETED = new Date('2026-11-13T15:00:00Z')
  const learning = (overrides: Record<string, unknown> = {}) => seed({ kind: 'learning', completedAt: COMPLETED, attempt: 1, status: 'failed', proposal: null, memoryId: null, sources: ['done'], error: 'Provedor fora', ...overrides })

  it('Tentar novamente vale só para a tentativa mais recente que falhou, sem outra em andamento', () => {
    const at = (id: string, attempt: number, status: string, completedAt = COMPLETED) => ({ _id: id, kind: 'learning' as const, completedAt, attempt, status: status as never })
    expect([...retryableRunIds([at('a', 1, 'failed')])]).toEqual(['a'])
    expect([...retryableRunIds([at('a', 1, 'failed'), at('b', 2, 'failed')])]).toEqual(['b'])
    expect([...retryableRunIds([at('a', 1, 'failed'), at('b', 2, 'running')])]).toEqual([])
    expect([...retryableRunIds([at('a', 1, 'learned')])]).toEqual([])
    // Outra conclusão (reaberta) é avaliada à parte.
    expect([...retryableRunIds([at('a', 1, 'learned'), at('c', 1, 'failed', new Date('2026-11-14T10:00:00Z'))])]).toEqual(['c'])
  })

  it('lista da mesa: só o aprendizado, com os casos e o Tentar novamente na falha mais recente', async () => {
    await seed({ status: 'created' })
    const failed = await learning()
    await cases().create({ runId: String(failed._id), workbenchId: 'w1', index: 0, lesson: 'Lição', evidence: ['trecho'], nature: 'negative', scope: 'any_project', status: 'failed', operations: [], error: 'Provedor fora' })
    const items = await listWorkbenchMentorRuns('w1')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'learning', canRetry: true, error: 'Provedor fora', cases: [{ lesson: 'Lição', status: 'failed', evidence: ['trecho'] }] })
    expect(await getMentorLearningRun(String(failed._id))).toMatchObject({ canRetry: true, cases: [{ lesson: 'Lição' }] })
  })
})

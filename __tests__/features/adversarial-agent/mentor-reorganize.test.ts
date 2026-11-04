import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Reorganização do acervo do Agente Mentor (OPE-132): prévia, aplicação, fusão e cancelamento. */

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => undefined),
  publishAppEvent: vi.fn(async () => undefined),
  streamAi: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  move: vi.fn(),
  limits: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: mocks.recordAudit, AcaoAuditoria: { EXECUTAR: 'EXECUTAR', APROVAR: 'APROVAR', DEVOLVER: 'DEVOLVER' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local', name: 'Eu' }), LOCAL_USER_ID: 'local' }))
vi.mock('@/lib/ai/stream', () => ({ streamAi: mocks.streamAi }))
vi.mock('@/features/ai/server/memory-settings', () => ({ memoryLimitsFor: mocks.limits }))
vi.mock('@/features/ai/server/agent-memory-service', () => ({ listAgentMemories: mocks.list, getAgentMemory: mocks.get, createAgentMemory: mocks.create, updateAgentMemory: mocks.update, moveAgentMemory: mocks.move }))
vi.mock('@/features/adversarial-agent/server/central-options', () => ({ listCentralOptions: async () => [{ id: 'c1', projectName: 'App' }] }))
vi.mock('@/features/adversarial-agent/server/mentor/reorg-models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { MentorReorg: memoryModel(), MentorReorgItem: memoryModel(), reorgDb: async () => undefined }
})

import { DEFAULT_MENTOR_SETTINGS, type MentorSettings } from '@/features/adversarial-agent/mentor/schemas'
import type { MemoryDto } from '@/features/ai/types'
import { applyMentorReorg, discardMentorReorg, getMentorReorg, previewMentorReorg } from '@/features/adversarial-agent/server/mentor/reorganize'
import { cancelMentorReorg, mentorReorgChain, startMentorReorg } from '@/features/adversarial-agent/server/mentor/reorg-queue'
import { MentorReorg, MentorReorgItem } from '@/features/adversarial-agent/server/mentor/reorg-models'

type Model = { docs: Record<string, unknown>[] }
const reorgs = () => MentorReorg as unknown as Model
const items = () => MentorReorgItem as unknown as Model

const memory = (id: string, texto: string, overrides: Partial<MemoryDto> = {}): MemoryDto => ({
  id,
  texto,
  resumo: texto,
  resumoPendente: false,
  categoria: 'PROJECT_RULES',
  fixada: false,
  ativa: true,
  versao: 1,
  autor: 'Eu',
  doDono: false,
  criadaEm: '',
  atualizadaEm: '',
  ...overrides,
})

async function* events(...list: unknown[]) {
  for (const item of list) yield item
}
const reply = (json: unknown) => events({ type: 'delta', text: JSON.stringify(json) }, { type: 'done', finishReason: 'stop', usage: { costUsd: 0.01 }, durationMs: 1 })

const settings = (overrides: Partial<MentorSettings> = {}): MentorSettings => ({
  ...DEFAULT_MENTOR_SETTINGS,
  enabled: true,
  router: { provider: 'gemini', model: 'flash', variant: null, instructions: '' },
  writer: { ...DEFAULT_MENTOR_SETTINGS.writer, provider: 'anthropic', model: 'claude' },
  ...overrides,
})

/** Acervo padrão: uma memória por lista. */
const acervo = () =>
  mocks.list.mockImplementation(async (agent: string) => (agent === 'adversarial' ? [memory('m_a', 'Confira providers')] : agent === 'developer-global' ? [memory('m_g', 'Escreva testes')] : [memory('m_c', 'Use a pasta features')]))

/** Roda uma revisão completa e devolve o plano. */
async function plan(s: MentorSettings = settings(), scope = {}): Promise<{ id: string } & Record<string, unknown>> {
  const started = await startMentorReorg(scope, s, 'local')
  await mentorReorgChain()
  return (await getMentorReorg(started.id)) as { id: string } & Record<string, unknown>
}

beforeEach(() => {
  // `vi.clearAllMocks()` neste arquivo tropeça no registro interno (mock de gerador); limpa um a um.
  for (const fn of Object.values(mocks)) fn.mockReset()
  mocks.recordAudit.mockResolvedValue(undefined)
  mocks.publishAppEvent.mockResolvedValue(undefined)
  reorgs().docs.length = 0
  items().docs.length = 0
  acervo()
  mocks.limits.mockResolvedValue({ textMin: 3, textMax: 4000 })
  mocks.get.mockImplementation(async (_agent: string, id: string, centralId: string | null) => memory(id, 'Destino', { versao: 1, ...(centralId ? { centralId } : {}) }))
  mocks.create.mockImplementation(async () => ({ memoria: { id: 'novo' } }))
  mocks.update.mockImplementation(async (_agent: string, id: string) => ({ memoria: { id } }))
  mocks.move.mockImplementation(async () => memory('m_a', 'Movida'))
})

describe('Plano de reorganização', () => {
  it('revisa as memórias do recorte e não grava nada antes da aprovação', async () => {
    mocks.streamAi
      .mockReturnValueOnce(reply({ target: 'adversarial' }))
      .mockReturnValueOnce(reply({ action: 'keep' }))
      .mockReturnValueOnce(reply({ target: 'developer-global' }))
      .mockReturnValueOnce(reply({ action: 'keep' }))
      .mockReturnValueOnce(reply({ target: 'developer-central:c1' }))
      .mockReturnValueOnce(reply({ action: 'keep' }))
    const reorg = await plan()
    expect(reorg).toMatchObject({ status: 'ready', total: 3, done: 3, counts: expect.objectContaining({ keep: 3 }) })
    expect((reorg.items as unknown[]).length).toBe(3)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.move).not.toHaveBeenCalled()
    // A prévia nunca chamou o serviço de escrita; a auditoria só registra o início.
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'EXECUTAR' }))
  })

  it('a estimativa conta memórias e chamadas (triagem + redação)', async () => {
    expect(await previewMentorReorg({}, settings())).toMatchObject({ memories: 3, calls: 6, averageCostUsdPerMemory: null })
  })

  it('mover: aplica o move com o token do Mentor e reescreve o texto quando ele muda', async () => {
    mocks.list.mockImplementation(async (agent: string) => (agent === 'adversarial' ? [memory('m_a', 'Confira providers')] : []))
    mocks.streamAi.mockReturnValueOnce(reply({ target: 'developer-global' })).mockReturnValueOnce(reply({ action: 'rewrite', text: 'Confira se o provider está acima do componente.' }))
    const reorg = await plan()
    const item = (reorg.items as { id: string; action: string }[])[0]!
    expect(item.action).toBe('move')
    mocks.get.mockResolvedValueOnce(memory('m_a', 'Confira providers', { versao: 1 }))
    const applied = await applyMentorReorg(reorg.id, { itemIds: [item.id] }, 'local')
    expect(applied.status).toBe('applied')
    expect(mocks.move).toHaveBeenCalledWith('adversarial', 'm_a', 'developer-global', 'local', expect.objectContaining({ from: { centralId: null }, to: { centralId: null }, agent: expect.objectContaining({ consumer: 'mentor' }) }))
    expect(mocks.update).toHaveBeenCalledWith('developer-global', 'm_a', { texto: 'Confira se o provider está acima do componente.' }, 'local', expect.objectContaining({ agent: expect.objectContaining({ consumer: 'mentor' }) }))
  })

  it('mover sem escopo no destino: o item falha com a sinalização e nada de fallback', async () => {
    mocks.list.mockImplementation(async (agent: string) => (agent === 'adversarial' ? [memory('m_a', 'Confira providers')] : []))
    mocks.streamAi.mockReturnValueOnce(reply({ target: 'developer-global' })).mockReturnValueOnce(reply({ action: 'keep' }))
    const reorg = await plan()
    const item = (reorg.items as { id: string }[])[0]!
    const { DomainError } = await import('@/lib/api/route')
    mocks.move.mockRejectedValueOnce(new DomainError(403, 'O token do Agente Mentor não alcança a lista de destino. Ajuste as assinaturas do agente opex/mentor no Engramind e repita.', 'MEMORY_MOVE_FORBIDDEN'))
    const applied = await applyMentorReorg(reorg.id, { itemIds: [item.id] }, 'local')
    expect(applied.status).toBe('partial')
    expect((applied.items[0] as { status: string; error: string })).toMatchObject({ status: 'failed', error: expect.stringContaining('não alcança a lista de destino') })
  })

  it('fusão: atualiza a memória que fica e arquiva a absorvida (sem excluir)', async () => {
    mocks.list.mockImplementation(async (agent: string) => (agent === 'adversarial' ? [memory('m_a', 'Regra antiga'), memory('m_b', 'Regra que fica')] : []))
    mocks.streamAi
      .mockReturnValueOnce(reply({ target: 'adversarial' }))
      .mockReturnValueOnce(reply({ action: 'merge', memoryId: 'm_b', text: 'Regra fundida' }))
      .mockReturnValueOnce(reply({ target: 'adversarial' }))
      .mockReturnValueOnce(reply({ action: 'keep' }))
    const reorg = await plan()
    const mergeItem = (reorg.items as { id: string; action: string; mergeInto: string | null }[]).find((item) => item.action === 'merge')!
    expect(mergeItem.mergeInto).toBe('m_b')
    mocks.get.mockResolvedValueOnce(memory('m_b', 'Regra que fica', { versao: 2 }))
    const applied = await applyMentorReorg(reorg.id, { itemIds: [mergeItem.id] }, 'local')
    expect(applied.items.find((item) => item.id === mergeItem.id)).toMatchObject({ status: 'applied' })
    expect(mocks.update).toHaveBeenCalledWith('adversarial', 'm_b', { texto: 'Regra fundida', versao: 2 }, 'local', expect.anything())
    expect(mocks.update).toHaveBeenCalledWith('adversarial', 'm_a', { ativa: false, versao: 1 }, 'local', expect.objectContaining({ agent: expect.objectContaining({ consumer: 'mentor' }) }))
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('memória do dono numa fusão: sem confirmação explícita nada é gravado', async () => {
    mocks.list.mockImplementation(async (agent: string) => (agent === 'adversarial' ? [memory('m_a', 'Regra do dono', { doDono: true }), memory('m_b', 'Regra que fica')] : []))
    mocks.streamAi
      .mockReturnValueOnce(reply({ target: 'adversarial' }))
      .mockReturnValueOnce(reply({ action: 'merge', memoryId: 'm_b', text: 'Regra fundida' }))
      .mockReturnValueOnce(reply({ target: 'adversarial' }))
      .mockReturnValueOnce(reply({ action: 'keep' }))
    const reorg = await plan()
    const mergeItem = (reorg.items as { id: string; action: string; ownerMemory: boolean }[]).find((item) => item.action === 'merge')!
    expect(mergeItem.ownerMemory).toBe(true)
    const applied = await applyMentorReorg(reorg.id, { itemIds: [mergeItem.id] }, 'local')
    expect(applied.items.find((item) => item.id === mergeItem.id)).toMatchObject({ status: 'failed', error: expect.stringContaining('escrita pelo dono') })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('com a confirmação do dono, a memória é arquivada como ele (fora do token do agente)', async () => {
    mocks.list.mockImplementation(async (agent: string) => (agent === 'adversarial' ? [memory('m_a', 'Regra do dono', { doDono: true }), memory('m_b', 'Regra que fica')] : []))
    mocks.streamAi
      .mockReturnValueOnce(reply({ target: 'adversarial' }))
      .mockReturnValueOnce(reply({ action: 'merge', memoryId: 'm_b', text: 'Regra fundida' }))
      .mockReturnValueOnce(reply({ target: 'adversarial' }))
      .mockReturnValueOnce(reply({ action: 'keep' }))
    const reorg = await plan()
    const mergeItem = (reorg.items as { id: string; action: string }[]).find((item) => item.action === 'merge')!
    mocks.get.mockResolvedValueOnce(memory('m_b', 'Regra que fica', { versao: 2 }))
    const applied = await applyMentorReorg(reorg.id, { itemIds: [mergeItem.id], overrides: { [mergeItem.id]: { confirmOwner: true } } }, 'local')
    expect(applied.items.find((item) => item.id === mergeItem.id)).toMatchObject({ status: 'applied' })
    const archive = mocks.update.mock.calls.find((call) => call[1] === 'm_a')!
    expect(archive[2]).toMatchObject({ ativa: false })
    expect(archive[4]).toMatchObject({ auditContext: expect.objectContaining({ confirmadoPeloDono: true }) })
    expect(archive[4]).not.toHaveProperty('agent')
  })

  it('memória alterada desde o plano: o mover falha e pede outro plano', async () => {
    mocks.list.mockImplementation(async (agent: string) => (agent === 'adversarial' ? [memory('m_a', 'Confira providers')] : []))
    mocks.streamAi.mockReturnValueOnce(reply({ target: 'developer-global' })).mockReturnValueOnce(reply({ action: 'keep' }))
    const reorg = await plan()
    const item = (reorg.items as { id: string }[])[0]!
    mocks.get.mockResolvedValueOnce(memory('m_a', 'Mudou', { versao: 9 }))
    const applied = await applyMentorReorg(reorg.id, { itemIds: [item.id] }, 'local')
    expect(applied.items[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('gere outro plano') })
    expect(mocks.move).not.toHaveBeenCalled()
  })

  it('descartar não altera nada no Engramind; duas aplicações não repetem a decisão', async () => {
    mocks.streamAi
      .mockReturnValueOnce(reply({ target: 'adversarial' }))
      .mockReturnValueOnce(reply({ action: 'keep' }))
      .mockReturnValueOnce(reply({ target: 'developer-global' }))
      .mockReturnValueOnce(reply({ action: 'keep' }))
      .mockReturnValueOnce(reply({ target: 'developer-central:c1' }))
      .mockReturnValueOnce(reply({ action: 'keep' }))
    const reorg = await plan()
    const discarded = await discardMentorReorg(reorg.id, {}, 'local')
    expect(discarded.status).toBe('discarded')
    expect(discarded.items.every((item) => item.status === 'discarded')).toBe(true)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('planos aplicados não aceitam uma segunda aplicação', async () => {
    mocks.streamAi
      .mockReturnValueOnce(reply({ target: 'adversarial' }))
      .mockReturnValueOnce(reply({ action: 'keep' }))
      .mockReturnValueOnce(reply({ target: 'developer-global' }))
      .mockReturnValueOnce(reply({ action: 'keep' }))
      .mockReturnValueOnce(reply({ target: 'developer-central:c1' }))
      .mockReturnValueOnce(reply({ action: 'keep' }))
    const reorg = await plan()
    expect((await applyMentorReorg(reorg.id, {}, 'local')).status).toBe('applied')
    await expect(applyMentorReorg(reorg.id, {}, 'local')).rejects.toMatchObject({ status: 409, code: 'MENTOR_REORG_NOT_READY' })
  })
})

describe('Fila da reorganização', () => {
  it('uma por vez: a segunda recebe 409; cancelar interrompe a revisão', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mocks.streamAi.mockImplementation(async function* () {
      await gate
      yield { type: 'done', finishReason: 'stop', usage: { costUsd: 0 }, durationMs: 1 }
    })
    mocks.list.mockImplementation(async (agent: string) => (agent === 'adversarial' ? [memory('m_a', 'Confira providers')] : []))
    const first = await startMentorReorg({}, settings(), 'local')
    await expect(startMentorReorg({}, settings(), 'local')).rejects.toMatchObject({ status: 409, code: 'MENTOR_REORG_RUNNING' })
    await cancelMentorReorg(first.id)
    release()
    await mentorReorgChain()
    expect(await getMentorReorg(first.id)).toMatchObject({ status: 'cancelled' })
  })
})

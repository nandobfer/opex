import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Pedidos de diagrama: disparo na aprovação do plano (automático/manual, sem duplicar, plano v2
 * substitui o v1), pedido manual, ajuste, nova tentativa, órfãos e limpeza da mesa.
 */

const mocks = vi.hoisted(() => ({
  settings: null as unknown,
  available: true,
  runDiagram: vi.fn(async () => undefined),
  retryPending: vi.fn(async () => undefined),
  tasks: [] as Promise<unknown>[],
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: vi.fn(async () => undefined) }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local', name: 'Eu' }), LOCAL_USER_ID: 'local' }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: mocks.info, warn: mocks.warn, error: vi.fn() }) }))
vi.mock('@/lib/after-response', () => ({ runAfterResponse: (_label: string, task: () => Promise<unknown>) => void mocks.tasks.push(task()) }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: async () => ({}) }))
vi.mock('@/features/architect-agent/server/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { ArchitectDiagram: memoryModel(), architectDb: vi.fn(async () => undefined) }
})
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AgenticWorkbench: memoryModel() }
})
vi.mock('@/features/architect-agent/server/generate', () => ({ runDiagram: mocks.runDiagram, retryPendingDeletions: mocks.retryPending }))
vi.mock('@/features/architect-agent/server/settings', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/architect-agent/server/settings')>()
  return {
    settingsApply: original.settingsApply,
    loadArchitectSettings: async () => ({ settings: mocks.settings }),
    architectAvailability: async () => (mocks.available ? { available: true, reason: null } : { available: false, reason: 'Modelo desconectado' }),
  }
})

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { ArchitectDiagram } from '@/features/architect-agent/server/models'
import { cleanupWorkbenchDiagrams, listWorkbenchDiagrams, onPlanApproved, requestDiagram, retryDiagram, workbenchArchitect } from '@/features/architect-agent/server/diagrams'
import { isDiagramLive, registerDiagram, releaseDiagram, liveDiagramIds, abortReasonOf } from '@/features/architect-agent/server/registry'

/** Limpa o registro entre os casos (cada entrada é liberada pelo próprio controlador). */
const live = (globalThis as unknown as { __architectLiveDiagrams: Map<string, unknown> }).__architectLiveDiagrams
const releaseAll = (id: string) => live.delete(id)
import { DEFAULT_ARCHITECT_SETTINGS, type ArchitectSettings } from '@/features/architect-agent/schemas'

const diagrams = ArchitectDiagram as unknown as { docs: Record<string, unknown>[] }
const workbenches = AgenticWorkbench as unknown as { docs: Record<string, unknown>[] }
const WB = 'a'.repeat(24)

const use = (patch: Partial<ArchitectSettings> = {}) => {
  mocks.settings = { ...DEFAULT_ARCHITECT_SETTINGS, enabled: true, agent: { agent: 'plan', model: 'anthropic/opus', variant: null, fallbacks: [] }, ...patch }
}
const seedWorkbench = (overrides: Record<string, unknown> = {}) =>
  workbenches.docs.push({ _id: WB, centralId: 'c1', taskId: 't1', taskCode: 'OPE-9', taskTitle: 'T', stage: 'implementing', plans: [{ version: 1, text: 'v1' }], branch: 'feat/ope-9', approvedPlanVersion: 1, deletionRequestedAt: null, ...overrides })
const flush = async () => {
  await Promise.all(mocks.tasks)
  mocks.tasks.length = 0
}

beforeEach(() => {
  vi.clearAllMocks()
  diagrams.docs.length = 0
  workbenches.docs.length = 0
  mocks.tasks.length = 0
  mocks.available = true
  for (const id of liveDiagramIds()) releaseAll(id)
  use()
})

describe('onPlanApproved', () => {
  it('automático: cria a versão "gerando" do plano aprovado e dispara a geração em segundo plano', async () => {
    seedWorkbench()
    await onPlanApproved(WB)
    await flush()
    expect(diagrams.docs).toHaveLength(1)
    expect(diagrams.docs[0]).toEqual(expect.objectContaining({ state: 'running', planVersion: 1, planSeq: 1, version: 1, origin: 'auto', depth: 3 }))
    expect(mocks.runDiagram).toHaveBeenCalledWith(String(diagrams.docs[0]!._id), expect.any(AbortController))
  })

  it('disparo manual, agente desativado ou fora do escopo: não gera e registra o motivo', async () => {
    seedWorkbench()
    use({ trigger: 'manual' })
    await onPlanApproved(WB)
    use({ scope: { all: false, centralIds: ['outra'] } })
    await onPlanApproved(WB)
    use({ enabled: false })
    await onPlanApproved(WB)
    expect(diagrams.docs).toHaveLength(0)
    expect(mocks.info).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('disparo manual'))
    expect(mocks.info).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('desativado para a central'))
  })

  it('aprovação repetida do mesmo plano não duplica', async () => {
    seedWorkbench()
    await onPlanApproved(WB)
    await onPlanApproved(WB)
    expect(diagrams.docs).toHaveLength(1)
    expect(mocks.info).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('aprovação repetida'))
  })

  it('plano v2 aprovado com a geração do v1 em curso: aborta a antiga (descartada) e gera a v2', async () => {
    seedWorkbench()
    await onPlanApproved(WB)
    const first = String(diagrams.docs[0]!._id)
    Object.assign(workbenches.docs[0]!, { plans: [{ version: 1 }, { version: 2 }], approvedPlanVersion: 2 })
    await onPlanApproved(WB)
    expect(abortReasonOf(first)).toBe('superseded')
    expect(diagrams.docs).toHaveLength(2)
    expect(diagrams.docs[1]).toEqual(expect.objectContaining({ planVersion: 2, planSeq: 1, version: 2 }))
  })

  it('erro de configuração não lança: vira aviso no log', async () => {
    mocks.settings = null
    await expect(onPlanApproved(WB)).resolves.toBeUndefined()
    expect(mocks.warn).toHaveBeenCalled()
  })
})

describe('requestDiagram (manual e ajuste)', () => {
  it('manual com geração em curso é recusado (409)', async () => {
    seedWorkbench()
    await requestDiagram(WB, {}, 'manual')
    await expect(requestDiagram(WB, { depth: 5 }, 'manual')).rejects.toMatchObject({ status: 409, code: 'ARCHITECT_BUSY' })
  })

  it('agente desativado ou mesa sem plano aprovado: 409 com mensagem acionável', async () => {
    seedWorkbench({ stage: 'plan_review', branch: null, approvedPlanVersion: null })
    await expect(requestDiagram(WB, {}, 'manual')).rejects.toMatchObject({ status: 409, code: 'ARCHITECT_NO_PLAN' })
    use({ enabled: false })
    await expect(requestDiagram(WB, {}, 'manual')).rejects.toMatchObject({ status: 409, code: 'ARCHITECT_DISABLED' })
  })

  it('ajuste usa a versão anterior como base e grava o pedido', async () => {
    seedWorkbench()
    diagrams.docs.push({ _id: 'b'.repeat(24), workbenchId: WB, version: 1, planVersion: 1, planSeq: 1, state: 'done', graph: { nodes: [] }, createdAt: new Date() })
    const created = await requestDiagram(WB, { feedback: 'junte as camadas de dados', depth: 4 }, 'manual')
    expect(created).toEqual(expect.objectContaining({ origin: 'adjust', feedback: 'junte as camadas de dados', depth: 4, version: 2, planSeq: 2 }))
    expect(diagrams.docs[1]!.baseDiagramId).toBe('b'.repeat(24))
  })

  it('ajuste sem diagrama pronto é recusado', async () => {
    seedWorkbench()
    await expect(requestDiagram(WB, { feedback: 'expanda' }, 'manual')).rejects.toMatchObject({ code: 'ARCHITECT_NO_BASE' })
  })
})

describe('retryDiagram e órfãos', () => {
  it('"Tentar novamente" refaz a mesma versão', async () => {
    seedWorkbench()
    diagrams.docs.push({ _id: 'c'.repeat(24), workbenchId: WB, centralId: 'c1', version: 1, planVersion: 1, planSeq: 1, state: 'failed', error: 'x', startedAt: new Date(), createdAt: new Date() })
    const dto = await retryDiagram('c'.repeat(24))
    expect(dto.state).toBe('running')
    expect(dto.version).toBe(1)
    expect(diagrams.docs).toHaveLength(1)
    expect(isDiagramLive('c'.repeat(24))).toBe(true)
  })

  it('"Tentar novamente" com a execução anterior ainda encerrando é recusado e não perde o registro', async () => {
    seedWorkbench()
    diagrams.docs.push({ _id: 'c'.repeat(24), workbenchId: WB, centralId: 'c1', version: 1, planVersion: 1, planSeq: 1, state: 'failed', error: 'x', startedAt: new Date(), createdAt: new Date() })
    // A execução que falhou ainda está no registro (excluindo a sessão do OpenCode).
    const previous = registerDiagram('c'.repeat(24), WB)
    await expect(retryDiagram('c'.repeat(24))).rejects.toMatchObject({ status: 409, code: 'ARCHITECT_BUSY' })
    expect(diagrams.docs[0]!.state).toBe('failed')
    expect(mocks.runDiagram).not.toHaveBeenCalled()
    releaseDiagram('c'.repeat(24), previous)
    await retryDiagram('c'.repeat(24))
    expect(isDiagramLive('c'.repeat(24))).toBe(true)
  })

  it('a execução antiga encerrando não libera o registro de uma execução nova da mesma versão', () => {
    const old = registerDiagram('9'.repeat(24), WB)
    const current = registerDiagram('9'.repeat(24), WB)
    releaseDiagram('9'.repeat(24), old)
    expect(isDiagramLive('9'.repeat(24))).toBe(true)
    releaseDiagram('9'.repeat(24), current)
    expect(isDiagramLive('9'.repeat(24))).toBe(false)
  })

  it('versão "gerando" sem geração viva (o app reiniciou) vira interrompida ao listar', async () => {
    seedWorkbench()
    diagrams.docs.push({ _id: 'd'.repeat(24), workbenchId: WB, version: 1, planVersion: 1, planSeq: 1, state: 'running', startedAt: new Date(), createdAt: new Date() })
    const [item] = await listWorkbenchDiagrams(WB)
    expect(item!.state).toBe('interrupted')
    expect(item!.error).toContain('o app reiniciou')
  })

  it('a lista esconde as versões descartadas', async () => {
    seedWorkbench()
    diagrams.docs.push({ _id: 'e'.repeat(24), workbenchId: WB, version: 1, planVersion: 1, planSeq: 1, state: 'superseded', startedAt: new Date(), createdAt: new Date() })
    expect(await listWorkbenchDiagrams(WB)).toHaveLength(0)
  })
})

describe('mesa', () => {
  it('exclusão aborta as gerações vivas da mesa', async () => {
    registerDiagram('f'.repeat(24), WB)
    await cleanupWorkbenchDiagrams(WB)
    expect(abortReasonOf('f'.repeat(24))).toBe('deleted')
  })

  it('o DTO da mesa diz se o arquiteto se aplica e a versão aprovada', async () => {
    expect(await workbenchArchitect({ centralId: 'c1', stage: 'implementing', plans: [1, 2], branch: 'b', approvedPlanVersion: 2 })).toEqual({ applies: true, approvedPlanVersion: 2 })
    use({ enabled: false })
    expect(await workbenchArchitect({ centralId: 'c1', stage: 'plan_review', plans: [1], branch: null })).toEqual({ applies: false, approvedPlanVersion: null })
  })
})

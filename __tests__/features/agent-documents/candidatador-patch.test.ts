import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'

const mocks = vi.hoisted(() => ({
  preview: false,
  agent: null as Record<string, unknown> | null,
  updates: [] as unknown[],
  audit: vi.fn(),
  memories: {} as Record<string, { id: string; key: string; channel: string; text: string; category: string } | undefined>,
  writes: [] as Record<string, unknown>[],
  engramindDown: false,
}))

vi.mock('@/lib/instance', () => ({ isPreviewInstance: () => mocks.preview }))
vi.mock('@/lib/audit/record', () => ({ recordAudit: mocks.audit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXECUTAR: 'EXECUTAR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/db/models/RoutineAgent', () => ({
  RoutineAgent: {
    collection: {
      findOne: async () => mocks.agent,
      updateOne: async (_filter: unknown, update: { $addToSet?: { 'opex.enabledTools': { $each: string[] } }; $set: Record<string, unknown> }) => {
        mocks.updates.push(update)
        const agent = mocks.agent!
        const opex = (agent.opex ?? {}) as { enabledTools?: string[] }
        if (update.$addToSet) opex.enabledTools = [...new Set([...(opex.enabledTools ?? []), ...update.$addToSet['opex.enabledTools'].$each])]
        agent.opex = opex
        if (typeof update.$set.instructions === 'string') agent.instructions = update.$set.instructions
        if (update.$set['migrations.ope210CurriculoAt']) agent.migrations = { ope210CurriculoAt: update.$set['migrations.ope210CurriculoAt'] }
      },
    },
  },
}))
vi.mock('@/features/engramind/server/instance', () => ({ channelNamespace: async () => ({ app: 'opex', prefixed: false }) }))
vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: async (method: string, request: { query?: { key: string }; body?: Record<string, unknown> }) => {
    if (mocks.engramindDown) throw new Error('Engramind fora do ar')
    if (method === 'GET') {
      const memory = mocks.memories[request.query!.key]
      return { memories: memory ? [memory] : [] }
    }
    mocks.writes.push(request.body!)
    return { memory: { id: 'm_x' }, created: false }
  },
}))

import { applyCandidatadorCurriculoPatch, CURRICULO_BLOCK_START, curriculosGeradosText, MEMORY_MARKER } from '@/features/agent-documents/server/candidatador-patch'

const OLD_INDEX = 'Índice dos currículos gravados em curriculos/ (workspace do Galaxy).\n1) 2026-11-15 · modelo base'

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  mocks.preview = false
  mocks.updates = []
  mocks.writes = []
  mocks.engramindDown = false
  mocks.audit.mockReset()
  mocks.agent = { _id: new Types.ObjectId(), instructions: 'Instruções atuais do Candidatador.', opex: { enabledTools: ['get_app_overview'] } }
  mocks.memories = {
    'curriculos-armazenamento': { id: 'm_1', key: 'curriculos-armazenamento', channel: 'agentes/rotineiros/candidatador', text: 'Regra antiga: gravar no Galaxy', category: 'PROJECT_RULES' },
    'curriculos-gerados': { id: 'm_2', key: 'curriculos-gerados', channel: 'agentes/rotineiros/candidatador', text: OLD_INDEX, category: 'PROJECT_RULES' },
  }
})
afterEach(() => vi.unstubAllEnvs())

describe('migração do Candidatador (OPE-210)', () => {
  it('libera as ferramentas, acrescenta o bloco nas instruções, regrava as memórias e grava o marcador', async () => {
    await applyCandidatadorCurriculoPatch({ background: false })
    expect((mocks.agent!.opex as { enabledTools: string[] }).enabledTools).toEqual(['get_app_overview', 'preparar_curriculo', 'obter_curriculo', 'get_s3', 'upload_s3'])
    expect(mocks.agent!.instructions).toContain('Instruções atuais do Candidatador.')
    expect(mocks.agent!.instructions).toContain(CURRICULO_BLOCK_START)
    expect(mocks.agent!.instructions).toContain('preparar_curriculo')
    expect(mocks.writes.map((body) => body.key)).toEqual(['curriculos-armazenamento', 'curriculos-gerados'])
    expect(mocks.writes.every((body) => body.channel === 'agentes/rotineiros/candidatador' && body.upsert === true)).toBe(true)
    // O índice antigo (currículos do Galaxy) é preservado abaixo do texto novo.
    expect(mocks.writes[1]!.text).toContain(OLD_INDEX)
    expect(mocks.writes[1]!.text).toContain('obter_curriculo')
    expect(mocks.agent!.migrations).toBeTruthy()
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'AgenteRotineiro', acao: 'ATUALIZAR' }))
  })

  it('é idempotente: com o marcador, não mexe em nada; sem ele, não duplica ferramentas nem o bloco', async () => {
    await applyCandidatadorCurriculoPatch({ background: false })
    const instructions = mocks.agent!.instructions
    mocks.updates = []
    await applyCandidatadorCurriculoPatch({ background: false })
    expect(mocks.updates).toHaveLength(0)

    delete mocks.agent!.migrations
    await applyCandidatadorCurriculoPatch({ background: false })
    expect(mocks.agent!.instructions).toBe(instructions)
    expect((mocks.agent!.opex as { enabledTools: string[] }).enabledTools.filter((name) => name === 'preparar_curriculo')).toHaveLength(1)
  })

  it('não roda na prévia nem fora de produção', async () => {
    mocks.preview = true
    await applyCandidatadorCurriculoPatch({ background: false })
    vi.stubEnv('NODE_ENV', 'development')
    mocks.preview = false
    await applyCandidatadorCurriculoPatch({ background: false })
    expect(mocks.updates).toHaveLength(0)
    expect(mocks.writes).toHaveLength(0)
  })

  it('Engramind fora do ar: não lança, não grava o marcador e registra a falha na auditoria', async () => {
    mocks.engramindDown = true
    await expect(applyCandidatadorCurriculoPatch({ background: false })).resolves.toBeUndefined()
    expect(mocks.agent!.migrations).toBeUndefined()
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'EXECUTAR', depois: expect.objectContaining({ erro: expect.stringContaining('falha ao atualizar memórias do Candidatador: Engramind fora do ar') }) }))
  })

  it('sem o Candidatador cadastrado, não faz nada', async () => {
    mocks.agent = null
    await expect(applyCandidatadorCurriculoPatch({ background: false })).resolves.toBeUndefined()
    expect(mocks.writes).toHaveLength(0)
  })

  it('o índice já migrado não é reescrito', () => {
    const migrated = curriculosGeradosText(OLD_INDEX)
    expect(migrated.startsWith(MEMORY_MARKER)).toBe(true)
    expect(curriculosGeradosText(migrated)).toBe(migrated)
  })
})

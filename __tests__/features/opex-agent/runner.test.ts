import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { memoryModel, type Doc } from '../../helpers/memory-model'

const mocks = vi.hoisted(() => ({
  parts: [] as unknown[],
  responseMessages: [] as unknown[],
  streamText: vi.fn(),
  recordAiConsumption: vi.fn(async () => {}),
  refreshSessionTitle: vi.fn(async () => {}),
  publishAppEvent: vi.fn(async () => {}),
  available: true,
  gate: null as Promise<void> | null,
}))

vi.mock('ai', () => ({
  isLoopFinished: () => () => false,
  dynamicTool: (def: unknown) => def,
  streamText: (options: unknown) => {
    mocks.streamText(options)
    return {
      fullStream: (async function* () {
        if (mocks.gate) await mocks.gate
        for (const part of mocks.parts) yield part
      })(),
      responseMessages: Promise.resolve(mocks.responseMessages),
    }
  },
}))
vi.mock('@/lib/ai/stream', () => ({
  prepareModel: async () => ({ model: { id: 'modelo' }, dispose: async () => {} }),
  samplingOptions: () => ({}),
  describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))
vi.mock('@/lib/ai/consumption', () => ({ recordAiConsumption: mocks.recordAiConsumption }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => {}, recordAudit: async () => {}, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent }))
vi.mock('@/lib/storage/s3', () => ({
  getFileObject: vi.fn(async () => ({ body: new Blob(['png']).stream() })),
  getUploadUrl: vi.fn(),
  headFile: vi.fn(),
  copyFile: vi.fn(),
  deleteFile: vi.fn(),
  storageErrorInfo: () => ({ kind: 'unavailable', httpStatus: null, code: null }),
}))

/** Coleções em memória (com `findOneAndUpdate` devolvendo o documento anterior, como `new: false`). */
function opexModel() {
  const model = memoryModel()
  const base = model.findOneAndUpdate
  return Object.assign(model, {
    createIndexes: async () => {},
    findOneAndUpdate: (filter: Doc, update: Doc, options?: { new?: boolean }) => ({
      lean: async () => {
        const [found] = (await model.find(filter).lean()) as Doc[]
        if (!found) return null
        const before = { ...found }
        const after = await base(filter, update).lean()
        return options?.new === false ? before : after
      },
    }),
    findByIdAndUpdate: (id: string, update: Doc) => base({ _id: id }, update),
    updateMany: async (filter: Doc, update: Doc) => {
      const found = (await model.find(filter).lean()) as Doc[]
      for (const doc of found) await model.updateOne({ _id: doc._id }, update)
      return { modifiedCount: found.length }
    },
  })
}
const store = vi.hoisted(() => ({ sessions: null as unknown, messages: null as unknown, actions: null as unknown, files: null as unknown }))
vi.mock('@/lib/db/models/Opex', () => {
  store.sessions = opexModel()
  store.messages = opexModel()
  store.actions = opexModel()
  store.files = opexModel()
  return { OpexSession: store.sessions, OpexMessage: store.messages, OpexPendingAction: store.actions, OpexFile: store.files }
})

const settings = {
  enabled: true,
  main: { provider: 'anthropic', model: 'claude-x', variant: null, temperature: null, maxOutputTokens: null },
  title: { provider: null, model: null, variant: null },
  instructions: 'Seja útil',
  titleInstructions: 'Título',
  toolGroups: {},
  files: { maxPerMessage: 5, maxSizeMb: 10 },
  confirmation: 'destructive',
}
vi.mock('@/features/opex-agent/server/settings', () => ({
  loadOpexSettings: async () => ({ settings, isDefault: false, updatedAt: null }),
  opexAvailability: async () => (mocks.available ? { available: true, reason: null } : { available: false, reason: 'Agente desativado' }),
}))
vi.mock('@/features/opex-agent/server/titler', () => ({ refreshSessionTitle: mocks.refreshSessionTitle }))
vi.mock('@/features/opex-agent/server/confirmations', () => ({
  requestConfirmation: vi.fn(),
  refreshConfirmations: async (parts: unknown[]) => parts,
}))
vi.mock('@/features/opex-agent/server/tools/context', () => ({ nowContext: () => ({ iso: '2026-10-19T12:00:00.000Z', local: 'segunda', timeZone: 'America/Sao_Paulo' }) }))
const fakeTool = { name: 'list_tasks', group: 'tasks', label: 'Listar tarefas', risk: 'read', description: 'd', input: { parse: (value: unknown) => value, safeParse: (value: unknown) => ({ success: true, data: value }) }, execute: async () => [] }
vi.mock('@/features/opex-agent/server/tools/registry', () => ({
  enabledOpexTools: () => [fakeTool],
  findOpexTool: (name: string) => (name === fakeTool.name ? fakeTool : undefined),
  needsConfirmation: () => false,
}))

import { sendMessage } from '@/features/opex-agent/server/runner'
import { isTurnActive, subscribeSession } from '@/features/opex-agent/server/hub'
import type { OpexStreamLine } from '@/features/opex-agent/types'

type Model = ReturnType<typeof opexModel>
const sessions = () => store.sessions as Model
const messages = () => store.messages as Model

async function newSession(): Promise<string> {
  const doc = await sessions().create({ title: 'Nova sessão', summary: '', titleSource: 'auto', status: 'idle', nextSeq: 1, messageCount: 0, lastMessageAt: new Date() })
  return String(doc._id)
}

async function runTurn(sessionId: string, text: string, fileIds: string[] = []): Promise<OpexStreamLine[]> {
  const lines: OpexStreamLine[] = []
  const ended = new Promise<void>((resolve) => {
    const unsubscribe = subscribeSession(sessionId, (line) => {
      lines.push(line)
      if (line.type === 'turn-end') {
        unsubscribe()
        resolve()
      }
    })
  })
  await sendMessage(sessionId, { text, fileIds }, 'local')
  await ended
  await vi.waitFor(() => expect(mocks.refreshSessionTitle).toHaveBeenCalled())
  return lines
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.parts = []
  mocks.responseMessages = []
  mocks.available = true
  mocks.gate = null
  for (const model of [sessions(), messages(), store.files as Model]) model.docs.splice(0)
})

describe('runner do Agente Opex', () => {
  it('roda o turno: texto e ferramenta ao vivo, grava a resposta com o histórico da AI SDK e mede o consumo', async () => {
    const sessionId = await newSession()
    mocks.parts = [
      { type: 'tool-call', toolCallId: 't1', toolName: 'list_tasks', input: { search: 'crm' } },
      { type: 'tool-result', toolCallId: 't1', toolName: 'list_tasks', output: { total: 2 } },
      { type: 'text-delta', id: 'x', text: 'Achei ' },
      { type: 'text-delta', id: 'x', text: '2 tarefas.' },
      { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 } },
    ]
    mocks.responseMessages = [{ role: 'assistant', content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'list_tasks', input: { search: 'crm' } }] }, { role: 'tool', content: [] }, { role: 'assistant', content: 'Achei 2 tarefas.' }]

    const lines = await runTurn(sessionId, 'Quais tarefas do CRM?')

    expect(lines.map((line) => line.type)).toEqual(['turn-start', 'tool-start', 'tool-input', 'tool-end', 'text-delta', 'text-delta', 'turn-end'])
    const options = mocks.streamText.mock.calls[0]![0] as { messages: unknown[]; instructions: string; tools: Record<string, unknown> }
    expect(options.messages).toEqual([{ role: 'user', content: 'Quais tarefas do CRM?' }])
    expect(options.instructions).toContain('Seja útil')
    expect(options.instructions).toContain('America/Sao_Paulo')
    expect(Object.keys(options.tools)).toEqual(['list_tasks'])

    const assistant = messages().docs.find((doc) => doc.role === 'assistant')!
    expect(assistant).toMatchObject({ status: 'complete', text: 'Achei 2 tarefas.', model: 'anthropic/claude-x' })
    expect(JSON.parse(assistant.modelMessages as string)).toEqual(mocks.responseMessages)
    expect(assistant.parts).toEqual([
      expect.objectContaining({ type: 'tool', id: 't1', name: 'list_tasks', label: 'Listar tarefas', state: 'done' }),
      { type: 'text', text: 'Achei 2 tarefas.' },
    ])
    expect(sessions().docs[0]).toMatchObject({ status: 'idle', lastError: null })
    expect(mocks.recordAiConsumption).toHaveBeenCalledWith(expect.objectContaining({ origin: 'opex-agent', subject: sessionId, totalTokens: 60, costUsd: null }))
    expect(mocks.refreshSessionTitle).toHaveBeenCalledWith(sessionId, settings, { userText: 'Quais tarefas do CRM?', assistantText: 'Achei 2 tarefas.', tools: ['Listar tarefas'] })
    expect(isTurnActive(sessionId)).toBe(false)
  })

  it('o próximo turno reenvia o histórico gravado (pedido + resposta) antes da nova mensagem', async () => {
    const sessionId = await newSession()
    mocks.parts = [{ type: 'text-delta', id: 'x', text: 'Oi!' }, { type: 'finish', finishReason: 'stop', totalUsage: {} }]
    mocks.responseMessages = [{ role: 'assistant', content: 'Oi!' }]
    await runTurn(sessionId, 'Olá')
    mocks.refreshSessionTitle.mockClear()
    await runTurn(sessionId, 'Tudo bem?')
    const options = mocks.streamText.mock.calls[1]![0] as { messages: unknown[] }
    expect(options.messages).toEqual([{ role: 'user', content: 'Olá' }, { role: 'assistant', content: 'Oi!' }, { role: 'user', content: 'Tudo bem?' }])
  })

  it('falha do provedor: mensagem com erro, sessão em erro e histórico de reserva que mantém a alternância', async () => {
    const sessionId = await newSession()
    mocks.parts = [{ type: 'text-delta', id: 'x', text: 'Vou ver' }, { type: 'error', error: new Error('Credencial recusada') }]
    await runTurn(sessionId, 'Faça algo')
    const assistant = messages().docs.find((doc) => doc.role === 'assistant')!
    expect(assistant).toMatchObject({ status: 'error', error: 'Credencial recusada' })
    expect(JSON.parse(assistant.modelMessages as string)).toEqual([{ role: 'assistant', content: expect.stringContaining('A resposta falhou: Credencial recusada') }])
    expect(sessions().docs[0]).toMatchObject({ status: 'error', lastError: 'Credencial recusada' })
  })

  it('arquivos da mensagem: histórico guarda o marcador, o modelo recebe a imagem baixada do S3 e o título cita o arquivo', async () => {
    const sessionId = await newSession()
    const file = await (store.files as Model).create({ sessionId: new Types.ObjectId(sessionId), messageId: null, pending: true, ready: true, name: 'print.png', mediaType: 'image/png', size: 3, key: 'opex/s/f/print.png', uploadKey: 'opex/tmp/f/print.png' })
    mocks.parts = [{ type: 'text-delta', id: 'x', text: 'Vi o print.' }, { type: 'finish', finishReason: 'stop', totalUsage: {} }]
    mocks.responseMessages = [{ role: 'assistant', content: 'Vi o print.' }]

    await runTurn(sessionId, 'Olha o erro', [String(file._id)])

    const user = messages().docs.find((doc) => doc.role === 'user')!
    expect(user.files).toEqual([{ id: String(file._id), name: 'print.png', mediaType: 'image/png', size: 3 }])
    expect(JSON.parse(user.modelMessages as string)).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Olha o erro' }, { type: 'opex-file', fileId: String(file._id), weight: 8000 }] }])
    const sent = (mocks.streamText.mock.calls[0]![0] as { messages: { content: { type: string }[] }[] }).messages[0]!
    expect(sent.content.map((part) => part.type)).toEqual(['text', 'text', 'image'])
    expect((store.files as Model).docs[0]).toMatchObject({ pending: false })
    expect(mocks.refreshSessionTitle).toHaveBeenCalledWith(sessionId, settings, expect.objectContaining({ userText: 'Olha o erro\n(arquivos: print.png)' }))
  })

  it('arquivo inválido recusa a mensagem e libera a sessão', async () => {
    const sessionId = await newSession()
    await expect(sendMessage(sessionId, { text: 'Oi', fileIds: ['f'.repeat(24)] }, 'local')).rejects.toMatchObject({ code: 'OPEX_FILE_NOT_FOUND' })
    expect(sessions().docs[0]).toMatchObject({ status: 'idle', nextSeq: 1, messageCount: 0 })
    expect(messages().docs).toHaveLength(0)
    expect(isTurnActive(sessionId)).toBe(false)
  })

  it('agente indisponível responde 409 sem gravar nada', async () => {
    const sessionId = await newSession()
    mocks.available = false
    await expect(sendMessage(sessionId, { text: 'Oi' }, 'local')).rejects.toMatchObject({ status: 409, message: 'Agente desativado' })
    expect(messages().docs).toHaveLength(0)
  })

  it('sessão respondendo recusa outra mensagem (409)', async () => {
    const sessionId = await newSession()
    let release: () => void = () => {}
    // Turno que só termina quando liberado.
    mocks.gate = new Promise<void>((resolve) => (release = resolve))
    mocks.parts = [{ type: 'finish', finishReason: 'stop', totalUsage: {} }]
    await sendMessage(sessionId, { text: 'Primeira' }, 'local')
    await expect(sendMessage(sessionId, { text: 'Segunda' }, 'local')).rejects.toMatchObject({ status: 409, code: 'OPEX_SESSION_BUSY' })
    release()
    await vi.waitFor(() => expect(isTurnActive(sessionId)).toBe(false))
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { memoryModel, type Doc } from '../../helpers/memory-model'

const mocks = vi.hoisted(() => ({
  queueFollowUp: vi.fn(async () => {}),
  execute: vi.fn(async (input: { id: string }) => ({ deleted: input.id })),
  recordAudit: vi.fn(async () => {}),
  resolveMcpTool: vi.fn(),
}))

const store = vi.hoisted(() => ({ messages: null as unknown, actions: null as unknown }))
vi.mock('@/lib/db/models/Opex', () => {
  const withUpdate = () => {
    const model = memoryModel()
    return Object.assign(model, { findByIdAndUpdate: (id: string, update: Doc) => model.findOneAndUpdate({ _id: id }, update) })
  }
  store.messages = withUpdate()
  store.actions = withUpdate()
  return { OpexMessage: store.messages, OpexPendingAction: store.actions, OpexSession: memoryModel() }
})
vi.mock('@/lib/db', () => ({ dbConnect: async () => {}, recordAudit: mocks.recordAudit, AcaoAuditoria: { EXECUTAR: 'EXECUTAR', ABORTAR: 'ABORTAR' } }))
vi.mock('@/features/opex-agent/server/sessions', () => ({
  opexDb: async () => {},
  publishSessionUpdated: async () => {},
  // A ação só é decidida por quem enxerga a sessão dona (escopo do dono nestes casos).
  loadSession: async () => ({ _id: 'a'.repeat(24), clientId: null, userId: 'local' }),
}))
vi.mock('@/features/opex-agent/server/runner', () => ({ queueFollowUp: mocks.queueFollowUp }))
vi.mock('ai', () => ({ dynamicTool: (def: unknown) => def }))
const tool = { name: 'delete_thing', group: 'tasks', label: 'Excluir', risk: 'destructive', description: 'd', input: z.object({ id: z.string() }), summarize: (input: { id: string }) => `Excluir ${input.id}`, execute: mocks.execute }
vi.mock('@/features/opex-agent/server/mcp/tools', () => ({ resolveMcpTool: mocks.resolveMcpTool }))
vi.mock('@/features/opex-agent/server/tools/registry', () => ({ findOpexTool: (name: string) => (name === tool.name ? tool : undefined) }))

import { decideAction, requestConfirmation } from '@/features/opex-agent/server/confirmations'
import type { OpexTool } from '@/features/opex-agent/server/tools/define'

type Model = ReturnType<typeof memoryModel>
const actions = () => store.actions as Model
const messages = () => store.messages as Model
const SESSION = 'a'.repeat(24)
const MESSAGE = 'b'.repeat(24)

beforeEach(() => {
  vi.clearAllMocks()
  actions().docs.splice(0)
  messages().docs.splice(0)
})

async function pending(): Promise<string> {
  const confirmation = await requestConfirmation(SESSION, MESSAGE, tool as unknown as OpexTool, { id: 'x1' }, 'call-1')
  await messages().create({ _id: MESSAGE, parts: [{ type: 'tool', id: 'call-1', name: tool.name, state: 'done', output: null, confirmation }] })
  return confirmation.actionId
}

describe('confirmações do Agente Opex', () => {
  it('pedir confirmação grava a pendência com o resumo, sem executar', async () => {
    const actionId = await pending()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(actions().docs[0]).toMatchObject({ toolName: 'delete_thing', summary: 'Excluir x1', status: 'pending' })
    expect(actionId).toBeTruthy()
  })

  it('confirmar executa a ferramenta, atualiza o card e devolve o resultado ao agente', async () => {
    const actionId = await pending()
    const result = await decideAction(actionId, 'confirm', 'local')
    expect(result.status).toBe('confirmed')
    expect(mocks.execute).toHaveBeenCalledWith({ id: 'x1' }, { sessionId: SESSION, actorId: 'local', scope: { kind: 'owner' } })
    expect((messages().docs[0]!.parts as Doc[])[0]).toMatchObject({ confirmation: { status: 'confirmed' }, output: expect.stringContaining('x1') })
    expect(mocks.queueFollowUp).toHaveBeenCalledWith(SESSION, expect.objectContaining({ kind: 'confirmation', display: 'Confirmado: Excluir x1', text: expect.stringContaining('CONFIRMOU') }))
    expect(actions().docs[0]!.input).toBeNull()
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'EXECUTAR' }))
  })

  it('cancelar não executa e avisa o agente; decidir de novo é recusado', async () => {
    const actionId = await pending()
    await decideAction(actionId, 'cancel', 'local')
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.queueFollowUp).toHaveBeenCalledWith(SESSION, expect.objectContaining({ display: 'Cancelado: Excluir x1', text: expect.stringContaining('CANCELOU') }))
    await expect(decideAction(actionId, 'confirm', 'local')).rejects.toMatchObject({ status: 409, code: 'OPEX_ACTION_DECIDED' })
  })

  it('execução confirmada que falha marca a ação como falha e conta ao agente', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('Storage fora do ar'))
    const actionId = await pending()
    const result = await decideAction(actionId, 'confirm', 'local')
    expect(result).toMatchObject({ status: 'failed', error: 'Storage fora do ar' })
    expect(mocks.queueFollowUp).toHaveBeenCalledWith(SESSION, expect.objectContaining({ text: expect.stringContaining('falhou: Storage fora do ar') }))
  })

  it('confirmação expirada é recusada', async () => {
    const actionId = await pending()
    actions().docs[0]!.expiresAt = new Date(Date.now() - 1000)
    await expect(decideAction(actionId, 'confirm', 'local')).rejects.toMatchObject({ status: 409, code: 'OPEX_ACTION_EXPIRED' })
  })

  it('ferramenta de MCP confirmada: reconecta ao MCP, executa e fecha a conexão', async () => {
    const execute = vi.fn(async () => 'feito')
    const close = vi.fn(async () => {})
    const mcpTool = { ...tool, name: 'mcp_gh_create', group: 'mcp', execute }
    mocks.resolveMcpTool.mockResolvedValue({ tool: mcpTool, close })
    const confirmation = await requestConfirmation(SESSION, MESSAGE, mcpTool as unknown as OpexTool, { id: 'x1' }, 'call-1')
    await messages().create({ _id: MESSAGE, parts: [{ type: 'tool', id: 'call-1', name: mcpTool.name, state: 'done', output: null, confirmation }] })
    const result = await decideAction(confirmation.actionId, 'confirm', 'local')
    expect(result.status).toBe('confirmed')
    expect(mocks.resolveMcpTool).toHaveBeenCalledWith('mcp_gh_create', { kind: 'owner' })
    expect(execute).toHaveBeenCalledWith({ id: 'x1' }, expect.objectContaining({ sessionId: SESSION }))
    expect(close).toHaveBeenCalled()
  })

  it('MCP desabilitado entre o pedido e a decisão: a ação falha com motivo claro', async () => {
    mocks.resolveMcpTool.mockResolvedValue(null)
    const mcpTool = { ...tool, name: 'mcp_gh_create', group: 'mcp' }
    const confirmation = await requestConfirmation(SESSION, MESSAGE, mcpTool as unknown as OpexTool, { id: 'x1' }, 'call-1')
    await messages().create({ _id: MESSAGE, parts: [{ type: 'tool', id: 'call-1', name: mcpTool.name, state: 'done', output: null, confirmation }] })
    const result = await decideAction(confirmation.actionId, 'confirm', 'local')
    expect(result.status).toBe('failed')
    expect(result.error).toContain('O MCP desta ferramenta foi desabilitado')
  })
})

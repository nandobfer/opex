import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => {}),
  publishAppEvent: vi.fn(async () => {}),
  publishToChannels: vi.fn(async () => {}),
  clientActorFor: vi.fn(),
  abortTurn: vi.fn(() => true),
}))

const store = vi.hoisted(() => ({ clients: null as unknown, sessions: null as unknown }))
vi.mock('@/lib/db/models/Orcamento', () => {
  store.clients = memoryModel()
  return { OrcamentoClient: store.clients }
})
vi.mock('@/lib/db/models/Opex', () => {
  store.sessions = memoryModel()
  return { OpexSession: store.sessions }
})
vi.mock('@/lib/db', () => ({ dbConnect: async () => {}, recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent, publishToChannels: mocks.publishToChannels }))
vi.mock('@/features/auth/server/context', () => ({ clientActorFor: mocks.clientActorFor }))
vi.mock('@/features/opex-agent/server/hub', () => ({ abortTurn: mocks.abortTurn }))
vi.mock('@/features/maddox-agent/server/settings', () => ({
  loadMaddoxSettings: async () => ({ settings: { main: { model: 'anthropic/claude', variant: null }, color: 'sky', files: { maxPerMessage: 10, maxSizeMb: 100 } } }),
  maddoxAvailability: async () => ({ available: true, reason: null }),
  maddoxModelLabel: (model: string | null) => (model ? `OpenCode · ${model}` : null),
}))

import {
  assertClientMaddoxEnabled,
  assertClientMaddoxToolAllowed,
  clientMaddoxStatus,
  getClientMaddoxConfig,
  normalizeClientMaddoxConfig,
  saveClientMaddoxConfig,
} from '@/features/maddox-agent/server/client-config'
import { MADDOX_CLIENT_TOOL_NAMES } from '@/features/maddox-agent/catalog'

const clients = () => store.clients as ReturnType<typeof memoryModel>
const sessions = () => store.sessions as ReturnType<typeof memoryModel>
const actor = (clientId: string, isAdmin = false) => ({ userId: 'u1', displayName: 'Ana', username: 'ana', email: null, client: { _id: clientId, name: 'ACME' }, isAdmin, preview: false })

let clientId = ''
beforeEach(async () => {
  vi.clearAllMocks()
  clients().docs.splice(0)
  sessions().docs.splice(0)
  clientId = String((await clients().create({ name: 'ACME', active: true }))._id)
  mocks.clientActorFor.mockImplementation(async (userId: string, id: string) => actor(id))
})

describe('Agente Maddox por cliente', () => {
  it('desligado por padrão: clientes existentes ficam sem o Maddox e as rotas recusam', async () => {
    expect(normalizeClientMaddoxConfig(undefined)).toEqual({ enabled: false, disabledTools: [] })
    expect((await getClientMaddoxConfig(clientId)).enabled).toBe(false)
    await expect(assertClientMaddoxEnabled(actor(clientId) as never)).rejects.toMatchObject({ status: 403, code: 'MADDOX_CLIENT_DISABLED' })
    const status = await clientMaddoxStatus(actor(clientId) as never)
    expect(status).toMatchObject({ enabled: false, available: false })
  })

  it('ligar com uma seleção grava as desligadas, audita e avisa o app e o portal', async () => {
    const enabledTools = MADDOX_CLIENT_TOOL_NAMES.filter((name) => name !== 'delete_user')
    const saved = await saveClientMaddoxConfig(clientId, { enabled: true, enabledTools }, 'local')
    expect(saved.enabled).toBe(true)
    expect(saved.enabledTools).not.toContain('delete_user')
    expect(clients().docs[0].maddoxAgent).toEqual({ enabled: true, disabledTools: ['delete_user'] })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'ClienteOrcamentoMaddoxAgent', entidadeId: clientId }))
    expect(mocks.publishAppEvent).toHaveBeenCalledWith('maddox-client-config-updated', { clientId })
    expect(mocks.publishToChannels).toHaveBeenCalledWith([`private-client-${clientId}`], 'maddox-client-config-updated', { clientId })
    const status = await clientMaddoxStatus(actor(clientId) as never)
    expect(status).toMatchObject({ enabled: true, available: true, color: 'sky', model: 'anthropic/claude' })
  })

  it('nome fora do catálogo do Maddox (ex.: jobs) é recusado', async () => {
    await expect(saveClientMaddoxConfig(clientId, { enabled: true, enabledTools: ['schedule_job'] }, 'local')).rejects.toMatchObject({ status: 400, code: 'MADDOX_TOOL_UNKNOWN' })
  })

  it('desligar interrompe os turnos em andamento do cliente', async () => {
    await saveClientMaddoxConfig(clientId, { enabled: true, enabledTools: [...MADDOX_CLIENT_TOOL_NAMES] }, 'local')
    const running = await sessions().create({ agent: 'maddox', clientId, status: 'running' })
    await sessions().create({ agent: 'opex', clientId, status: 'running' })
    await saveClientMaddoxConfig(clientId, { enabled: false, enabledTools: [...MADDOX_CLIENT_TOOL_NAMES] }, 'local')
    expect(mocks.abortTurn).toHaveBeenCalledTimes(1)
    expect(mocks.abortTurn).toHaveBeenCalledWith(String(running._id), expect.stringContaining('desativado'))
  })

  it('cada chamada revalida o ator: ferramenta desligada ou de admin sem papel é recusada', async () => {
    await saveClientMaddoxConfig(clientId, { enabled: true, enabledTools: MADDOX_CLIENT_TOOL_NAMES.filter((name) => name !== 'list_tasks') }, 'local')
    await expect(assertClientMaddoxToolAllowed('list_tasks', actor(clientId) as never)).rejects.toMatchObject({ status: 403, code: 'MADDOX_TOOL_DISABLED' })
    await expect(assertClientMaddoxToolAllowed('get_finance', actor(clientId) as never)).rejects.toMatchObject({ status: 403 })
    mocks.clientActorFor.mockResolvedValueOnce(actor(clientId, true))
    await expect(assertClientMaddoxToolAllowed('get_finance', actor(clientId) as never)).resolves.toMatchObject({ isAdmin: true })
  })
})

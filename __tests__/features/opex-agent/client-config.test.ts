import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => {}),
  publishAppEvent: vi.fn(async () => {}),
  publishToChannels: vi.fn(async () => {}),
  clientActorFor: vi.fn(),
  loadOpexSettings: vi.fn(async () => ({
    settings: { main: { provider: 'gemini', model: 'gemini-2.5-flash', variant: null }, files: { maxPerMessage: 10, maxSizeMb: 100 } },
  })),
}))

const store = vi.hoisted(() => ({ clients: null as unknown }))
vi.mock('@/lib/db/models/Orcamento', () => {
  store.clients = memoryModel()
  return { OrcamentoClient: store.clients }
})
vi.mock('@/lib/db', () => ({
  dbConnect: async () => {},
  recordAudit: mocks.recordAudit,
  AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR' },
}))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent, publishToChannels: mocks.publishToChannels }))
vi.mock('@/features/opex-agent/server/settings', () => ({
  loadOpexSettings: mocks.loadOpexSettings,
  opexAvailability: async () => ({ available: true, reason: null }),
}))
vi.mock('@/features/auth/server/context', () => ({ clientActorFor: mocks.clientActorFor }))

import {
  assertClientOpexEnabled,
  assertClientToolAllowed,
  clientOpexConfigDto,
  clientOpexStatus,
  getClientOpexConfig,
  loadClientOpexConfig,
  normalizeClientOpexConfig,
  saveClientOpexConfig,
} from '@/features/opex-agent/server/client-config'
import { OPEX_CLIENT_CONTEXT_TOOL, OPEX_CLIENT_TOOLS, OPEX_CLIENT_TOOL_NAMES } from '@/features/opex-agent/client-tools'
import type { ClientActor } from '@/features/auth/server/context'
import type { MemoryModel } from '../../helpers/memory-model'

const clients = () => store.clients as MemoryModel
const CLIENT_A = 'a'.repeat(24)
const CLIENT_B = 'b'.repeat(24)

const actor = (clientId: string): ClientActor =>
  ({
    userId: 'u1',
    displayName: 'Ana',
    username: 'ana',
    email: null,
    client: { _id: clientId, name: 'ACME' },
    isAdmin: true,
    preview: false,
  }) as unknown as ClientActor

beforeEach(() => {
  vi.clearAllMocks()
  clients().docs.splice(0)
  clients().docs.push({ _id: CLIENT_A, name: 'ACME' }, { _id: CLIENT_B, name: 'Outro' })
})

describe('configuração do Agente Opex por cliente', () => {
  it('sem configuração salva, o agente vem ativado com todas as ferramentas do portal', async () => {
    expect(await loadClientOpexConfig(CLIENT_A)).toEqual({ enabled: true, disabledTools: [] })
    const dto = await getClientOpexConfig(CLIENT_A)
    expect(dto.enabled).toBe(true)
    expect(dto.enabledTools).toEqual(OPEX_CLIENT_TOOL_NAMES)
  })

  it('normaliza valor ausente e ignora nomes fora do catálogo', () => {
    expect(normalizeClientOpexConfig(undefined)).toEqual({ enabled: true, disabledTools: [] })
    expect(normalizeClientOpexConfig({ enabled: false, disabledTools: [OPEX_CLIENT_CONTEXT_TOOL, 'nao_existe', 'list_tasks'] })).toEqual({ enabled: false, disabledTools: ['list_tasks'] })
  })

  it('salvar guarda as ferramentas desligadas e mantém o contexto sempre ligado', async () => {
    const enabledTools = OPEX_CLIENT_TOOL_NAMES.filter((name) => name !== 'delete_user' && name !== OPEX_CLIENT_CONTEXT_TOOL)
    const saved = await saveClientOpexConfig(CLIENT_A, { enabled: true, enabledTools }, 'local')

    expect(saved.enabledTools).toContain(OPEX_CLIENT_CONTEXT_TOOL)
    expect(saved.enabledTools).not.toContain('delete_user')
    expect(await loadClientOpexConfig(CLIENT_A)).toEqual({ enabled: true, disabledTools: ['delete_user'] })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidadeId: CLIENT_A, acao: 'ATUALIZAR' }))
    expect(mocks.publishAppEvent).toHaveBeenCalledWith('opex-client-config-updated', { clientId: CLIENT_A })
    expect(mocks.publishToChannels).toHaveBeenCalledWith([`private-client-${CLIENT_A}`], 'opex-client-config-updated', { clientId: CLIENT_A })
  })

  it('desativar o agente vale só para aquele cliente', async () => {
    await saveClientOpexConfig(CLIENT_A, { enabled: false, enabledTools: [OPEX_CLIENT_CONTEXT_TOOL] }, 'local')
    expect((await loadClientOpexConfig(CLIENT_A)).enabled).toBe(false)
    expect((await loadClientOpexConfig(CLIENT_B)).enabled).toBe(true)
  })

  it('recusa ferramenta que não existe no catálogo', async () => {
    await expect(saveClientOpexConfig(CLIENT_A, { enabled: true, enabledTools: ['ferramenta_inventada'] }, 'local')).rejects.toMatchObject({ code: 'OPEX_TOOL_UNKNOWN' })
  })

  it('o DTO mostra todas as ferramentas quando estão ligadas (inclusive as de admin)', () => {
    const dto = clientOpexConfigDto({ enabled: true, disabledTools: [] })
    expect(dto.enabledTools).toHaveLength(OPEX_CLIENT_TOOLS.length)
    expect(dto.enabledTools).toContain('delete_user')
  })

  it('agente desativado recusa o uso no portal', async () => {
    clients().docs.push({ _id: 'c'.repeat(24), name: 'Off', opexAgent: { enabled: false, disabledTools: [] } })
    await expect(assertClientOpexEnabled(actor('c'.repeat(24)))).rejects.toMatchObject({ code: 'OPEX_CLIENT_DISABLED' })
  })

  it('revalida o vínculo e a ferramenta na hora de executar (adminOnly e desligadas)', async () => {
    clients().docs.push({ _id: 'd'.repeat(24), name: 'Com config', opexAgent: { enabled: true, disabledTools: ['delete_user'] } })
    const fresh = actor('d'.repeat(24))
    mocks.clientActorFor.mockResolvedValue(fresh)
    await expect(assertClientToolAllowed('delete_user', fresh)).rejects.toMatchObject({ code: 'OPEX_TOOL_DISABLED' })

    const nonAdmin = { ...fresh, isAdmin: false } as unknown as ClientActor
    mocks.clientActorFor.mockResolvedValue(nonAdmin)
    await expect(assertClientToolAllowed('list_users', nonAdmin)).rejects.toMatchObject({ code: 'OPEX_TOOL_DISABLED' })
    await expect(assertClientToolAllowed('list_tasks', nonAdmin)).resolves.toMatchObject({ isAdmin: false })
  })

  it('a situação do portal informa a ativação, o modelo e os limites de arquivo', async () => {
    const status = await clientOpexStatus(actor(CLIENT_A))
    expect(status).toMatchObject({ enabled: true, available: true, reason: null, files: { maxPerMessage: 10, maxSizeMb: 100 } })
    expect(status.modelLabel).toContain('gemini-2.5-flash')
  })
})

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
vi.mock('@/features/opex-agent/server/mcp/service', () => ({
  existingMcpServerIds: async (ids: string[]) => ids.filter((id) => id !== MISSING_MCP),
  loadEnabledMcpServers: async (ids: string[]) => ids.filter((id) => id === MCP_ON).map((id) => ({ _id: id })),
}))

import {
  setClientMcpAccess,
  assertClientOpexEnabled,
  assertClientToolAllowed,
  clientOpexConfigDto,
  clientOpexStatus,
  getClientOpexConfig,
  loadClientOpexConfig,
  normalizeClientOpexConfig,
  saveClientOpexConfig,
} from '@/features/opex-agent/server/client-config'
import { OPEX_CLIENT_CONTEXT_TOOL, OPEX_CLIENT_OPT_IN_TOOLS, OPEX_CLIENT_TOOLS, OPEX_CLIENT_TOOL_NAMES } from '@/features/opex-agent/client-tools'
import type { ClientActor } from '@/features/auth/server/context'
import type { MemoryModel } from '../../helpers/memory-model'

const clients = () => store.clients as MemoryModel
const CLIENT_A = 'a'.repeat(24)
const CLIENT_B = 'b'.repeat(24)
const MCP_ON = 'c'.repeat(24)
const MCP_OFF = 'd'.repeat(24)
const MISSING_MCP = 'e'.repeat(24)

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
  it('sem configuração salva, o agente vem ativado com todas as ferramentas do portal, menos as desligadas por padrão', async () => {
    expect(await loadClientOpexConfig(CLIENT_A)).toEqual({ enabled: true, disabledTools: [], enabledOptInTools: [], enabledMcpServers: [] })
    const dto = await getClientOpexConfig(CLIENT_A)
    expect(dto.enabled).toBe(true)
    expect(dto.enabledTools).toEqual(OPEX_CLIENT_TOOL_NAMES.filter((name) => !OPEX_CLIENT_OPT_IN_TOOLS.includes(name)))
    expect(dto.enabledTools).not.toContain('schedule_job')
  })

  it('normaliza valor ausente e ignora nomes fora do catálogo', () => {
    expect(normalizeClientOpexConfig(undefined)).toEqual({ enabled: true, disabledTools: [], enabledOptInTools: [], enabledMcpServers: [] })
    expect(normalizeClientOpexConfig({ enabled: false, disabledTools: [OPEX_CLIENT_CONTEXT_TOOL, 'nao_existe', 'list_tasks'], enabledOptInTools: ['list_tasks', 'list_jobs'] })).toEqual({
      enabled: false,
      disabledTools: ['list_tasks'],
      enabledOptInTools: ['list_jobs'],
      enabledMcpServers: [],
    })
  })

  it('salvar guarda as ferramentas desligadas e mantém o contexto sempre ligado', async () => {
    const enabledTools = OPEX_CLIENT_TOOL_NAMES.filter((name) => name !== 'delete_user' && name !== OPEX_CLIENT_CONTEXT_TOOL)
    const saved = await saveClientOpexConfig(CLIENT_A, { enabled: true, enabledTools }, 'local')

    expect(saved.enabledTools).toContain(OPEX_CLIENT_CONTEXT_TOOL)
    expect(saved.enabledTools).not.toContain('delete_user')
    expect(await loadClientOpexConfig(CLIENT_A)).toEqual({ enabled: true, disabledTools: ['delete_user'], enabledOptInTools: [...OPEX_CLIENT_OPT_IN_TOOLS], enabledMcpServers: [] })
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

  it('o DTO mostra todas as ferramentas quando estão ligadas (inclusive as de admin e as ligadas por escolha)', () => {
    const dto = clientOpexConfigDto({ enabled: true, disabledTools: [], enabledOptInTools: [...OPEX_CLIENT_OPT_IN_TOOLS] })
    expect(dto.enabledTools).toHaveLength(OPEX_CLIENT_TOOLS.length)
    expect(dto.enabledTools).toContain('delete_user')
  })

  it('jobs são opt-in: cliente existente fica sem eles; ligar grava em enabledOptInTools e desligar remove', async () => {
    clients().docs.push({ _id: 'e'.repeat(24), name: 'Antigo', opexAgent: { enabled: true, disabledTools: ['delete_user'] } })
    const legacy = await getClientOpexConfig('e'.repeat(24))
    expect(legacy.enabledTools).not.toContain('list_jobs')

    const withJobs = await saveClientOpexConfig(CLIENT_A, { enabled: true, enabledTools: ['list_tasks', 'list_jobs', 'schedule_job'] }, 'local')
    expect(withJobs.enabledTools).toEqual(expect.arrayContaining(['list_jobs', 'schedule_job']))
    expect(withJobs.enabledTools).not.toContain('cancel_job')
    const stored = await loadClientOpexConfig(CLIENT_A)
    expect(stored.enabledOptInTools).toEqual(['list_jobs', 'schedule_job'])
    expect(stored.disabledTools).not.toContain('cancel_job')
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ ligadasPorEscolha: ['list_jobs', 'schedule_job'] }) }))

    await saveClientOpexConfig(CLIENT_A, { enabled: true, enabledTools: ['list_tasks'] }, 'local')
    expect((await loadClientOpexConfig(CLIENT_A)).enabledOptInTools).toEqual([])
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

  it('MCPs: desligados por padrão, liberados por cliente e mantidos quando a tela salva só as ferramentas', async () => {
    expect((await getClientOpexConfig(CLIENT_A)).enabledMcpServers).toEqual([])
    const saved = await saveClientOpexConfig(CLIENT_A, { enabled: true, enabledTools: [OPEX_CLIENT_CONTEXT_TOOL], enabledMcpServers: [MCP_ON, MCP_ON] }, 'local')
    expect(saved.enabledMcpServers).toEqual([MCP_ON])
    expect((await loadClientOpexConfig(CLIENT_B)).enabledMcpServers).toEqual([])
    await saveClientOpexConfig(CLIENT_A, { enabled: true, enabledTools: [OPEX_CLIENT_CONTEXT_TOOL] }, 'local')
    expect((await loadClientOpexConfig(CLIENT_A)).enabledMcpServers).toEqual([MCP_ON])
    expect(mocks.recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ depois: expect.objectContaining({ mcps: [MCP_ON] }) }))
  })

  it('MCP inexistente dá 400 OPEX_MCP_NOT_FOUND', async () => {
    await expect(saveClientOpexConfig(CLIENT_A, { enabled: true, enabledTools: [], enabledMcpServers: [MISSING_MCP] }, 'local')).rejects.toMatchObject({ status: 400, code: 'OPEX_MCP_NOT_FOUND' })
  })

  it('setClientMcpAccess libera e retira um MCP do cliente', async () => {
    expect((await setClientMcpAccess(CLIENT_A, MCP_ON, true, 'local')).enabledMcpServers).toEqual([MCP_ON])
    expect((await setClientMcpAccess(CLIENT_A, MCP_ON, false, 'local')).enabledMcpServers).toEqual([])
  })

  it('ferramenta de MCP no portal: exige o MCP liberado ao cliente e habilitado no agente', async () => {
    mocks.clientActorFor.mockResolvedValue(actor(CLIENT_A))
    await saveClientOpexConfig(CLIENT_A, { enabled: true, enabledTools: [], enabledMcpServers: [MCP_ON, MCP_OFF] }, 'local')
    await expect(assertClientToolAllowed('mcp_x_y', actor(CLIENT_A), MCP_ON)).resolves.toBeTruthy()
    // Liberado, mas desabilitado no agente.
    await expect(assertClientToolAllowed('mcp_x_y', actor(CLIENT_A), MCP_OFF)).rejects.toMatchObject({ status: 403, code: 'OPEX_TOOL_DISABLED' })
    // Habilitado, mas não liberado a este cliente.
    mocks.clientActorFor.mockResolvedValue(actor(CLIENT_B))
    await expect(assertClientToolAllowed('mcp_x_y', actor(CLIENT_B), MCP_ON)).rejects.toMatchObject({ status: 403 })
  })
})

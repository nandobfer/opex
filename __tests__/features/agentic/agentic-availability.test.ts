import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-91: Implementar/enviar mensagem não é bloqueado por um status gravado desatualizado. */

const mocks = vi.hoisted(() => ({ confirm: vi.fn() }))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: vi.fn(), AcaoAuditoria: {} }))
vi.mock('@/lib/db/models/Ai', () => ({ AiFeatureSetting: { findOne: vi.fn(), updateOne: vi.fn() } }))
vi.mock('@/lib/ai/catalog', () => ({ listAiModels: vi.fn(async () => []), listAiAgents: vi.fn(async () => []) }))
vi.mock('@/lib/ai/connection', () => ({ confirmAiProviderConnection: mocks.confirm }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: vi.fn() }))

import { DEFAULT_AGENTIC_SETTINGS } from '@/features/agentic/schemas'
import { agenticAvailability, assertAgentConfigs } from '@/features/agentic/server/settings'

const enabled = { ...DEFAULT_AGENTIC_SETTINGS, enabled: true }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('agenticAvailability', () => {
  it('conexão restabelecida (status gravado velho, OpenCode respondendo): disponível', async () => {
    mocks.confirm.mockResolvedValue({ configured: true, connected: true, detail: null })
    expect(await agenticAvailability(enabled)).toEqual({ available: true, reason: null })
    expect(mocks.confirm).toHaveBeenCalledWith('opencode')
  })

  it('indisponível de fato: o motivo traz a falha real e onde conferir', async () => {
    mocks.confirm.mockResolvedValue({ configured: true, connected: false, detail: 'tempo limite excedido' })
    const result = await agenticAvailability(enabled)
    expect(result.available).toBe(false)
    expect(result.reason).toContain('O OpenCode não está conectado (tempo limite excedido)')
    expect(result.reason).toContain('opencode serve')
  })

  it('não configurado e feature desativada mantêm os motivos', async () => {
    mocks.confirm.mockResolvedValue({ configured: false, connected: false, detail: null })
    expect((await agenticAvailability(enabled)).reason).toContain('não está configurado')
    expect((await agenticAvailability(DEFAULT_AGENTIC_SETTINGS)).reason).toContain('desativado')
  })
})

describe('assertAgentConfigs', () => {
  const configs = [{ label: 'Build', config: { agent: 'build', model: null, variant: null, fallbacks: [] } }]

  it('desconectado de fato e estrito: recusa com o motivo', async () => {
    mocks.confirm.mockResolvedValue({ configured: true, connected: false, detail: 'ECONNREFUSED' })
    await expect(assertAgentConfigs(configs, true)).rejects.toMatchObject({ status: 409, code: 'AI_PROVIDER_DISCONNECTED', message: expect.stringContaining('ECONNREFUSED') })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  saved: null as unknown,
  assertCatalog: vi.fn(async () => {}),
  persistFeature: vi.fn(async (_feature: string, next: unknown) => {
    mocks.saved = next
  }),
  ensureMcp: vi.fn(async () => ({ ok: true, error: null })),
  publishToClients: vi.fn(async () => {}),
}))

vi.mock('@/features/ai/server/settings', () => ({
  loadFeature: async (_feature: string, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }, defaults: unknown) => {
    if (!mocks.saved) return { settings: defaults, isDefault: true, updatedAt: null }
    const parsed = schema.safeParse(mocks.saved)
    return { settings: parsed.success ? parsed.data : defaults, isDefault: !parsed.success, updatedAt: null }
  },
  availability: async (settings: { enabled: boolean }) => (settings.enabled ? { available: true, reason: null } : { available: false, reason: '"Agente Maddox" está desativada' }),
  assertCatalog: mocks.assertCatalog,
  persistFeature: mocks.persistFeature,
}))
vi.mock('@/features/opex-agent/server/tools/registry', () => ({
  opexToolMetas: () => [
    { name: 'get_app_overview', group: 'context', label: 'Visão', description: '', risk: 'read', alwaysOn: true },
    { name: 'list_tasks', group: 'tasks', label: 'Listar', description: '', risk: 'read', alwaysOn: false },
    { name: 'schedule_job', group: 'jobs', label: 'Agendar', description: '', risk: 'write', alwaysOn: false },
  ],
}))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: async () => ({}) }))
vi.mock('@/features/maddox-agent/server/opencode-session', () => ({ ensureMaddoxMcp: mocks.ensureMcp, maddoxDirectory: async () => '/home/dono' }))
vi.mock('@/features/maddox-agent/server/client-config', () => ({ publishMaddoxSettingsToClients: mocks.publishToClients }))

import { getMaddoxSettings, saveMaddoxSettings, withMaddoxDefaults } from '@/features/maddox-agent/server/settings'
import { DEFAULT_MADDOX_AGENT_SETTINGS, maddoxAgentSettingsSchema } from '@/features/maddox-agent/schemas'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.saved = null
})

describe('configuração do Agente Maddox', () => {
  it('padrão: inativo, cor primária, sem modelo; o catálogo de ferramentas fica sem jobs', async () => {
    const dto = await getMaddoxSettings()
    expect(dto.settings).toMatchObject({ enabled: false, color: null, main: { model: null } })
    expect(dto.availability.available).toBe(false)
    expect(dto.tools.map((tool) => tool.name)).toEqual(['get_app_overview', 'list_tasks'])
  })

  it('ativar exige o modelo (mensagem pt-BR)', () => {
    const result = maddoxAgentSettingsSchema.safeParse({ ...DEFAULT_MADDOX_AGENT_SETTINGS, enabled: true })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Selecione o modelo')
  })

  it('salva conferindo o modelo no catálogo do OpenCode, normaliza o endereço e registra o MCP do Opex', async () => {
    await saveMaddoxSettings({ ...DEFAULT_MADDOX_AGENT_SETTINGS, enabled: true, main: { model: 'anthropic/claude', variant: '' }, mcpBaseUrl: 'http://opex.local/' }, 'local')
    expect(mocks.assertCatalog).toHaveBeenCalledWith(expect.objectContaining({ provider: 'opencode', model: 'anthropic/claude', variant: null }))
    expect(mocks.saved).toMatchObject({ mcpBaseUrl: 'http://opex.local', main: { variant: null } })
    expect(mocks.ensureMcp).toHaveBeenCalledWith(expect.anything(), '/home/dono', 'http://opex.local', { force: true })
    expect(mocks.publishToClients).toHaveBeenCalled()
  })

  it('modelo fora do catálogo é recusado', async () => {
    mocks.assertCatalog.mockRejectedValueOnce(Object.assign(new Error('Modelo x/y não está disponível no OpenCode'), { status: 400 }))
    await expect(saveMaddoxSettings({ ...DEFAULT_MADDOX_AGENT_SETTINGS, enabled: true, main: { model: 'x/y', variant: null } }, 'local')).rejects.toThrow('não está disponível')
    expect(mocks.persistFeature).not.toHaveBeenCalled()
  })

  it('ferramenta fora do catálogo (ex.: jobs) dá 400', async () => {
    await expect(saveMaddoxSettings({ ...DEFAULT_MADDOX_AGENT_SETTINGS, disabledTools: ['schedule_job'] }, 'local')).rejects.toMatchObject({ status: 400, code: 'MADDOX_TOOL_NOT_FOUND' })
  })

  it('configuração antiga sem campos novos recebe os padrões', () => {
    expect(withMaddoxDefaults({ enabled: true, main: { model: 'a/b' } })).toMatchObject({ color: null, main: { model: 'a/b', variant: null }, files: DEFAULT_MADDOX_AGENT_SETTINGS.files })
  })
})

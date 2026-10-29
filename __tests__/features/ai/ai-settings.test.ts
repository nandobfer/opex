import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  doc: null as null | { settings: Record<string, unknown>; updatedAt: Date },
  updateOne: vi.fn(),
  recordAudit: vi.fn(),
  publish: vi.fn(async () => {}),
  statuses: vi.fn(),
  confirm: vi.fn(),
  models: vi.fn(),
  agents: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR' } }))
vi.mock('@/lib/db/models/Ai', () => ({
  AiFeatureSetting: {
    findOne: () => ({ lean: async () => mocks.doc }),
    updateOne: mocks.updateOne,
  },
}))
vi.mock('@/lib/ai/catalog', () => ({ getAiProviderStatuses: mocks.statuses, listAiModels: mocks.models, listAiAgents: mocks.agents }))
// A conexão é confirmada na hora (OPE-91); aqui ela segue o status gravado do mock.
vi.mock('@/lib/ai/connection', () => ({ confirmAiProviderConnection: mocks.confirm }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))

import { DomainError } from '@/lib/api/route'
import { DEFAULT_UNDERSTAND_TASK_SETTINGS, understandTaskSettingsSchema, type UnderstandTaskSettings } from '@/features/ai/schemas'
import { availabilityOf, getUnderstandTaskSettings, normalizeSettings, saveUnderstandTaskSettings } from '@/features/ai/server/settings'

const settings = (overrides: Partial<UnderstandTaskSettings> = {}): UnderstandTaskSettings => ({
  ...DEFAULT_UNDERSTAND_TASK_SETTINGS,
  enabled: true,
  provider: 'opencode',
  model: 'anthropic/claude',
  ...overrides,
})

const connected = (overrides: Record<string, unknown> = {}) => [
  { id: 'opencode', integrationId: 'ai_opencode', name: 'OpenCode', configured: true, connected: true, ...overrides },
  { id: 'gemini', integrationId: 'ai_gemini', name: 'Gemini', configured: false, connected: false },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.doc = null
  mocks.statuses.mockResolvedValue(connected())
  mocks.confirm.mockImplementation(async (id: string) => {
    const status = ((await mocks.statuses()) as { id: string; configured: boolean; connected: boolean }[]).find((item) => item.id === id)
    return { configured: Boolean(status?.configured), connected: Boolean(status?.connected), detail: null }
  })
  mocks.models.mockResolvedValue([{ id: 'anthropic/claude', name: 'Claude', variants: ['high'], group: 'anthropic', contextWindow: null, free: false }])
  mocks.agents.mockResolvedValue([{ id: 'leitor', name: 'Leitor', description: null }])
})

describe('schema de "Entender tarefas"', () => {
  it('ativa exige provedor e modelo; desativada aceita vazio', () => {
    const result = understandTaskSettingsSchema.safeParse({ ...DEFAULT_UNDERSTAND_TASK_SETTINGS, enabled: true })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(['Selecione o provedor', 'Selecione o modelo'])
    expect(understandTaskSettingsSchema.safeParse(DEFAULT_UNDERSTAND_TASK_SETTINGS).success).toBe(true)
  })

  it('temperatura fora de 0 a 2 é recusada', () => {
    expect(understandTaskSettingsSchema.safeParse(settings({ provider: 'gemini', temperature: 3 })).success).toBe(false)
  })

  it('recusa o JEV: provedor sem geração de texto não é oferecido às features de texto', () => {
    const result = understandTaskSettingsSchema.safeParse({ ...settings(), provider: 'jev' })
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => issue.path[0] === 'provider')).toBe(true)
  })
})

describe('configuração e disponibilidade', () => {
  it('sem nada salvo, devolve os valores iniciais (desativada)', async () => {
    const dto = await getUnderstandTaskSettings()
    expect(dto).toMatchObject({ isDefault: true, settings: DEFAULT_UNDERSTAND_TASK_SETTINGS, availability: { available: false } })
    expect(dto.availability.reason).toContain('desativada')
  })

  it('disponível só com a feature ativa e o provedor conectado', async () => {
    expect(await availabilityOf(settings())).toEqual({ available: true, reason: null })
    mocks.statuses.mockResolvedValue(connected({ connected: false }))
    expect((await availabilityOf(settings())).reason).toContain('OpenCode não está conectado')
  })

  it('status gravado desatualizado: com a conexão confirmada na hora, fica disponível (OPE-91)', async () => {
    mocks.statuses.mockResolvedValue(connected({ connected: false }))
    mocks.confirm.mockResolvedValue({ configured: true, connected: true, detail: null })
    expect(await availabilityOf(settings())).toEqual({ available: true, reason: null })
    expect(mocks.confirm).toHaveBeenCalledWith('opencode')
  })

  it('desconectado de fato: o motivo traz a falha real', async () => {
    mocks.confirm.mockResolvedValue({ configured: true, connected: false, detail: 'ECONNREFUSED' })
    expect((await availabilityOf(settings())).reason).toContain('OpenCode não está conectado (ECONNREFUSED)')
  })

  it('normaliza: OpenCode descarta temperatura/tokens; Gemini descarta agente', () => {
    expect(normalizeSettings(settings({ temperature: 1, maxOutputTokens: 1024, agent: 'leitor' }))).toMatchObject({ temperature: null, maxOutputTokens: null, agent: 'leitor' })
    expect(normalizeSettings(settings({ provider: 'gemini', model: 'g', temperature: 1, agent: 'leitor' }))).toMatchObject({ temperature: 1, agent: null })
  })
})

describe('salvar', () => {
  it('confere o catálogo, grava, audita e avisa as telas', async () => {
    await saveUnderstandTaskSettings(settings({ agent: 'leitor', variant: 'high' }), 'local')
    expect(mocks.updateOne).toHaveBeenCalledWith({ feature: 'understand-task' }, expect.objectContaining({ $set: expect.objectContaining({ settings: expect.objectContaining({ agent: 'leitor', variant: 'high' }), updatedBy: 'local' }) }), { upsert: true })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'FeatureIA', entidadeId: 'understand-task', acao: 'CRIAR' }))
    expect(mocks.publish).toHaveBeenCalledWith('ai-feature-updated', { feature: 'understand-task' })
  })

  it('modelo, variante ou agente inexistentes são recusados sem gravar', async () => {
    await expect(saveUnderstandTaskSettings(settings({ model: 'x/y' }), 'local')).rejects.toMatchObject({ status: 400, code: 'AI_MODEL_NOT_FOUND' })
    await expect(saveUnderstandTaskSettings(settings({ variant: 'max' }), 'local')).rejects.toMatchObject({ code: 'AI_VARIANT_NOT_FOUND' })
    await expect(saveUnderstandTaskSettings(settings({ agent: 'build' }), 'local')).rejects.toMatchObject({ code: 'AI_AGENT_NOT_FOUND' })
    expect(mocks.updateOne).not.toHaveBeenCalled()
  })

  it('ativar com o provedor desconectado é recusado (409); desativada pode ser salva', async () => {
    mocks.statuses.mockResolvedValue(connected({ connected: false }))
    const error = await saveUnderstandTaskSettings(settings(), 'local').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toMatchObject({ status: 409 })
    await saveUnderstandTaskSettings(settings({ enabled: false }), 'local')
    expect(mocks.updateOne).toHaveBeenCalledTimes(1)
  })
})

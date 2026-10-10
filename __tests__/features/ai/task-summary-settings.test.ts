import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  doc: null as null | { settings: Record<string, unknown>; updatedAt: Date },
  updateOne: vi.fn(),
  recordAudit: vi.fn(),
  publish: vi.fn(async () => {}),
  runAfterResponse: vi.fn(),
  statuses: vi.fn(),
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
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/lib/after-response', () => ({ runAfterResponse: mocks.runAfterResponse }))

import { DEFAULT_TASK_SUMMARY_SETTINGS, taskSummarySettingsSchema, type TaskSummarySettings } from '@/features/ai/schemas'
import { availabilityOfTaskSummary, getTaskSummarySettings, normalizeTaskSummarySettings, saveTaskSummarySettings } from '@/features/ai/server/settings'

const settings = (overrides: Partial<TaskSummarySettings> = {}): TaskSummarySettings => ({
  ...DEFAULT_TASK_SUMMARY_SETTINGS,
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
  mocks.models.mockResolvedValue([{ id: 'anthropic/claude', name: 'Claude', variants: ['high'], group: 'anthropic', contextWindow: null, free: false }])
  mocks.agents.mockResolvedValue([{ id: 'leitor', name: 'Leitor', description: null }])
})

describe('schema de "Resumos de tarefas"', () => {
  it('ativa exige provedor e modelo; desativada aceita vazio', () => {
    const result = taskSummarySettingsSchema.safeParse({ ...DEFAULT_TASK_SUMMARY_SETTINGS, enabled: true })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(['Selecione o provedor', 'Selecione o modelo'])
    expect(taskSummarySettingsSchema.safeParse(DEFAULT_TASK_SUMMARY_SETTINGS).success).toBe(true)
  })

  it('maxLength fora da faixa é recusado', () => {
    expect(taskSummarySettingsSchema.safeParse(settings({ maxLength: 10 })).success).toBe(false)
    expect(taskSummarySettingsSchema.safeParse(settings({ maxLength: 1000 })).success).toBe(false)
    expect(taskSummarySettingsSchema.safeParse(settings({ maxLength: 200 })).success).toBe(true)
  })
})

describe('configuração e disponibilidade', () => {
  it('sem nada salvo, devolve os valores iniciais (desativada)', async () => {
    const dto = await getTaskSummarySettings()
    expect(dto).toMatchObject({ isDefault: true, settings: DEFAULT_TASK_SUMMARY_SETTINGS, availability: { available: false } })
    expect(dto.availability.reason).toContain('desativada')
  })

  it('disponível só com a feature ativa e o provedor conectado', async () => {
    expect(await availabilityOfTaskSummary(settings())).toEqual({ available: true, reason: null })
    mocks.statuses.mockResolvedValue(connected({ connected: false }))
    expect((await availabilityOfTaskSummary(settings())).reason).toContain('OpenCode não está conectado')
  })

  it('normaliza: OpenCode descarta temperatura/tokens; Gemini descarta agente', () => {
    expect(normalizeTaskSummarySettings(settings({ temperature: 1, maxOutputTokens: 1024, agent: 'leitor' }))).toMatchObject({ temperature: null, maxOutputTokens: null, agent: 'leitor' })
    expect(normalizeTaskSummarySettings(settings({ provider: 'gemini', model: 'g', temperature: 1, agent: 'leitor' }))).toMatchObject({ temperature: 1, agent: null })
  })
})

describe('salvar', () => {
  it('confere o catálogo, grava, audita e avisa as telas', async () => {
    await saveTaskSummarySettings(settings({ agent: 'leitor', variant: 'high' }), 'local')
    expect(mocks.updateOne).toHaveBeenCalledWith({ feature: 'task-summary' }, expect.objectContaining({ $set: expect.objectContaining({ settings: expect.objectContaining({ agent: 'leitor', variant: 'high' }), updatedBy: 'local' }) }), { upsert: true })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'FeatureIA', entidadeId: 'task-summary', acao: 'CRIAR' }))
    expect(mocks.publish).toHaveBeenCalledWith('ai-feature-updated', { feature: 'task-summary' })
  })

  it('ativar dispara a varredura das tarefas sem resumo em segundo plano', async () => {
    await saveTaskSummarySettings(settings({ enabled: true }), 'local')
    expect(mocks.runAfterResponse).toHaveBeenCalledWith('task-summary-backfill', expect.any(Function))
  })

  it('salvar já ativada (ou desativada) não dispara a varredura', async () => {
    mocks.doc = { settings: settings({ enabled: true }), updatedAt: new Date() }
    await saveTaskSummarySettings(settings({ enabled: true }), 'local')
    expect(mocks.runAfterResponse).not.toHaveBeenCalled()

    mocks.doc = null
    await saveTaskSummarySettings(settings({ enabled: false }), 'local')
    expect(mocks.runAfterResponse).not.toHaveBeenCalled()
  })

  it('modelo/variante/agente inexistentes são recusados sem gravar', async () => {
    await expect(saveTaskSummarySettings(settings({ model: 'x/y' }), 'local')).rejects.toMatchObject({ code: 'AI_MODEL_NOT_FOUND' })
    await expect(saveTaskSummarySettings(settings({ variant: 'max' }), 'local')).rejects.toMatchObject({ code: 'AI_VARIANT_NOT_FOUND' })
    await expect(saveTaskSummarySettings(settings({ agent: 'build' }), 'local')).rejects.toMatchObject({ code: 'AI_AGENT_NOT_FOUND' })
    expect(mocks.updateOne).not.toHaveBeenCalled()
  })
})

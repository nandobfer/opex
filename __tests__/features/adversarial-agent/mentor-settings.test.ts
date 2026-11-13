import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-97: Triador e destinos; OPE-165: digestor, aprendizado na conclusão e gate sem o Agente Adversário. */

const mocks = vi.hoisted(() => ({ loadFeature: vi.fn(), loadAdversarial: vi.fn() }))

vi.mock('@/features/ai/server/settings', () => ({ assertCatalog: vi.fn(), availability: vi.fn(async () => ({ available: true, reason: null })), loadFeature: mocks.loadFeature, persistFeature: vi.fn() }))
vi.mock('@/features/adversarial-agent/server/settings', () => ({ loadAdversarialSettings: mocks.loadAdversarial }))

import { DEFAULT_MENTOR_SETTINGS, effectiveTargets, mentorSettingsSchema, type MentorSettings } from '@/features/adversarial-agent/mentor/schemas'
import { mentorAvailability, mentorSettingsFor, withMentorDefaults } from '@/features/adversarial-agent/server/mentor/settings'

const enabled = (overrides: Partial<MentorSettings> = {}): MentorSettings => ({
  ...structuredClone(DEFAULT_MENTOR_SETTINGS),
  enabled: true,
  digest: { ...DEFAULT_MENTOR_SETTINGS.digest, provider: 'gemini', model: 'flash' },
  decider: { provider: 'jev', model: 'jev-latest', variant: null },
  writer: { ...DEFAULT_MENTOR_SETTINGS.writer, provider: 'anthropic', model: 'claude' },
  ...overrides,
})

beforeEach(() => {
  mocks.loadFeature.mockReset()
  mocks.loadAdversarial.mockReset()
})

describe('configuração do Triador e dos destinos', () => {
  it('configuração salva antes do Triador: nasce com o provedor e o modelo do decisor e os três destinos ligados', () => {
    const legacy: Partial<MentorSettings> = enabled()
    delete legacy.router
    delete legacy.targets
    const migrated = mentorSettingsSchema.parse(withMentorDefaults(legacy))
    expect(migrated.router).toEqual({ provider: 'jev', model: 'jev-latest', variant: null, instructions: '' })
    expect(migrated.targets).toEqual({ adversarial: true, 'developer-global': true, 'developer-central': true })
  })

  it('o Triador salvo prevalece sobre o decisor', () => {
    const migrated = mentorSettingsSchema.parse(withMentorDefaults(enabled({ router: { provider: 'gemini', model: 'flash', variant: null, instructions: 'x' } })))
    expect(migrated.router).toMatchObject({ provider: 'gemini', model: 'flash' })
  })

  it('desligar todos os destinos é recusado; com mais de um destino o Triador é obrigatório; com um só, não', () => {
    const none = mentorSettingsSchema.safeParse(enabled({ targets: { adversarial: false, 'developer-global': false, 'developer-central': false } }))
    expect(none.success).toBe(false)
    expect(none.error?.issues.map((issue) => issue.message)).toContain('Escolha ao menos um destino')
    const noRouter = mentorSettingsSchema.safeParse(enabled())
    expect(noRouter.error?.issues.map((issue) => issue.message)).toContain('Escolha o provedor do Triador')
    expect(mentorSettingsSchema.safeParse(enabled({ targets: { adversarial: true, 'developer-global': false, 'developer-central': false } })).success).toBe(true)
    expect(mentorSettingsSchema.safeParse(enabled({ router: { provider: 'jev', model: 'jev-latest', variant: null, instructions: '' } })).success).toBe(true)
  })
})

describe('OPE-165: configuração do aprendizado na conclusão', () => {
  it('configuração antiga (gatilhos, contexto, modo Sugerir) é lida sem erro: os campos saem e o digestor nasce com o modelo do redator', () => {
    const legacy = { ...enabled({ router: { provider: 'jev', model: 'j', variant: null, instructions: '' } }), triggers: { user: { reopen: true }, ai: { planning: true } }, context: { userMessage: true }, saveMode: 'suggest' } as Record<string, unknown>
    delete legacy.digest
    delete legacy.learnOnDone
    const migrated = mentorSettingsSchema.parse(withMentorDefaults(legacy))
    expect(migrated).not.toHaveProperty('triggers')
    expect(migrated).not.toHaveProperty('context')
    expect(migrated).not.toHaveProperty('saveMode')
    expect(migrated.learnOnDone).toBe(true)
    expect(migrated.digest).toMatchObject({ provider: 'anthropic', model: 'claude', budgetUsd: 0.3, compactThresholdChars: 400_000 })
  })

  it('ativo sem o digestor é recusado; orçamento fora da faixa é recusado', () => {
    const noDigest = mentorSettingsSchema.safeParse(enabled({ router: { provider: 'jev', model: 'j', variant: null, instructions: '' }, digest: { ...DEFAULT_MENTOR_SETTINGS.digest } }))
    expect(noDigest.error?.issues.map((issue) => issue.message)).toContain('Escolha o provedor do digestor')
    const budget = mentorSettingsSchema.safeParse(enabled({ router: { provider: 'jev', model: 'j', variant: null, instructions: '' }, digest: { ...enabled().digest, budgetUsd: 0 } }))
    expect(budget.success).toBe(false)
  })

  it('destinos que valem: o Adversário só com ele ativo', () => {
    const all = DEFAULT_MENTOR_SETTINGS.targets
    expect(effectiveTargets(all, true)).toEqual(['adversarial', 'developer-global', 'developer-central'])
    expect(effectiveTargets(all, false)).toEqual(['developer-global', 'developer-central'])
    expect(effectiveTargets({ adversarial: true, 'developer-global': false, 'developer-central': false }, false)).toEqual([])
  })

  it('mentorSettingsFor não exige o Agente Adversário: só Mentor ativo, aprendizado ligado e a central no escopo', async () => {
    mocks.loadFeature.mockResolvedValue({ settings: enabled(), isDefault: false, updatedAt: null })
    mocks.loadAdversarial.mockResolvedValue({ settings: { enabled: false } })
    expect(await mentorSettingsFor('c1')).not.toBeNull()
    mocks.loadFeature.mockResolvedValue({ settings: enabled({ learnOnDone: false }), isDefault: false, updatedAt: null })
    expect(await mentorSettingsFor('c1')).toBeNull()
    mocks.loadFeature.mockResolvedValue({ settings: enabled({ scope: { all: false, centralIds: ['c2'] } }), isDefault: false, updatedAt: null })
    expect(await mentorSettingsFor('c1')).toBeNull()
    expect(await mentorSettingsFor('c2')).not.toBeNull()
  })

  it('disponibilidade: Adversário desativado só avisa; o único destino sendo o Adversário bloqueia', async () => {
    const warn = await mentorAvailability(enabled(), false)
    expect(warn.available).toBe(true)
    expect(warn.reason).toContain('Agente Adversário está desativado')
    const blocked = await mentorAvailability(enabled({ targets: { adversarial: true, 'developer-global': false, 'developer-central': false } }), false)
    expect(blocked.available).toBe(false)
  })
})

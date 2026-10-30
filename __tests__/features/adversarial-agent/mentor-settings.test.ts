import { describe, expect, it, vi } from 'vitest'

/** OPE-97: Triador e destinos na configuração do Agente Mentor. */

vi.mock('@/features/ai/server/settings', () => ({ assertCatalog: vi.fn(), availability: vi.fn(async () => ({ available: true, reason: null })), loadFeature: vi.fn(), persistFeature: vi.fn() }))
vi.mock('@/features/adversarial-agent/server/settings', () => ({ loadAdversarialSettings: vi.fn() }))

import { DEFAULT_MENTOR_SETTINGS, mentorSettingsSchema, type MentorSettings } from '@/features/adversarial-agent/mentor/schemas'
import { withMentorDefaults } from '@/features/adversarial-agent/server/mentor/settings'

const enabled = (overrides: Partial<MentorSettings> = {}): MentorSettings => ({
  ...structuredClone(DEFAULT_MENTOR_SETTINGS),
  enabled: true,
  decider: { provider: 'jev', model: 'jev-latest', variant: null },
  writer: { ...DEFAULT_MENTOR_SETTINGS.writer, provider: 'anthropic', model: 'claude' },
  ...overrides,
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

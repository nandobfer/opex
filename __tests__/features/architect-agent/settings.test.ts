import { beforeEach, describe, expect, it, vi } from 'vitest'

const ai = vi.hoisted(() => ({
  assertCatalog: vi.fn(async () => undefined),
  availability: vi.fn(async () => ({ available: true, reason: null })),
  saved: null as unknown,
}))
vi.mock('@/features/ai/server/settings', () => ({
  assertCatalog: ai.assertCatalog,
  availability: ai.availability,
  loadFeature: vi.fn(async (_feature: string, schema: { parse: (value: unknown) => unknown }, defaults: unknown) => ({ settings: schema.parse(ai.saved ?? defaults), isDefault: !ai.saved, updatedAt: null })),
  persistFeature: vi.fn(async (_feature: string, next: unknown) => {
    ai.saved = next
  }),
}))

import { architectSettingsSchema, DEFAULT_ARCHITECT_SETTINGS } from '@/features/architect-agent/schemas'
import { architectAvailability, normalizeArchitectSettings, saveArchitectSettings, settingsApply, withDefaults } from '@/features/architect-agent/server/settings'
import { withSelfMemoryDefaults } from '@/features/ai/server/self-memory/settings'
import { contextChannelsFor, writableListsFor } from '@/features/ai/agents'

/** Configuração do Agente Arquiteto e a lista de memórias dele. */

describe('configuração do Agente Arquiteto', () => {
  it('padrões: desativado, disparo automático, todas as centrais, nível 3 e visão de arquitetura', () => {
    expect(DEFAULT_ARCHITECT_SETTINGS).toMatchObject({ enabled: false, trigger: 'auto', scope: { all: true }, diagram: { depth: 3, defaultView: 'architecture', showNotes: true } })
    expect(DEFAULT_ARCHITECT_SETTINGS.diagram).not.toHaveProperty('showFiles')
    expect(architectSettingsSchema.safeParse(DEFAULT_ARCHITECT_SETTINGS).success).toBe(true)
  })

  it('configuração salva antes de um campo existir recebe o padrão dele', () => {
    const parsed = architectSettingsSchema.parse(withDefaults({ enabled: false, diagram: { depth: 5 } }))
    expect(parsed.diagram).toMatchObject({ depth: 5, defaultView: 'architecture', showNotes: true })
    expect(parsed.trigger).toBe('auto')
  })

  it('configuração salva no vocabulário antigo (tipos de código e "Mostrar arquivos") carrega com os equivalentes de ideias', () => {
    const parsed = architectSettingsSchema.parse(withDefaults({ enabled: false, diagram: { depth: 2, nodeKinds: ['objective', 'module', 'route', 'data', 'risk'], showFiles: false, showNotes: true, defaultView: 'mindmap' } }))
    expect(parsed.diagram).not.toHaveProperty('showFiles')
    expect(parsed.diagram.nodeKinds).toEqual(expect.arrayContaining(['objective', 'structure', 'process', 'information', 'risk', 'actor']))
    expect(parsed.diagram.nodeKinds).not.toContain('module')
    expect(parsed.diagram.defaultView).toBe('mindmap')
  })

  it('tipos salvos que não existem mais e sem equivalente: todos os tipos', () => {
    const parsed = architectSettingsSchema.parse(withDefaults({ enabled: false, diagram: { nodeKinds: ['componente', 'xyz'] } }))
    expect(parsed.diagram.nodeKinds).toEqual([...DEFAULT_ARCHITECT_SETTINGS.diagram.nodeKinds])
  })

  it('ativo exige modelo e, com centrais escolhidas, ao menos uma', () => {
    const result = architectSettingsSchema.safeParse({ ...DEFAULT_ARCHITECT_SETTINGS, enabled: true, scope: { all: false, centralIds: [] } })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(expect.arrayContaining(['agent.model', 'scope.centralIds']))
    expect(architectSettingsSchema.safeParse({ ...DEFAULT_ARCHITECT_SETTINGS, diagram: { ...DEFAULT_ARCHITECT_SETTINGS.diagram, depth: 6 } }).success).toBe(false)
  })

  it('aplica-se ao ativo e à central no escopo', () => {
    const settings = { ...DEFAULT_ARCHITECT_SETTINGS, enabled: true }
    expect(settingsApply(settings, 'c1')).toBe(true)
    expect(settingsApply({ ...settings, scope: { all: false, centralIds: ['c2'] } }, 'c1')).toBe(false)
    expect(settingsApply({ ...settings, enabled: false }, 'c1')).toBe(false)
  })

  it('normaliza escopo "todas" e tipos repetidos', () => {
    const next = normalizeArchitectSettings({ ...DEFAULT_ARCHITECT_SETTINGS, scope: { all: true, centralIds: ['c1'] }, diagram: { ...DEFAULT_ARCHITECT_SETTINGS.diagram, nodeKinds: ['process', 'process', 'actor'] } })
    expect(next.scope.centralIds).toEqual([])
    expect(next.diagram.nodeKinds).toEqual(['process', 'actor'])
  })
})

describe('provedor do Agente Arquiteto', () => {
  beforeEach(() => {
    ai.saved = null
    vi.clearAllMocks()
  })

  it('o padrão é o OpenCode, e a configuração salva antes da escolha do provedor carrega como OpenCode', () => {
    expect(DEFAULT_ARCHITECT_SETTINGS.provider).toBe('opencode')
    const parsed = architectSettingsSchema.parse(withDefaults({ enabled: false, agent: { agent: 'build', model: 'anthropic/opus', variant: null, fallbacks: [] } }))
    expect(parsed.provider).toBe('opencode')
    expect(parsed.agent.agent).toBe('build')
  })

  it('provedor que não gera texto ou inexistente é recusado, listando os válidos', () => {
    for (const provider of ['jev', 'xyz']) {
      const result = architectSettingsSchema.safeParse({ ...DEFAULT_ARCHITECT_SETTINGS, provider })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]!.message).toContain('OpenCode, Gemini, Anthropic, OpenAI ou DeepSeek')
    }
  })

  it('num provedor direto, salvar zera agente e fallbacks e confere o catálogo do provedor escolhido', async () => {
    const input = { ...DEFAULT_ARCHITECT_SETTINGS, provider: 'anthropic' as const, agent: { agent: 'build', model: 'claude-sonnet', variant: 'high', fallbacks: [{ model: 'openai/gpt', variant: null }] } }
    expect(normalizeArchitectSettings(input).agent).toEqual({ agent: null, model: 'claude-sonnet', variant: 'high', fallbacks: [] })
    await saveArchitectSettings(input, 'local')
    expect(ai.assertCatalog).toHaveBeenCalledWith(expect.objectContaining({ provider: 'anthropic', model: 'claude-sonnet', agent: null, variant: 'high' }))
    expect((ai.saved as { provider: string }).provider).toBe('anthropic')
  })

  it('no OpenCode, o agente segue para o catálogo e os fallbacks ficam', async () => {
    const input = { ...DEFAULT_ARCHITECT_SETTINGS, agent: { agent: 'build', model: 'anthropic/opus', variant: null, fallbacks: [{ model: 'openai/gpt', variant: null }] } }
    expect(normalizeArchitectSettings(input).agent.fallbacks).toHaveLength(1)
    await saveArchitectSettings(input, 'local')
    expect(ai.assertCatalog).toHaveBeenCalledWith(expect.objectContaining({ provider: 'opencode', agent: 'build' }))
  })

  it('a disponibilidade confere o provedor escolhido', async () => {
    await architectAvailability({ ...DEFAULT_ARCHITECT_SETTINGS, enabled: true, provider: 'gemini', agent: { agent: null, model: 'gemini-2.5-pro', variant: null, fallbacks: [] } })
    expect(ai.availability).toHaveBeenCalledWith({ enabled: true, provider: 'gemini', model: 'gemini-2.5-pro' }, '"Agente Arquiteto"')
  })
})

describe('memórias do Agente Arquiteto', () => {
  it('lê as Memórias do Opex e a lista própria, e grava só nelas', () => {
    expect(contextChannelsFor('arquiteto', { kind: 'review' })).toEqual(['opex', 'agentes/arquiteto'])
    expect(writableListsFor('arquiteto', { kind: 'review' })).toEqual(['app-global', 'architect'])
  })

  it('o aprendizado autônomo salvo antes do arquiteto existir ganha o padrão sem mudar os demais', () => {
    expect(withSelfMemoryDefaults({ opex: false, maddox: true, adversario: false, desenvolvedor: true })).toEqual({ opex: false, maddox: true, adversario: false, arquiteto: true, desenvolvedor: true })
  })
})

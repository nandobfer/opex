import { describe, expect, it } from 'vitest'
import { architectSettingsSchema, DEFAULT_ARCHITECT_SETTINGS } from '@/features/architect-agent/schemas'
import { normalizeArchitectSettings, settingsApply, withDefaults } from '@/features/architect-agent/server/settings'
import { withSelfMemoryDefaults } from '@/features/ai/server/self-memory/settings'
import { contextChannelsFor, writableListsFor } from '@/features/ai/agents'

/** Configuração do Agente Arquiteto e a lista de memórias dele. */

describe('configuração do Agente Arquiteto', () => {
  it('padrões: desativado, disparo automático, todas as centrais, nível 3 e visão de arquitetura', () => {
    expect(DEFAULT_ARCHITECT_SETTINGS).toMatchObject({ enabled: false, trigger: 'auto', scope: { all: true }, diagram: { depth: 3, defaultView: 'architecture', showFiles: true, showNotes: true } })
    expect(architectSettingsSchema.safeParse(DEFAULT_ARCHITECT_SETTINGS).success).toBe(true)
  })

  it('configuração salva antes de um campo existir recebe o padrão dele', () => {
    const parsed = architectSettingsSchema.parse(withDefaults({ enabled: false, diagram: { depth: 5 } }))
    expect(parsed.diagram).toMatchObject({ depth: 5, defaultView: 'architecture', showFiles: true })
    expect(parsed.trigger).toBe('auto')
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
    const next = normalizeArchitectSettings({ ...DEFAULT_ARCHITECT_SETTINGS, scope: { all: true, centralIds: ['c1'] }, diagram: { ...DEFAULT_ARCHITECT_SETTINGS.diagram, nodeKinds: ['module', 'module', 'route'] } })
    expect(next.scope.centralIds).toEqual([])
    expect(next.diagram.nodeKinds).toEqual(['module', 'route'])
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

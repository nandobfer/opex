import { describe, expect, it } from 'vitest'
import { STAGE_MODEL_ROLE, WORKBENCH_STAGES } from '@/features/agentic/constants'
import { applyModelOverride, asModelOverride, modelSource, optimisticModelChoice } from '@/features/agentic/logic'
import { describeModel, forkBaseAgent, forkModelChoice, toModelChoice, workbenchModelChoice, workbenchOverrides, workbenchTurnAgent } from '@/features/agentic/server/models'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'

const base = { agent: 'build', model: 'anthropic/sonnet', variant: 'high' }

describe('troca de modelo: regras', () => {
  it('a troca substitui modelo e variante e mantém o agente', () => {
    expect(applyModelOverride(base, { model: 'openai/gpt-5', variant: null })).toEqual({ agent: 'build', model: 'openai/gpt-5', variant: null })
    expect(applyModelOverride(base, null)).toBe(base)
  })

  it('troca salva inválida é ignorada', () => {
    expect(asModelOverride(null)).toBeNull()
    expect(asModelOverride({ model: '' })).toBeNull()
    expect(asModelOverride({ model: 'openai/gpt-5', variant: '' })).toEqual({ model: 'openai/gpt-5', variant: null })
  })

  it('papel trocado em cada etapa: Mudanças pedidas troca o do Plano; Concluindo e Concluída não trocam', () => {
    expect(STAGE_MODEL_ROLE.plan_review).toBe('planning')
    expect(STAGE_MODEL_ROLE.changes_requested).toBe('planning')
    expect(STAGE_MODEL_ROLE.implementing).toBe('implementation')
    expect(STAGE_MODEL_ROLE.preview).toBe('build')
    expect(STAGE_MODEL_ROLE.resolving_conflicts).toBe('pr')
    expect(STAGE_MODEL_ROLE.deleting_pr_branch).toBe('pr')
    expect(STAGE_MODEL_ROLE.finishing).toBeNull()
    expect(STAGE_MODEL_ROLE.done).toBeNull()
    expect(WORKBENCH_STAGES.every((stage) => stage in STAGE_MODEL_ROLE)).toBe(true)
  })

  it('escolha exibida e agente do turno com a troca do papel', () => {
    expect(toModelChoice(base, null)).toEqual({ model: 'anthropic/sonnet', variant: 'high', overridden: false, inherited: { model: 'anthropic/sonnet', variant: 'high' } })
    expect(toModelChoice(base, { model: 'openai/gpt-5', variant: 'low' })).toEqual({ model: 'openai/gpt-5', variant: 'low', overridden: true, inherited: { model: 'anthropic/sonnet', variant: 'high' } })
    const doc = { modelOverrides: { pr: { model: 'openai/o3', variant: null }, lixo: { model: 'x' } } }
    expect(workbenchOverrides(doc)).toEqual({ pr: { model: 'openai/o3', variant: null } })
    const config = defaultCentralConfig('/home/u/app')
    expect(workbenchTurnAgent(DEFAULT_AGENTIC_SETTINGS, config, doc, 'pr')).toEqual({ agent: 'build', model: 'openai/o3', variant: null, fallbacks: [] })
    expect(workbenchTurnAgent(DEFAULT_AGENTIC_SETTINGS, config, doc, 'planning')).toEqual({ ...DEFAULT_AGENTIC_SETTINGS.agents.planning, fallbacks: [] })
  })

  it('descrição do modelo', () => {
    expect(describeModel({ model: 'openai/gpt-5', variant: 'high' })).toBe('openai/gpt-5 (high)')
    expect(describeModel({ model: null, variant: null })).toBe('modelo padrão do agente')
  })

  it('origem: central só quando ela personaliza o modelo do papel; senão o padrão global', () => {
    const config = defaultCentralConfig('/home/u/app')
    expect(modelSource(config, 'planning')).toBe('global')
    expect(modelSource({ agents: { ...config.agents, planning: { agent: 'plan', model: null, variant: null } } }, 'planning')).toBe('global')
    expect(modelSource({ agents: { ...config.agents, planning: { agent: null, model: 'openai/gpt-5', variant: null } } }, 'planning')).toBe('central')
  })

  it('precedência na mesa por etapa: mesa > central > global, com o herdado e a origem', () => {
    const config = defaultCentralConfig('/home/u/app')
    const central = { agents: { ...config.agents, implementation: { agent: null, model: 'openai/o3', variant: 'high' } } }
    const doc = { modelOverrides: { implementation: { model: 'openai/gpt-5', variant: null } } }
    expect(workbenchModelChoice(DEFAULT_AGENTIC_SETTINGS, central, doc, 'implementation')).toEqual({
      model: 'openai/gpt-5',
      variant: null,
      overridden: true,
      inherited: { model: 'openai/o3', variant: 'high' },
      source: 'workbench',
      inheritedSource: 'central',
    })
    expect(workbenchModelChoice(DEFAULT_AGENTIC_SETTINGS, central, { modelOverrides: null }, 'implementation')).toMatchObject({ model: 'openai/o3', variant: 'high', overridden: false, source: 'central' })
    expect(workbenchModelChoice(DEFAULT_AGENTIC_SETTINGS, central, doc, 'pr')).toMatchObject({ overridden: false, source: 'global' })
  })

  it('papel Fork da mesa: não muda os turnos da conversa principal; é a base dos forks (fork > mesa > central > global)', () => {
    const config = defaultCentralConfig('/home/u/app')
    const doc = { modelOverrides: { fork: { model: 'openai/gpt-5', variant: 'high' } } }
    expect(workbenchTurnAgent(DEFAULT_AGENTIC_SETTINGS, config, doc, 'fork')).toEqual({ ...DEFAULT_AGENTIC_SETTINGS.agents.fork, fallbacks: [] })
    expect(forkBaseAgent(DEFAULT_AGENTIC_SETTINGS, config, doc)).toMatchObject({ model: 'openai/gpt-5', variant: 'high' })
    expect(forkBaseAgent(DEFAULT_AGENTIC_SETTINGS, config, null)).toMatchObject({ model: DEFAULT_AGENTIC_SETTINGS.agents.fork.model })
    expect(forkModelChoice(DEFAULT_AGENTIC_SETTINGS, config, doc, { modelOverride: null })).toMatchObject({ model: 'openai/gpt-5', overridden: false, source: 'workbench', inheritedSource: 'workbench' })
    expect(forkModelChoice(DEFAULT_AGENTIC_SETTINGS, config, doc, { modelOverride: { model: 'openai/o3', variant: null } })).toMatchObject({
      model: 'openai/o3',
      overridden: true,
      source: 'fork',
      inherited: { model: 'openai/gpt-5', variant: 'high' },
    })
    expect(forkModelChoice(DEFAULT_AGENTIC_SETTINGS, config, { modelOverrides: null }, { modelOverride: null })).toMatchObject({ source: 'global' })
  })

  it('escolha otimista: troca vira o nível; voltar ao padrão usa o herdado e a origem herdada', () => {
    const current = { model: 'openai/gpt-5', variant: null, overridden: true, inherited: { model: 'openai/o3', variant: 'high' }, source: 'workbench' as const, inheritedSource: 'central' as const }
    expect(optimisticModelChoice(current, { model: 'anthropic/opus', variant: 'low' }, 'workbench')).toMatchObject({ model: 'anthropic/opus', variant: 'low', overridden: true, source: 'workbench' })
    expect(optimisticModelChoice(current, { model: null, variant: null }, 'workbench')).toMatchObject({ model: 'openai/o3', variant: 'high', overridden: false, source: 'central' })
    // Regressão: sem o herdado, o "voltar ao padrão" mantinha o modelo trocado como se fosse o padrão.
    expect(optimisticModelChoice({ model: 'x/y', variant: null, overridden: true }, { model: null, variant: null }, 'workbench')).toMatchObject({ model: 'x/y', overridden: false })
  })
})

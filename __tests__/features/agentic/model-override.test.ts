import { describe, expect, it } from 'vitest'
import { STAGE_MODEL_ROLE, WORKBENCH_STAGES } from '@/features/agentic/constants'
import { applyModelOverride, asModelOverride } from '@/features/agentic/logic'
import { describeModel, toModelChoice, workbenchOverrides, workbenchTurnAgent } from '@/features/agentic/server/models'
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
    expect(toModelChoice(base, null)).toEqual({ model: 'anthropic/sonnet', variant: 'high', overridden: false })
    expect(toModelChoice(base, { model: 'openai/gpt-5', variant: 'low' })).toEqual({ model: 'openai/gpt-5', variant: 'low', overridden: true })
    const doc = { modelOverrides: { pr: { model: 'openai/o3', variant: null }, lixo: { model: 'x' } } }
    expect(workbenchOverrides(doc)).toEqual({ pr: { model: 'openai/o3', variant: null } })
    const config = defaultCentralConfig('/home/u/app')
    expect(workbenchTurnAgent(DEFAULT_AGENTIC_SETTINGS, config, doc, 'pr')).toEqual({ agent: 'build', model: 'openai/o3', variant: null })
    expect(workbenchTurnAgent(DEFAULT_AGENTIC_SETTINGS, config, doc, 'planning')).toEqual(DEFAULT_AGENTIC_SETTINGS.agents.planning)
  })

  it('descrição do modelo', () => {
    expect(describeModel({ model: 'openai/gpt-5', variant: 'high' })).toBe('openai/gpt-5 (high)')
    expect(describeModel({ model: null, variant: null })).toBe('modelo padrão do agente')
  })
})

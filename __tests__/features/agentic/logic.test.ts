import { describe, expect, it } from 'vitest'
import { parseCentralConfig, pickPreviewPort, resolveAgent, workbenchActions } from '@/features/agentic/logic'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'

describe('resolveAgent', () => {
  const settings = { ...DEFAULT_AGENTIC_SETTINGS, agents: { ...DEFAULT_AGENTIC_SETTINGS.agents, planning: { agent: 'plan', model: 'anthropic/opus', variant: 'high' } } }

  it('sem override usa o padrão da aba', () => {
    expect(resolveAgent(settings, defaultCentralConfig('/x'), 'planning')).toEqual({ agent: 'plan', model: 'anthropic/opus', variant: 'high' })
  })

  it('override vale campo a campo (agente vazio herda; modelo próprio leva a variante própria)', () => {
    const central = { agents: { ...defaultCentralConfig('/x').agents, planning: { agent: null, model: 'openai/gpt', variant: null } } }
    expect(resolveAgent(settings, central, 'planning')).toEqual({ agent: 'plan', model: 'openai/gpt', variant: null })
  })
})

describe('pickPreviewPort', () => {
  it('menor porta livre da faixa 4001–4098', () => {
    expect(pickPreviewPort([])).toBe(4001)
    expect(pickPreviewPort([4001, 4002, 4004])).toBe(4003)
  })

  it('faixa esgotada devolve null (nunca sai da faixa)', () => {
    expect(pickPreviewPort(Array.from({ length: 98 }, (_, index) => 4001 + index))).toBeNull()
  })
})

describe('workbenchActions', () => {
  it('cada etapa oferece só as ações dela', () => {
    expect(workbenchActions('plan_review', 'idle', false)).toEqual(['implement', 'revise-plan'])
    expect(workbenchActions('preview', 'idle', true)).toEqual(['open-preview', 'request-correction', 'approve'])
    expect(workbenchActions('changes_requested', 'idle', false)).toEqual(['submit-pr-feedback'])
    expect(workbenchActions('done', 'idle', false)).toEqual(['reopen'])
    expect(workbenchActions('pr_open', 'idle', false)).toEqual([])
  })

  it('executando só permite parar; falha permite tentar de novo', () => {
    expect(workbenchActions('implementing', 'running', false)).toEqual(['interrupt'])
    expect(workbenchActions('building', 'failed', false)).toEqual(['retry', 'request-correction'])
    expect(workbenchActions('planning', 'interrupted', false)).toEqual(['retry'])
  })
})

describe('parseCentralConfig', () => {
  it('completa configurações antigas com os padrões', () => {
    const parsed = parseCentralConfig({ sessionDirectory: '/repo', git: { baseBranch: 'dev' } })
    expect(parsed.sessionDirectory).toBe('/repo')
    expect(parsed.git.baseBranch).toBe('dev')
    expect(parsed.git.prTargetBranch).toBe('main')
    expect(parsed.cleanup).toEqual({ teardownEnvironment: true, removeWorktree: true, deleteBranch: true })
  })
})

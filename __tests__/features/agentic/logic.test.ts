import { describe, expect, it } from 'vitest'
import { defaultSessionDirectory, parseCentralConfig, pickPreviewPort, resolveAgent, workbenchActions } from '@/features/agentic/logic'
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

  it('respeita a faixa configurada na central', () => {
    expect(pickPreviewPort([], 5000, 5002)).toBe(5000)
    expect(pickPreviewPort([5000, 5001], 5000, 5002)).toBe(5002)
    expect(pickPreviewPort([5000, 5001, 5002], 5000, 5002)).toBeNull()
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

  it('preenche a pasta dos worktrees e a faixa de portas quando ausentes', () => {
    const parsed = parseCentralConfig({ sessionDirectory: '/repo' })
    expect(parsed.worktreeRoot).toBe('/repo/worktrees')
    expect([parsed.environment.previewPortMin, parsed.environment.previewPortMax]).toEqual([4001, 4098])
  })

  it('respeita a pasta dos worktrees e a faixa de portas salvas', () => {
    const parsed = parseCentralConfig({ sessionDirectory: '/repo', worktreeRoot: '/wt', environment: { previewPortMin: 5000, previewPortMax: 5010 } })
    expect(parsed.worktreeRoot).toBe('/wt')
    expect([parsed.environment.previewPortMin, parsed.environment.previewPortMax]).toEqual([5000, 5010])
  })

  it('faixa inválida (final antes da inicial) cai nos padrões', () => {
    const parsed = parseCentralConfig({ sessionDirectory: '/repo', environment: { previewPortMin: 5000, previewPortMax: 4000 } })
    expect([parsed.environment.previewPortMin, parsed.environment.previewPortMax]).toEqual([4001, 4098])
  })

  it('a coluna da fila nasce desligada e é preservada quando salva', () => {
    expect(parseCentralConfig({ sessionDirectory: '/repo' }).columns.queue).toBeNull()
    expect(parseCentralConfig({ sessionDirectory: '/repo', columns: { queue: 'fila' } }).columns.queue).toBe('fila')
  })
})

describe('padrões da central', () => {
  it('worktreeRoot nasce como <diretório das sessões>/worktrees', () => {
    expect(defaultCentralConfig('/home/u/app').worktreeRoot).toBe('/home/u/app/worktrees')
    expect(defaultCentralConfig('/').worktreeRoot).toBe('')
  })

  it('defaultSessionDirectory monta <raiz>/<repositório>', () => {
    expect(defaultSessionDirectory('/home/burgos/code', 'opex')).toBe('/home/burgos/code/opex')
    expect(defaultSessionDirectory('/home/burgos/code/', 'opex')).toBe('/home/burgos/code/opex')
  })
})

import { describe, expect, it } from 'vitest'
import { defaultSessionDirectory, parseCentralConfig, pickPreviewPort, reopenTargetColumn, resolveAgent, workbenchActions, workbenchProgressTone, workbenchUserWaitReason, workbenchWaitingReason } from '@/features/agentic/logic'
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
    expect(workbenchActions('build_queued', 'idle', false)).toEqual([])
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

describe('workbenchWaitingReason', () => {
  const base = { stage: 'plan_review' as const, runState: 'idle' as const, pendingPermissions: 0, pendingForms: 0 }

  it('agente trabalhando (running e sem pendências) não tem motivo de espera', () => {
    expect(workbenchWaitingReason({ ...base, stage: 'implementing', runState: 'running' })).toBeNull()
  })

  it('cada espera tem o seu motivo', () => {
    expect(workbenchWaitingReason(base)).toBe('Aguardando revisão do plano')
    expect(workbenchWaitingReason({ ...base, stage: 'preview' })).toBe('Aguardando aprovação da prévia')
    expect(workbenchWaitingReason({ ...base, stage: 'pr_open' })).toBe('Aguardando revisão ou merge do PR')
    expect(workbenchWaitingReason({ ...base, stage: 'changes_requested' })).toBe('Aguardando descrever as mudanças')
  })

  it('permissão e pergunta pendentes vêm antes da etapa, mesmo durante o turno', () => {
    expect(workbenchWaitingReason({ ...base, stage: 'implementing', runState: 'running', pendingPermissions: 1 })).toBe('Aguardando você permitir uma ação')
    expect(workbenchWaitingReason({ ...base, stage: 'implementing', runState: 'running', pendingForms: 2 })).toBe('Aguardando você responder uma pergunta')
  })

  it('falha e interrupção têm prioridade sobre pendências obsoletas', () => {
    expect(workbenchWaitingReason({ ...base, runState: 'failed', pendingPermissions: 1 })).toBe('A etapa falhou — use Tentar novamente')
    expect(workbenchWaitingReason({ ...base, runState: 'interrupted', pendingForms: 1 })).toBe('Execução interrompida — use Tentar novamente')
  })
})

describe('workbenchUserWaitReason', () => {
  const base = { stage: 'plan_review' as const, runState: 'idle' as const, pendingPermissions: 0, pendingForms: 0 }

  it('esperas do usuário têm o mesmo motivo da lista de trabalhos em andamento', () => {
    expect(workbenchUserWaitReason(base)).toBe('Aguardando revisão do plano')
    expect(workbenchUserWaitReason({ ...base, stage: 'preview' })).toBe('Aguardando aprovação da prévia')
    expect(workbenchUserWaitReason({ ...base, stage: 'pr_open' })).toBe('Aguardando revisão ou merge do PR')
    expect(workbenchUserWaitReason({ ...base, stage: 'changes_requested' })).toBe('Aguardando descrever as mudanças')
  })

  it('permissão e pergunta pendentes valem mesmo durante o turno', () => {
    expect(workbenchUserWaitReason({ ...base, stage: 'implementing', runState: 'running', pendingPermissions: 1 })).toBe('Aguardando você permitir uma ação')
    expect(workbenchUserWaitReason({ ...base, stage: 'implementing', runState: 'running', pendingForms: 1 })).toBe('Aguardando você responder uma pergunta')
  })

  it('agente executando não tem motivo', () => {
    expect(workbenchUserWaitReason({ ...base, stage: 'implementing', runState: 'running' })).toBeNull()
  })

  it('mesa concluída e mesa na fila do build não contam como espera do usuário', () => {
    expect(workbenchUserWaitReason({ ...base, stage: 'done' })).toBeNull()
    expect(workbenchUserWaitReason({ ...base, stage: 'build_queued' })).toBeNull()
  })
})

describe('reopenTargetColumn', () => {
  it('reabrir usa a coluna "Ao abrir a mesa" (desenvolvimento) quando definida', () => {
    const base = defaultCentralConfig('/x')
    const config = { ...base, columns: { ...base.columns, onStart: 'doing', onDone: 'done' } }
    expect(reopenTargetColumn(config, 'todo')).toBe('doing')
  })

  it('sem "Ao abrir a mesa", cai na coluna de entrada do vínculo', () => {
    expect(reopenTargetColumn(defaultCentralConfig('/x'), 'todo')).toBe('todo')
  })

  it('sem destino definido, não move (null)', () => {
    expect(reopenTargetColumn(defaultCentralConfig('/x'), null)).toBeNull()
  })
})

describe('workbenchProgressTone', () => {
  it('executando é verde; falha é destructive; o resto é warning', () => {
    expect(workbenchProgressTone({ running: true, runState: 'running' })).toBe('running')
    expect(workbenchProgressTone({ running: false, runState: 'failed' })).toBe('failed')
    expect(workbenchProgressTone({ running: false, runState: 'idle' })).toBe('waiting')
    expect(workbenchProgressTone({ running: false, runState: 'interrupted' })).toBe('waiting')
  })
})

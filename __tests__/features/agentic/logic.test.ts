import { describe, expect, it } from 'vitest'
import { defaultSessionDirectory, manualStageBlock, manualStageOptions, modelChain, parseCentralConfig, pickPreviewPort, prMergeReady, reopenTargetColumn, resolveAgent, resolveCentralCi, resolveCentralColumns, resolveCentralFlow, workbenchActions, workbenchProgressTone, workbenchUserWaitReason, workbenchWaitingReason } from '@/features/agentic/logic'
import { agentConfigSchema, agenticSettingsSchema, centralConfigSchema, DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig, withDefaultAgents } from '@/features/agentic/schemas'


describe('definir etapa da mesa (manualStageBlock)', () => {
  const state = (overrides: Partial<Parameters<typeof manualStageBlock>[1]> = {}) => ({ stage: 'plan_review' as const, hasPlan: true, hasPreview: false, prOpen: false, deleting: false, ...overrides })

  it('concluir vale de qualquer etapa que não seja Concluída, inclusive em execução', () => {
    for (const stage of ['planning', 'plan_review', 'implementing', 'preview', 'pr_open', 'finishing'] as const) expect(manualStageBlock('done', state({ stage }))).toBeNull()
    expect(manualStageBlock('done', state({ stage: 'done' }))).toContain('Reabrir')
  })

  it('etapas de espera exigem o que elas mostram (plano, prévia, PR aberto)', () => {
    expect(manualStageBlock('plan_review', state({ stage: 'preview', hasPlan: false }))).toBe('A mesa ainda não tem um plano para revisar')
    expect(manualStageBlock('plan_review', state({ stage: 'preview' }))).toBeNull()
    expect(manualStageBlock('preview', state())).toBe('A mesa não tem uma prévia publicada')
    expect(manualStageBlock('preview', state({ hasPreview: true }))).toBeNull()
    expect(manualStageBlock('pr_open', state())).toBe('A mesa não tem um Pull Request aberto')
    expect(manualStageBlock('changes_requested', state({ prOpen: true }))).toBeNull()
  })

  it('recusa a mesma etapa e a mesa em exclusão', () => {
    expect(manualStageBlock('plan_review', state())).toBe('A mesa já está em "Plano pronto"')
    expect(manualStageBlock('done', state({ deleting: true }))).toContain('excluída')
  })

  it('opções da tela marcam disponibilidade e motivo', () => {
    const options = manualStageOptions({ stage: 'preview', plans: [{}], previewUrl: 'http://h:4010', pr: { state: 'merged' }, deletionRequestedAt: null })
    expect(options.map((option) => [option.stage, option.available])).toEqual([
      ['plan_review', true],
      ['preview', false],
      ['pr_open', false],
      ['changes_requested', false],
      ['done', true],
    ])
    expect(options.find((option) => option.stage === 'pr_open')?.reason).toBe('A mesa não tem um Pull Request aberto')
  })
})

describe('resolveAgent', () => {
  const settings = { ...DEFAULT_AGENTIC_SETTINGS, agents: { ...DEFAULT_AGENTIC_SETTINGS.agents, planning: { agent: 'plan', model: 'anthropic/opus', variant: 'high' } } }

  it('sem override usa o padrão da aba', () => {
    expect(resolveAgent(settings, defaultCentralConfig('/x'), 'planning')).toEqual({ agent: 'plan', model: 'anthropic/opus', variant: 'high', fallbacks: [] })
  })

  it('override vale campo a campo (agente vazio herda; modelo próprio leva a variante própria)', () => {
    const central = { agents: { ...defaultCentralConfig('/x').agents, planning: { agent: null, model: 'openai/gpt', variant: null } } }
    expect(resolveAgent(settings, central, 'planning')).toEqual({ agent: 'plan', model: 'openai/gpt', variant: null, fallbacks: [] })
  })
})

describe('modelos de fallback', () => {
  const GPT = { model: 'openai/gpt-5', variant: 'high' }
  const DEEP = { model: 'deepseek/v3', variant: null }
  const settings = { ...DEFAULT_AGENTIC_SETTINGS, agents: { ...DEFAULT_AGENTIC_SETTINGS.agents, planning: { agent: 'plan', model: 'anthropic/opus', variant: null, fallbacks: [GPT, DEEP] } } }
  const central = (planning: Record<string, unknown> | null) => ({ agents: { ...defaultCentralConfig('/x').agents, planning: planning as never } })

  it('papel herdado inteiro (ou personalizado sem lista) usa os fallbacks do padrão', () => {
    expect(resolveAgent(settings, central(null), 'planning').fallbacks).toEqual([GPT, DEEP])
    expect(resolveAgent(settings, central({ agent: null, model: 'openai/o3', variant: null, fallbacks: null }), 'planning').fallbacks).toEqual([GPT, DEEP])
    expect(resolveAgent(settings, central({ agent: null, model: 'openai/o3', variant: null }), 'planning').fallbacks).toEqual([GPT, DEEP])
  })

  it('lista da central substitui a padrão (não soma) e lista vazia = sem fallback', () => {
    expect(resolveAgent(settings, central({ agent: null, model: null, variant: null, fallbacks: [DEEP] }), 'planning').fallbacks).toEqual([DEEP])
    expect(resolveAgent(settings, central({ agent: null, model: null, variant: null, fallbacks: [] }), 'planning').fallbacks).toEqual([])
  })

  it('agentes padrão salvos antes do campo: sem fallback', () => {
    expect(resolveAgent(DEFAULT_AGENTIC_SETTINGS, central(null), 'planning').fallbacks).toEqual([])
  })

  it('corrente: principal + fallbacks em ordem, com o agente do papel, sem repetir o principal', () => {
    expect(modelChain({ agent: 'plan', model: 'anthropic/opus', variant: null, fallbacks: [GPT, DEEP] })).toEqual([
      { agent: 'plan', model: 'anthropic/opus', variant: null },
      { agent: 'plan', ...GPT },
      { agent: 'plan', ...DEEP },
    ])
    // Modelo trocado na mesa igual a um fallback: o fallback repetido é pulado.
    expect(modelChain({ agent: 'plan', model: 'openai/gpt-5', variant: 'high', fallbacks: [GPT, DEEP] }).map((item) => item.model)).toEqual(['openai/gpt-5', 'deepseek/v3'])
    expect(modelChain({ agent: 'plan', model: null, variant: null })).toEqual([{ agent: 'plan', model: null, variant: null }])
  })

  it('schema: até 5, sem repetidos nem igual ao principal; configuração antiga continua válida', () => {
    expect(agentConfigSchema.safeParse({ agent: 'plan', model: null, variant: null }).success).toBe(true)
    expect(agentConfigSchema.safeParse({ agent: 'plan', model: 'a/b', variant: null, fallbacks: [GPT, DEEP] }).success).toBe(true)
    const six = Array.from({ length: 6 }, (_, index) => ({ model: `p/m${index}`, variant: null }))
    expect(agentConfigSchema.safeParse({ agent: null, model: null, variant: null, fallbacks: six }).success).toBe(false)
    const repeated = agentConfigSchema.safeParse({ agent: null, model: 'a/b', variant: null, fallbacks: [GPT, GPT] })
    expect(repeated.success ? null : repeated.error.issues[0]?.message).toBe('Modelo de fallback repetido')
    const primary = agentConfigSchema.safeParse({ agent: null, model: 'openai/gpt-5', variant: 'high', fallbacks: [GPT] })
    expect(primary.success ? null : primary.error.issues[0]?.message).toBe('O fallback é igual ao modelo principal')
    // Mesmo modelo com outra variante é outro item válido.
    expect(agentConfigSchema.safeParse({ agent: null, model: 'openai/gpt-5', variant: null, fallbacks: [GPT] }).success).toBe(true)
  })
})

describe('pickPreviewPort', () => {
  it('menor porta livre da faixa padrão 5002–5998', () => {
    expect(pickPreviewPort([])).toBe(5002)
    expect(pickPreviewPort([5002, 5003, 5005])).toBe(5004)
  })

  it('faixa esgotada devolve null (nunca sai da faixa)', () => {
    expect(pickPreviewPort(Array.from({ length: 997 }, (_, index) => 5002 + index))).toBeNull()
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
    expect(workbenchActions('preview', 'idle', true)).toEqual(['open-preview', 'rebuild-preview', 'request-correction', 'approve'])
    // Prévia fora do ar (sem endereço): ainda dá para gerar uma nova.
    expect(workbenchActions('preview', 'idle', false)).toEqual(['rebuild-preview', 'request-correction', 'approve'])
    expect(workbenchActions('changes_requested', 'idle', false)).toEqual(['submit-pr-feedback'])
    expect(workbenchActions('done', 'idle', false)).toEqual(['reopen'])
    expect(workbenchActions('pr_open', 'idle', false)).toEqual([])
    expect(workbenchActions('build_queued', 'idle', false)).toEqual([])
  })

  it('executando só permite parar; falha permite reconectar e tentar de novo', () => {
    expect(workbenchActions('implementing', 'running', false)).toEqual(['interrupt'])
    expect(workbenchActions('building', 'failed', false)).toEqual(['reconnect', 'retry', 'request-correction'])
    expect(workbenchActions('planning', 'interrupted', false)).toEqual(['reconnect', 'retry'])
  })

  it('aguardando vaga na central só permite cancelar a espera', () => {
    expect(workbenchActions('plan_review', 'idle', false, true, true)).toEqual(['cancel-wait'])
    expect(workbenchActions('done', 'idle', false, false, true)).toEqual(['cancel-wait'])
  })

  it('sem sessão do OpenCode, não oferece Reconectar', () => {
    expect(workbenchActions('planning', 'interrupted', false, false)).toEqual(['retry'])
    expect(workbenchActions('building', 'failed', false, false)).toEqual(['retry', 'request-correction'])
  })

  it('mesa concluída (sessão desvinculada pela OPE-46) e etapas sem execução não oferecem Reconectar', () => {
    // Concluir a mesa desvincula a sessão do OpenCode: só resta Reabrir.
    expect(workbenchActions('done', 'idle', false, false)).toEqual(['reopen'])
    // Reconectar exige uma etapa de execução em andamento, mesmo com sessão existente.
    expect(workbenchActions('pr_open', 'interrupted', false, true)).toEqual([])
    expect(workbenchActions('plan_review', 'failed', false, true)).toEqual([])
  })

  it('Agente Adversário: bloqueio oferece corrigir, revisar de novo e seguir; revisão que falhou não reconecta', () => {
    expect(workbenchActions('adversarial_blocked', 'idle', false)).toEqual(['adversarial-fix', 'adversarial-rerun', 'adversarial-skip'])
    expect(workbenchActions('adversarial_review', 'running', false)).toEqual(['interrupt'])
    expect(workbenchActions('adversarial_review', 'failed', false, true)).toEqual(['retry', 'adversarial-skip', 'request-correction'])
    expect(workbenchUserWaitReason({ stage: 'adversarial_blocked', runState: 'idle', pendingPermissions: 0, pendingForms: 0 })).toBe('O agente adversário bloqueou: decida como seguir')
  })

  it('resolução de conflito é uma etapa de execução: parar, reconectar, tentar de novo e voltar ao plano', () => {
    expect(workbenchActions('resolving_conflicts', 'running', false)).toEqual(['interrupt'])
    expect(workbenchActions('resolving_conflicts', 'failed', false)).toEqual(['reconnect', 'retry', 'request-correction'])
  })

  it('merge automático e exclusão da branch remota não têm "voltar ao planejamento"', () => {
    expect(workbenchActions('merging_pr', 'running', false)).toEqual(['interrupt'])
    expect(workbenchActions('merging_pr', 'failed', false)).toEqual(['reconnect', 'retry'])
    expect(workbenchActions('deleting_pr_branch', 'interrupted', false)).toEqual(['reconnect', 'retry'])
    expect(workbenchActions('deleting_pr_branch', 'failed', false, false)).toEqual(['retry'])
  })
})

describe('parseCentralConfig', () => {
  it('completa configurações antigas com os padrões', () => {
    const parsed = parseCentralConfig({ sessionDirectory: '/repo', git: { baseBranch: 'dev' } })
    expect(parsed.sessionDirectory).toBe('/repo')
    expect(parsed.git.baseBranch).toBe('dev')
    expect(parsed.git.prTargetBranch).toBe('main')
    // Merge automático nasce desligado e é preservado quando salvo (compatibilidade com centrais antigas).
    expect(parsed.git.autoMerge).toBe(false)
    expect(parseCentralConfig({ sessionDirectory: '/repo', git: { autoMerge: true } }).git.autoMerge).toBe(true)
    expect(parsed.cleanup).toEqual({ teardownEnvironment: true, removeWorktree: true, deleteBranch: true })
  })

  it('preenche a pasta dos worktrees e a faixa de portas antiga quando ausentes (central salva)', () => {
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
    expect([parsed.environment.previewPortMin, parsed.environment.previewPortMax]).toEqual([5002, 5998])
  })

  it('central antiga sem builder do Docker usa o padrão do host; o salvo é preservado', () => {
    expect(parseCentralConfig({ sessionDirectory: '/repo', environment: { composeFile: 'x.yml' } }).environment.dockerBuilder).toBe('')
    expect(parseCentralConfig({ sessionDirectory: '/repo', environment: { dockerBuilder: 'limit-builder' } }).environment.dockerBuilder).toBe('limit-builder')
  })

  it('builder do Docker com caractere de shell é inválido', () => {
    const base = defaultCentralConfig('/repo')
    expect(centralConfigSchema.safeParse({ ...base, environment: { ...base.environment, dockerBuilder: 'x; rm -rf /' } }).success).toBe(false)
    expect(centralConfigSchema.safeParse({ ...base, environment: { ...base.environment, dockerBuilder: 'my_builder.1-a' } }).success).toBe(true)
  })

  it('a coluna da fila nasce desligada e é preservada quando salva', () => {
    expect(parseCentralConfig({ sessionDirectory: '/repo' }).columns.queue).toBeNull()
    expect(parseCentralConfig({ sessionDirectory: '/repo', columns: { queue: 'fila' } }).columns.queue).toBe('fila')
  })

  it('o backup do banco nasce ligado (compatível) e o desligado é preservado (OPE-72)', () => {
    expect(parseCentralConfig({ sessionDirectory: '/repo' }).environment.backupDatabase).toBe(true)
    expect(parseCentralConfig({ sessionDirectory: '/repo', environment: { backupDatabase: false } }).environment.backupDatabase).toBe(false)
  })
})

describe('padrões da central', () => {  it('worktreeRoot nasce como <diretório das sessões>/worktrees', () => {
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
    expect(workbenchWaitingReason({ ...base, stage: 'pr_open' })).toBe('Aguardando comentário (@opex), revisão ou merge do PR')
    expect(workbenchWaitingReason({ ...base, stage: 'changes_requested' })).toBe('Aguardando descrever as mudanças')
  })

  it('permissão e pergunta pendentes vêm antes da etapa, mesmo durante o turno', () => {
    expect(workbenchWaitingReason({ ...base, stage: 'implementing', runState: 'running', pendingPermissions: 1 })).toBe('Aguardando você permitir uma ação')
    expect(workbenchWaitingReason({ ...base, stage: 'implementing', runState: 'running', pendingForms: 2 })).toBe('Aguardando você responder uma pergunta')
  })

  it('aguardando vaga mostra a posição na central', () => {
    expect(workbenchWaitingReason({ ...base, waitingSlot: true, slotQueuePosition: 2 })).toBe('Aguardando vaga na central (#2)')
    expect(workbenchWaitingReason({ ...base, stage: 'done', waitingSlot: true })).toBe('Aguardando vaga na central')
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
    expect(workbenchUserWaitReason({ ...base, stage: 'pr_open' })).toBe('Aguardando comentário (@opex), revisão ou merge do PR')
    expect(workbenchUserWaitReason({ ...base, stage: 'changes_requested' })).toBe('Aguardando descrever as mudanças')
  })

  it('permissão e pergunta pendentes valem mesmo durante o turno', () => {
    expect(workbenchUserWaitReason({ ...base, stage: 'implementing', runState: 'running', pendingPermissions: 1 })).toBe('Aguardando você permitir uma ação')
    expect(workbenchUserWaitReason({ ...base, stage: 'implementing', runState: 'running', pendingForms: 1 })).toBe('Aguardando você responder uma pergunta')
  })

  it('aguardando vaga não é espera do usuário', () => {
    expect(workbenchUserWaitReason({ ...base, waitingSlot: true })).toBeNull()
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
    expect(reopenTargetColumn(config.columns, 'todo')).toBe('doing')
  })

  it('sem "Ao abrir a mesa", cai na coluna de entrada do vínculo', () => {
    expect(reopenTargetColumn(defaultCentralConfig('/x').columns, 'todo')).toBe('todo')
  })

  it('sem destino definido, não move (null)', () => {
    expect(reopenTargetColumn(defaultCentralConfig('/x').columns, null)).toBeNull()
  })
})

describe('colunas globais da central (OPE-79)', () => {
  const globalColumns = { queue: 'global-fila', onStart: 'global-doing', onPr: 'global-pr', onDone: 'global-done' }

  it('a central nova herda todos os padrões globais', () => {
    expect(resolveCentralColumns(globalColumns, defaultCentralConfig('/x').columns)).toEqual(globalColumns)
  })

  it('a central antiga (sem os modos) preserva o que tinha, com "Nenhuma/Não mover" valendo', () => {
    const parsed = parseCentralConfig({ sessionDirectory: '/repo', columns: { queue: 'fila', onStart: null } })
    expect(parsed.columns).toEqual({ inheritQueue: false, inheritMovement: false, queue: 'fila', onStart: null, onPr: null, onDone: null })
    expect(resolveCentralColumns(globalColumns, parsed.columns)).toEqual({ queue: 'fila', onStart: null, onPr: null, onDone: null })
  })

  it('cada grupo herda separadamente e o valor personalizado vence o global', () => {
    const base = defaultCentralConfig('/x')
    const custom = { ...base.columns, inheritQueue: true, inheritMovement: false, onStart: 'doing', onPr: null, onDone: 'done' }
    expect(resolveCentralColumns(globalColumns, custom)).toEqual({ queue: 'global-fila', onStart: 'doing', onPr: null, onDone: 'done' })
  })

  it('o modo herdado é preservado ao salvar', () => {
    expect(parseCentralConfig({ sessionDirectory: '/repo', columns: { inheritQueue: true, inheritMovement: true, queue: 'x' } }).columns.inheritQueue).toBe(true)
  })
})

describe('fluxo padrão da central (OPE-79)', () => {
  it('sem escolha na tarefa vale o padrão da central', () => {
    expect(resolveCentralFlow(true, null)).toBe('preview')
    expect(resolveCentralFlow(false, null)).toBe('auto_pr')
    expect(resolveCentralFlow(true, undefined)).toBe('preview')
  })

  it('a escolha explícita da tarefa vence o padrão da central', () => {
    expect(resolveCentralFlow(false, 'preview')).toBe('preview')
    expect(resolveCentralFlow(true, 'auto_pr')).toBe('auto_pr')
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

describe('prMergeReady', () => {
  it('PR sem conflito e sem bloqueios, fora do rascunho, está pronto', () => {
    expect(prMergeReady({ mergeable: true, mergeableState: 'clean', draft: false })).toBe(true)
    expect(prMergeReady({ mergeable: true, mergeableState: 'behind' })).toBe(true)
    expect(prMergeReady({ mergeable: true, mergeableState: 'has_hooks' })).toBe(true)
  })

  it('rascunho, conflito, cálculo pendente e bloqueios não autorizam o merge', () => {
    expect(prMergeReady({ mergeable: true, mergeableState: 'clean', draft: true })).toBe(false)
    expect(prMergeReady({ mergeable: false, mergeableState: 'dirty' })).toBe(false)
    expect(prMergeReady({ mergeable: null, mergeableState: 'clean' })).toBe(false)
    expect(prMergeReady({ mergeable: true, mergeableState: 'blocked' })).toBe(false)
    expect(prMergeReady({ mergeable: true, mergeableState: 'unstable' })).toBe(false)
    expect(prMergeReady({ mergeable: true })).toBe(false)
  })
})

describe('configuração do merge automático', () => {
  it('nasce desligado no padrão da central', () => {
    expect(defaultCentralConfig('/x').git.autoMerge).toBe(false)
  })

  it('não combina com abrir o PR como rascunho (mesmo schema da tela e da API)', () => {
    const base = defaultCentralConfig('/repo')
    const parsed = centralConfigSchema.safeParse({ ...base, git: { ...base.git, autoMerge: true, prDraft: true } })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues[0]!.path).toEqual(['git', 'autoMerge'])
    }
    expect(centralConfigSchema.safeParse({ ...base, git: { ...base.git, autoMerge: true, prDraft: false } }).success).toBe(true)
  })
})

describe('correção de CI: padrão global e central (OPE-81)', () => {
  const global = { fixCi: false, ciFixLimit: 5 }

  it('central nova herda o padrão global', () => {
    const git = defaultCentralConfig('/x').git
    expect(git).toMatchObject({ inheritCi: true, fixCi: true, ciFixLimit: null })
    expect(resolveCentralCi(global, git)).toEqual(global)
    expect(resolveCentralCi(undefined, git)).toEqual({ fixCi: true, ciFixLimit: null })
  })

  it('central antiga (sem valor próprio) herda; a que personaliza preserva o seu valor', () => {
    expect(parseCentralConfig({ sessionDirectory: '/repo', git: { baseBranch: 'dev' } }).git.inheritCi).toBe(true)
    const custom = parseCentralConfig({ sessionDirectory: '/repo', git: { inheritCi: false, fixCi: true, ciFixLimit: 2 } }).git
    expect(resolveCentralCi(global, custom)).toEqual({ fixCi: true, ciFixLimit: 2 })
  })

  it('configuração global antiga (sem `ci`) cai no padrão: ligada e sem limite', () => {
    expect(agenticSettingsSchema.parse(withDefaultAgents({ enabled: true, columns: DEFAULT_AGENTIC_SETTINGS.columns })).ci).toEqual({ fixCi: true, ciFixLimit: null })
  })

  it('limite fora de 1–20 é inválido; vazio (null) = sem limite', () => {
    const base = defaultCentralConfig('/x')
    expect(centralConfigSchema.safeParse({ ...base, git: { ...base.git, ciFixLimit: 21 } }).success).toBe(false)
    expect(centralConfigSchema.safeParse({ ...base, git: { ...base.git, ciFixLimit: 0 } }).success).toBe(false)
    expect(centralConfigSchema.safeParse({ ...base, git: { ...base.git, ciFixLimit: null } }).success).toBe(true)
  })
})

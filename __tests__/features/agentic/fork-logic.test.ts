import { describe, expect, it } from 'vitest'
import { FORK_READONLY_PERMISSIONS } from '@/features/agentic/constants'
import {
  asForkMode,
  canChangeForkMode,
  canOpenChildFork,
  effectiveForkMode,
  extractForkSummary,
  forkActions,
  forkInstructions,
  forkIntegrationTargets,
  forkModeBlockReason,
  forkModeNote,
  forkModeText,
  forkNotesInstructions,
  forkTree,
  forkTurnAgent,
  initialForkMode,
  plannerActionFor,
} from '@/features/agentic/fork-logic'
import { parseCentralConfig } from '@/features/agentic/logic'
import { DEFAULT_AGENTIC_SETTINGS, agenticSettingsSchema, withDefaultAgents } from '@/features/agentic/schemas'

/** Regras puras dos forks da conversa: ações por estado, destinos da integração e extração do resumo. */

const view = (patch: Partial<Parameters<typeof forkIntegrationTargets>[0]> = {}) => ({ stage: 'plan_review' as const, runState: 'idle' as const, sessionId: 's1', waitingSlot: false, ...patch })
const available = (options: ReturnType<typeof forkIntegrationTargets>) => options.filter((item) => item.available).map((item) => item.target)

describe('forkActions', () => {
  it('ativo: enviar e pausar a conversa; executando: só parar', () => {
    expect(forkActions('active', 'idle')).toEqual(['send', 'close'])
    expect(forkActions('active', 'running')).toEqual(['interrupt'])
  })

  it('ativo com falha: tentar de novo ou pausar a conversa', () => {
    expect(forkActions('active', 'failed')).toEqual(['retry', 'close'])
    expect(forkActions('active', 'interrupted')).toEqual(['retry', 'close'])
  })

  it('pausado: retomar, integrar ou descartar', () => {
    expect(forkActions('closed', 'idle')).toEqual(['resume', 'integrate', 'discard'])
  })

  it('integrando: com resumo aplica, modifica ou cancela; sem resumo só cancela', () => {
    expect(forkActions('integrating', 'idle', true)).toEqual(['apply', 'revise-summary', 'cancel-integration'])
    expect(forkActions('integrating', 'idle', false)).toEqual(['cancel-integration'])
    expect(forkActions('integrating', 'running', true)).toEqual(['interrupt'])
    expect(forkActions('integrating', 'failed', true)).toEqual(['retry', 'cancel-integration'])
  })

  it('integrado e concluído são histórico somente leitura', () => {
    expect(forkActions('integrated', 'idle')).toEqual([])
    expect(forkActions('concluded', 'idle')).toEqual([])
  })
})

describe('forkIntegrationTargets', () => {
  it('plano pronto: contexto da conversa principal e planejador', () => {
    expect(available(forkIntegrationTargets(view()))).toEqual(['context', 'planner'])
    expect(plannerActionFor(view())).toBe('revise-plan')
  })

  it('prévia pronta, mudanças pedidas e falha usam a correção da etapa', () => {
    expect(plannerActionFor(view({ stage: 'preview' }))).toBe('request-correction')
    expect(plannerActionFor(view({ stage: 'changes_requested' }))).toBe('submit-pr-feedback')
    expect(plannerActionFor(view({ stage: 'implementing', runState: 'failed' }))).toBe('request-correction')
  })

  it('agente executando ou aguardando vaga: planejador indisponível com o motivo', () => {
    const running = forkIntegrationTargets(view({ stage: 'implementing', runState: 'running' }))
    expect(available(running)).toEqual(['context'])
    expect(running.find((item) => item.target === 'planner')?.reason).toContain('aguarda correção')
    expect(available(forkIntegrationTargets(view({ waitingSlot: true })))).toEqual(['context'])
  })

  it('mesa concluída (sem sessão): só reabrir', () => {
    const done = forkIntegrationTargets(view({ stage: 'done', sessionId: null }))
    expect(available(done)).toEqual(['reopen'])
    expect(done.find((item) => item.target === 'context')?.reason).toContain('concluída')
  })

  it('fork da conversa principal não tem o destino "Fork pai"', () => {
    expect(forkIntegrationTargets(view()).map((item) => item.target)).not.toContain('parent')
  })

  it('fork de fork: "Fork pai" disponível com o pai em aberto, junto com os destinos da mesa', () => {
    const targets = forkIntegrationTargets(view(), { number: 1, status: 'closed' })
    expect(available(targets)).toEqual(['parent', 'context', 'planner'])
    expect(targets[0]!.label).toBe('Fork pai (Fork 1)')
  })

  it('fork de fork: pai integrado, concluído ou descartado deixa "Fork pai" indisponível com o motivo', () => {
    expect(forkIntegrationTargets(view(), { number: 1, status: 'integrated' })[0]).toMatchObject({ available: false, reason: expect.stringContaining('não está mais em aberto') })
    expect(forkIntegrationTargets(view(), { number: 1, status: 'concluded' })[0]!.available).toBe(false)
    expect(forkIntegrationTargets(view(), { number: 1, status: null })[0]).toMatchObject({ available: false, reason: 'O fork pai foi descartado' })
  })
})

describe('fork de fork', () => {
  it('abre a partir de forks em aberto (ativo, pausado, integrando)', () => {
    expect(['active', 'closed', 'integrating'].every((status) => canOpenChildFork(status as never))).toBe(true)
    expect(canOpenChildFork('integrated')).toBe(false)
    expect(canOpenChildFork('concluded')).toBe(false)
  })

  it('árvore do seletor: filhos logo abaixo do pai, recuados; filho de pai descartado vai para a raiz', () => {
    const forks = [
      { id: 'a', number: 1, parentForkId: null },
      { id: 'b', number: 2, parentForkId: null },
      { id: 'c', number: 3, parentForkId: 'a' },
      { id: 'd', number: 4, parentForkId: 'c' },
      { id: 'e', number: 5, parentForkId: 'sumiu' },
    ]
    expect(forkTree(forks).map(({ fork, depth }) => `${fork.number}:${depth}`)).toEqual(['1:0', '3:1', '4:2', '2:0', '5:0'])
  })
})

describe('extractForkSummary', () => {
  it('extrai o trecho sob o título, tolerante a nível, caixa e acento', () => {
    expect(extractForkSummary('Intro\n\n### RESUMO PARA INTEGRACAO\n- usar X\n- evitar Y\n\n## Outro\nfim')).toBe('- usar X\n- evitar Y')
  })

  it('sem o título usa o texto inteiro; texto vazio não tem resumo', () => {
    expect(extractForkSummary('  só o resumo  ')).toBe('só o resumo')
    expect(extractForkSummary('   ')).toBeNull()
  })
})

describe('configuração dos forks', () => {
  it('central antiga cai em "Sempre perguntar"', () => {
    expect(parseCentralConfig({ sessionDirectory: '/home/u/app' }).forks.onWorkbenchDone).toBe('ask')
    expect(parseCentralConfig({ sessionDirectory: '/home/u/app', forks: { onWorkbenchDone: 'conclude' } }).forks.onWorkbenchDone).toBe('conclude')
  })

  it('o agente dos forks herda o do planejamento quando ainda não foi configurado', () => {
    const planning = { agent: 'plan-pro', model: 'anthropic/claude', variant: null }
    const saved = { enabled: true, agents: { ...DEFAULT_AGENTIC_SETTINGS.agents, planning, fork: undefined } }
    const parsed = agenticSettingsSchema.parse(withDefaultAgents(saved))
    expect(parsed.agents.fork).toEqual(planning)
    expect(parsed.agents.implementation).toEqual(DEFAULT_AGENTIC_SETTINGS.agents.implementation)
  })

  it('a sessão do fork é somente leitura: nega edição e comandos, libera só leitura', () => {
    expect(FORK_READONLY_PERMISSIONS).toEqual(expect.arrayContaining([{ action: 'edit', resource: '*', effect: 'deny' }, { action: 'bash', resource: '*', effect: 'deny' }, { action: 'bash', resource: 'git diff*', effect: 'allow' }]))
    // A liberação vem depois do bloqueio geral (a última regra que casa vale).
    const bashDeny = FORK_READONLY_PERMISSIONS.findIndex((rule) => rule.action === 'bash' && rule.effect === 'deny')
    expect(FORK_READONLY_PERMISSIONS.findIndex((rule) => rule.action === 'bash' && rule.effect === 'allow')).toBeGreaterThan(bashDeny)
  })

  it('resumos integrados viram a instrução da conversa principal', () => {
    expect(forkNotesInstructions([])).toBe('')
    expect(forkNotesInstructions([{ number: 2, summary: 'usar X' }])).toContain('## Fork 2\nusar X')
    expect(forkNotesInstructions([{ number: 4, summary: 'usar Y' }], 'fork')).toContain('forks deste fork')
  })
})

describe('modo do fork (Plan/Build) e trava de somente leitura', () => {
  it('modo inicial: agente plan = Plan; demais = Build; trava sempre Plan; modo pedido vale sem trava', () => {
    expect(initialForkMode('plan')).toBe('plan')
    expect(initialForkMode('build')).toBe('build')
    expect(initialForkMode('general')).toBe('build')
    expect(initialForkMode(null)).toBe('build')
    expect(initialForkMode('build', { readOnly: true })).toBe('plan')
    expect(initialForkMode('build', { readOnly: true, mode: 'build' })).toBe('plan')
    expect(initialForkMode('plan', { mode: 'build' })).toBe('build')
  })

  it('forks antigos sem os campos ficam em Plan (eram somente leitura) e a trava força Plan', () => {
    expect(asForkMode(undefined)).toBe('plan')
    expect(asForkMode('lixo')).toBe('plan')
    expect(asForkMode('build')).toBe('build')
    expect(effectiveForkMode('build', true)).toBe('plan')
    expect(effectiveForkMode('build', undefined)).toBe('build')
  })

  it('agente do turno: Plan usa o plan; Build usa o agente configurado (ou build no lugar do plan)', () => {
    expect(forkTurnAgent('plan', 'build')).toBe('plan')
    expect(forkTurnAgent('build', 'general')).toBe('general')
    expect(forkTurnAgent('build', 'plan')).toBe('build')
    expect(forkTurnAgent('build', null)).toBe('build')
  })

  it('trocar o modo: só em aberto, com o agente parado e sem trava', () => {
    expect(forkModeBlockReason('active', 'idle', false)).toBeNull()
    expect(forkModeBlockReason('closed', 'failed', false)).toBeNull()
    expect(forkModeBlockReason('active', 'running', false)).toBe('Aguarde o agente terminar de responder')
    expect(forkModeBlockReason('integrated', 'idle', false)).toBe('O fork não está mais em aberto')
    expect(forkModeBlockReason('active', 'idle', true)).toBe('Fork travado como somente leitura')
    expect(canChangeForkMode('active', 'idle', false)).toBe(true)
    expect(canChangeForkMode('active', 'idle', true)).toBe(false)
  })

  it('textos e aviso ao agente pelo modo', () => {
    expect(forkModeText('plan', false)).toContain('somente leitura')
    expect(forkModeText('build', false)).toContain('pode alterar arquivos')
    expect(forkModeText('plan', true)).toBe('somente leitura (travado)')
    expect(forkModeNote('build', false)).toContain('PODE alterar arquivos')
    expect(forkModeNote('plan', true)).toContain('Plan (travado)')
    expect(forkModeNote('plan', false)).toContain('SOMENTE LEITURA')
  })

  it('protocolo: Plan proíbe alterações; Build libera dentro das permissões do agente', () => {
    expect(forkInstructions('')).toContain('SOMENTE LEITURA')
    const build = forkInstructions('Extra da central', false)
    expect(build).not.toContain('SOMENTE LEITURA')
    expect(build).toContain('PODE alterar arquivos')
    expect(build).toContain('Extra da central')
  })
})

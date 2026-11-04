import { describe, expect, it } from 'vitest'
import { RUNNING_STAGES, SLOT_EXEMPT_STAGES, STAGE_MODEL_ROLE, WORKBENCH_STAGE_LABELS } from '@/features/agentic/constants'
import { activeRunId, draftWorkbenchModels, manualStageBlock, openPlanBlockReason, resolvePlanAfterRefinement, startRefineBlockReason, workbenchActions, workbenchWaitingReason, type StartBlockInput } from '@/features/agentic/logic'
import { matchesDevCenterState } from '@/features/agentic/dev-center-filters'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'
import { refinementConcluded } from '@/features/refinement/logic'
import { buildRefinementPrompt, withAdditionalInfo } from '@/features/refinement/prompt'
import { workbenchSteps } from '@/features/agentic/components/workbench/StageSteps'
import { showsSpecAfter } from '@/features/agentic/components/workbench/RefinementWorkbenchView'

/** Regras puras do refinamento na mesa de trabalho (OPE-137). */

const base: StartBlockInput = { agentic: null, otherProject: null, upload: null, refinement: { available: true, reason: null, existing: null }, hasInput: false }

describe('etapas Refinando e Especificação pronta', () => {
  it('Refinando ocupa vaga como Planejando; Especificação pronta não, como Plano pronto', () => {
    expect(WORKBENCH_STAGE_LABELS.refining).toBe('Refinando')
    expect(WORKBENCH_STAGE_LABELS.spec_ready).toBe('Especificação pronta')
    expect(RUNNING_STAGES).toContain('refining')
    expect(SLOT_EXEMPT_STAGES).toContain('spec_ready')
    expect(SLOT_EXEMPT_STAGES).not.toContain('refining')
  })

  it('o seletor de modelos troca o Refinamento em Refinando e o Plano em Especificação pronta', () => {
    expect(STAGE_MODEL_ROLE.refining).toBe('refinement')
    expect(STAGE_MODEL_ROLE.spec_ready).toBe('planning')
  })

  it('ações da mesa: em Refinando são as do refinamento; em Especificação pronta, Gerar plano, Continuar e Recomeçar', () => {
    expect(workbenchActions('refining', 'running', false)).toEqual([])
    expect(workbenchActions('refining', 'interrupted', false)).toEqual([])
    expect(workbenchActions('spec_ready', 'idle', false)).toEqual(['generate-plan', 'continue-refinement', 'restart-refinement'])
    expect(workbenchActions('spec_ready', 'idle', false, true, true)).toEqual(['cancel-wait'])
  })

  it('"Definir etapa" fica bloqueado com o refinamento em andamento', () => {
    expect(manualStageBlock('done', { stage: 'refining', hasPlan: false, hasPreview: false, prOpen: false, deleting: false })).toContain('encerre-o')
    expect(manualStageBlock('done', { stage: 'spec_ready', hasPlan: false, hasPreview: false, prOpen: false, deleting: false })).toBeNull()
  })

  it('motivos de espera da lista: interrompido pede Continuar/Reconectar; Especificação pronta pede o plano', () => {
    expect(workbenchWaitingReason({ stage: 'refining', runState: 'interrupted', pendingForms: 0, pendingPermissions: 0 })).toBe('Refinamento interrompido — use Continuar ou Reconectar')
    expect(workbenchWaitingReason({ stage: 'refining', runState: 'running', pendingForms: 1, pendingPermissions: 0 })).toBe('Aguardando você responder uma pergunta')
    expect(workbenchWaitingReason({ stage: 'spec_ready', runState: 'idle', pendingForms: 0, pendingPermissions: 0 })).toContain('gere o plano')
  })

  it('em Refinando o turno vivo é o do refinamento', () => {
    expect(activeRunId({ _id: 'w1', stage: 'refining', refinementId: 'r1' })).toBe('r1')
    expect(activeRunId({ _id: 'w1', stage: 'planning', refinementId: 'r1' })).toBe('w1')
  })

  it('o filtro "Refinamento" da Central de desenvolvimento casa as duas etapas', () => {
    const workbench = (stage: 'refining' | 'spec_ready' | 'planning') => ({ workbench: { stage, runState: 'idle' as const, pendingForms: 0, pendingPermissions: 0 } })
    expect(matchesDevCenterState('refinement', workbench('refining'))).toBe(true)
    expect(matchesDevCenterState('refinement', workbench('spec_ready'))).toBe(true)
    expect(matchesDevCenterState('refinement', workbench('planning'))).toBe(false)
  })
})

describe('passo "Refinamento" na trilha', () => {
  it('só aparece nas mesas que passaram pelo refinamento, antes do Plano', () => {
    expect(workbenchSteps('preview', false).map((step) => step.id)[0]).toBe('plan')
    expect(workbenchSteps('preview', false, true).map((step) => step.id).slice(0, 2)).toEqual(['refine', 'plan'])
  })
})

describe('Gerar plano após refinar', () => {
  it('a escolha da tarefa vence; sem ela, o padrão da central (desligado por padrão)', () => {
    expect(resolvePlanAfterRefinement(undefined, null)).toBe(false)
    expect(resolvePlanAfterRefinement(true, null)).toBe(true)
    expect(resolvePlanAfterRefinement(true, false)).toBe(false)
    expect(resolvePlanAfterRefinement(false, true)).toBe(true)
  })

  it('centrais novas e existentes começam desligadas', () => {
    expect(defaultCentralConfig('/x').environment.planAfterRefinement).toBe(false)
  })
})

describe('bloqueios da tela inicial', () => {
  it('refinamento não concluído bloqueia "Abrir mesa e gerar o plano" com o motivo (item 8)', () => {
    expect(openPlanBlockReason({ ...base, refinement: { available: true, reason: null, existing: { concluded: false, running: false, liveChat: true } } })).toBe('Há um refinamento em andamento. Continue-o pelo Refinar tarefa ou encerre-o.')
    expect(openPlanBlockReason({ ...base, refinement: { available: true, reason: null, existing: { concluded: true, running: false, liveChat: true } } })).toBeNull()
  })

  it('"Refinar tarefa" segue a disponibilidade do Agente Refinador, o outro projeto e o envio dos anexos', () => {
    expect(startRefineBlockReason(base)).toBeNull()
    expect(startRefineBlockReason({ ...base, refinement: undefined })).toBe('Verificando o Agente Refinador…')
    expect(startRefineBlockReason({ ...base, refinement: { available: false, reason: 'OpenCode não está conectado', existing: null } })).toBe('OpenCode não está conectado')
    expect(startRefineBlockReason({ ...base, otherProject: 'A tarefa não é do projeto Portal' })).toBe('A tarefa não é do projeto Portal')
    expect(startRefineBlockReason({ ...base, upload: 'Aguarde o envio dos anexos' })).toBe('Aguarde o envio dos anexos')
  })

  it('agente refinando com o chat ao vivo desligado: bloqueia só com texto ou anexos pendentes', () => {
    const running = { available: true, reason: null, existing: { concluded: false, running: true, liveChat: false } }
    expect(startRefineBlockReason({ ...base, refinement: running })).toBeNull()
    expect(startRefineBlockReason({ ...base, refinement: running, hasInput: true })).toContain('chat durante a execução está desligado')
  })
})

describe('modelos da tela inicial', () => {
  it('o papel Refinamento usa o Agente Refinador como padrão', () => {
    const choices = draftWorkbenchModels(DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig('/x'), {}, { agent: 'plan', model: 'openai/gpt-5', variant: 'high' })
    expect(choices.refinement).toMatchObject({ model: 'openai/gpt-5', variant: 'high', overridden: false, source: 'refiner' })
    const changed = draftWorkbenchModels(DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig('/x'), { refinement: { model: 'anthropic/opus', variant: null } }, { agent: 'plan', model: 'openai/gpt-5', variant: 'high' })
    expect(changed.refinement).toMatchObject({ model: 'anthropic/opus', overridden: true, source: 'workbench', inherited: { model: 'openai/gpt-5', variant: 'high' } })
  })
})

describe('refinamento concluído', () => {
  it('esclarecido ou encerrado conta como concluído', () => {
    expect(refinementConcluded({ resolved: true, closed: false })).toBe(true)
    expect(refinementConcluded({ resolved: false, closed: true })).toBe(true)
    expect(refinementConcluded({ resolved: false, closed: false })).toBe(false)
    expect(refinementConcluded(null)).toBe(false)
  })

  it('a visão troca para a Especificação só quando concluiu (não ao encerrar)', () => {
    expect(showsSpecAfter('refining', 'spec_ready', false)).toBe(true)
    expect(showsSpecAfter('refining', 'spec_ready', true)).toBe(false)
    expect(showsSpecAfter('spec_ready', 'spec_ready', false)).toBe(false)
  })
})

describe('prompt do refinamento', () => {
  it('as informações adicionais entram numa seção própria (vazias, nada muda)', () => {
    expect(withAdditionalInfo('base', '  ')).toBe('base')
    expect(withAdditionalInfo('base', 'regra X')).toBe('base\n\n## Informações adicionais do dono\n\nregra X')
  })

  it('o primeiro prompt leva a tarefa, as informações adicionais e o pedido da primeira rodada', () => {
    const task = { id: 't1', code: 'OPX-1', title: 'Login', taskType: null, priority: 'medium', project: null, createdAt: null, description: 'Ajustar', technicalSpec: null, comments: [], history: [], timeLogs: [], totalTimeLogged: 0 } as unknown as Parameters<typeof buildRefinementPrompt>[0]
    const prompt = buildRefinementPrompt(task, { comments: false, history: false }, 'use o componente X')
    expect(prompt).toContain('use o componente X')
    expect(prompt.indexOf('use o componente X')).toBeLessThan(prompt.indexOf('Comece lendo a tarefa'))
  })
})

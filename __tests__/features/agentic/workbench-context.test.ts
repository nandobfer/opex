import { describe, expect, it } from 'vitest'
import { governingPlan, withWorkbenchContext, workbenchContextFallback, workbenchContextHeader, workbenchPlanSection, WORKBENCH_MCP_TOOLS, type WorkbenchContextSource } from '@/features/agentic/workbench-context'

/**
 * Contexto da mesa para o agente (OPE-178): a versão do plano que rege cada etapa, o cabeçalho de todo
 * turno (com as ferramentas do MCP `opex_mesa`) e o pacote completo usado quando o MCP não registra.
 */

const plans = [
  { version: 1, text: '# Plano v1', feedback: null, createdAt: new Date('2026-11-22T02:53:00Z') },
  { version: 2, text: '# Plano v2\nFormulário completo', feedback: 'Mostrar todas as abas', createdAt: new Date('2026-11-22T13:30:00Z') },
  { version: 3, text: '# Plano v3 (rascunho)', feedback: 'Fork 1', createdAt: new Date('2026-11-22T13:46:00Z') },
]

const source = (patch: Partial<WorkbenchContextSource> = {}): WorkbenchContextSource => ({
  code: 'ZC-17',
  title: 'Cadastros na empresa',
  stage: 'implementing',
  branch: 'feat/zc-17',
  worktreePath: '/home/u/zc/worktrees/zc-17',
  plans,
  approvedPlanVersion: 2,
  forkNotes: [],
  pr: null,
  previewUrl: null,
  ...patch,
})

describe('governingPlan', () => {
  it('nas etapas de execução vale a versão aprovada, mesmo com versões mais novas', () => {
    for (const stage of ['implementing', 'building', 'opening_pr', 'fixing_ci', 'resolving_conflicts', 'preview'] as const) {
      expect(governingPlan(plans, 2, stage)).toMatchObject({ plan: { version: 2 }, approved: true, latestVersion: 3 })
    }
  })

  it('no planejamento e na revisão do plano vale a mais recente', () => {
    expect(governingPlan(plans, 2, 'planning')).toMatchObject({ plan: { version: 3 }, approved: false })
    expect(governingPlan(plans, 3, 'plan_review')).toMatchObject({ plan: { version: 3 }, approved: true })
  })

  it('sem aprovação gravada (mesa antiga) ou com a versão ausente, cai na mais recente; sem plano, null', () => {
    expect(governingPlan(plans, null, 'implementing')).toMatchObject({ plan: { version: 3 }, approved: false })
    expect(governingPlan(plans, 9, 'implementing')).toMatchObject({ plan: { version: 3 } })
    expect(governingPlan([], 1, 'implementing')).toBeNull()
  })
})

describe('workbenchContextHeader', () => {
  it('com o MCP: lista as ferramentas e, na implementação, manda ler o plano aprovado antes de agir', () => {
    const header = workbenchContextHeader(source({ attachments: { workbench: 2, task: 1 } }), { mcp: true, requirePlan: true })
    expect(header).toContain('## Mesa do Opex')
    expect(header).toContain('Tarefa ZC-17: Cadastros na empresa')
    expect(header).toContain('versão 2 (aprovada) (a mais recente é a v3)')
    expect(header).toContain('Anexos: 2 da mesa e 1 da página da tarefa')
    for (const tool of WORKBENCH_MCP_TOOLS) expect(header).toContain(`opex_mesa_${tool}`)
    expect(header).toContain('ANTES de agir, leia o plano com `opex_mesa_get_plan` (versão 2)')
    // O texto do plano NÃO vai inline quando o MCP está disponível.
    expect(header).not.toContain('Formulário completo')
  })

  it('sessão nova: avisa que o histórico não está na sessão e exige a leitura do plano', () => {
    const header = workbenchContextHeader(source({ stage: 'opening_pr' }), { mcp: true, newSession: true })
    expect(header).toContain('sessão NOVA do OpenCode')
    expect(header).toContain('ANTES de agir, leia o plano')
  })

  it('turno comum: leitura do plano só se ele não estiver no histórico; PR, prévia e fork aparecem quando existem', () => {
    const header = workbenchContextHeader(source({ stage: 'pr_open', pr: { number: 43, url: 'https://github.com/org/zc/pull/43', state: 'open' }, previewUrl: 'http://localhost:4010', fork: { number: 1 }, forkNotes: [{ number: 1, summary: 'x' }] }), { mcp: true })
    expect(header).toContain('Se o plano v2 não estiver no histórico desta conversa')
    expect(header).toContain('Pull Request #43')
    expect(header).toContain('Prévia: http://localhost:4010')
    expect(header).toContain('· Fork 1')
    expect(header).toContain('Forks integrados à mesa: Fork 1')
  })

  it('sem o MCP, não anuncia ferramentas que não existem', () => {
    const header = workbenchContextHeader(source(), { mcp: false, requirePlan: true })
    expect(header).not.toContain('opex_mesa_')
  })
})

describe('workbenchContextFallback', () => {
  it('leva o texto do plano que rege a etapa, o histórico com os pedidos, os forks, a tarefa e os anexos com link', () => {
    const text = workbenchContextFallback(source({ forkNotes: [{ number: 1, summary: 'Descoberta do fork' }] }), {
      taskMarkdown: '# ZC-17\nDescrição',
      attachments: [
        { name: 'print.png', mediaType: 'image/png', size: 2048, origin: 'Mesa', url: 'https://s3/print.png?sig' },
        { name: 'spec.pdf', mediaType: 'application/pdf', size: 4096, origin: 'Tarefa', url: null, reason: 'o Storage S3 não respondeu' },
      ],
      downloadDir: '/tmp/opex-anexos/ZC-17',
    })
    expect(text).toContain('Plano da mesa: versão 2 (aprovada)')
    expect(text).toContain('Formulário completo')
    expect(text).not.toContain('Plano v3 (rascunho)')
    expect(text).toContain('- v2: pedido — Mostrar todas as abas')
    expect(text).toContain('Descoberta do fork')
    expect(text).toContain('Descrição')
    expect(text).toContain('link (válido por 24 h): https://s3/print.png?sig')
    expect(text).toContain('o arquivo existe, mas não foi possível gerar o link: o Storage S3 não respondeu')
    expect(text).toContain('/tmp/opex-anexos/ZC-17')
  })
})

describe('workbenchPlanSection', () => {
  it('texto completo da versão que rege a etapa (vai no prompt da implementação mesmo com o MCP)', () => {
    const section = workbenchPlanSection(source())
    expect(section.startsWith('## Plano da mesa: versão 2 (aprovada)')).toBe(true)
    expect(section).toContain('Formulário completo')
    expect(workbenchPlanSection(source({ plans: [] }))).toBe('')
  })
})

describe('withWorkbenchContext', () => {
  it('mantém o pedido da etapa no início e anexa o contexto ao final; sem contexto, o texto não muda', () => {
    expect(withWorkbenchContext('Implemente', { header: '## Mesa do Opex', fallback: null })).toBe('Implemente\n\n---\n\n## Mesa do Opex')
    expect(withWorkbenchContext('Implemente', null)).toBe('Implemente')
    expect(withWorkbenchContext('Implemente', { header: '', fallback: null })).toBe('Implemente')
  })
})

import { describe, expect, it } from 'vitest'
import {
  columnForIssueState,
  DEFAULT_PRIORITY_RULES,
  DEFAULT_TYPE_RULES,
  htmlBaseOf,
  issueStateForColumn,
  mapPriority,
  mapTaskType,
  mentionsIssue,
  normalizeRepo,
  projectNameFromRepo,
  reverseLabels,
  siglaFromRepo,
  taskDescriptionFromIssue,
  toIssueLite,
} from '@/features/github/logic'

const rawIssue = (overrides: Record<string, unknown> = {}) => ({
  number: 12,
  title: 'Bug no login',
  body: 'Corpo',
  html_url: 'https://github.com/sipal/app/issues/12',
  state: 'open',
  user: { login: 'Fernand-Sipal', avatar_url: 'https://avatars/x' },
  labels: [{ name: 'bug' }, 'P1'],
  assignees: [{ login: 'Ana' }],
  milestone: { title: 'Sprint 3' },
  type: { name: 'Bug' },
  ...overrides,
})

describe('leitura da issue', () => {
  it('normaliza login/labels/assignees e marca PR', () => {
    const issue = toIssueLite(rawIssue())!
    expect(issue).toMatchObject({ number: 12, author: { login: 'fernand-sipal' }, labels: ['bug', 'P1'], assignees: ['ana'], milestone: 'Sprint 3', type: 'Bug', isPullRequest: false })
    expect(toIssueLite(rawIssue({ pull_request: { url: 'x' } }))!.isPullRequest).toBe(true)
    expect(toIssueLite({ title: 'sem número' })).toBeNull()
  })

  it('repositório: normaliza nome/URL e deriva nome e sigla do projeto', () => {
    expect(normalizeRepo('https://github.com/Sipal/App.git')).toBe('sipal/app')
    expect(normalizeRepo('inválido')).toBeNull()
    expect(projectNameFromRepo('sipal/app')).toBe('app')
    expect(siglaFromRepo('sipal/sap-painel-lancamento')).toBe('SPL')
    expect(siglaFromRepo('sipal/app')).toBe('APP')
    expect(htmlBaseOf('https://api.github.com/')).toBe('https://github.com')
    expect(htmlBaseOf('https://ghe.sipal.com.br/api/v3')).toBe('https://ghe.sipal.com.br')
  })
})

describe('mapeamento issue → tarefa', () => {
  it('tipo: Issue Type vence label; sem regra, sem tipo', () => {
    expect(mapTaskType({ type: 'Feature', labels: ['bug'] }, DEFAULT_TYPE_RULES)).toEqual({ value: 'feature', origin: 'Issue Type "Feature"' })
    expect(mapTaskType({ type: null, labels: ['Documentation'] }, DEFAULT_TYPE_RULES)).toEqual({ value: 'analysis', origin: 'label "Documentation"' })
    expect(mapTaskType({ type: 'Épico', labels: ['outra'] }, DEFAULT_TYPE_RULES)).toEqual({ value: null, origin: 'sem correspondência' })
  })

  it('prioridade: primeira regra que casar; senão o padrão', () => {
    expect(mapPriority({ labels: ['p1', 'P0'] }, DEFAULT_PRIORITY_RULES).value).toBe('urgent')
    expect(mapPriority({ labels: [] }, DEFAULT_PRIORITY_RULES)).toEqual({ value: 'medium', origin: 'padrão' })
    expect(mapPriority({ labels: [] }, DEFAULT_PRIORITY_RULES, 'low').value).toBe('low')
  })

  it('descrição da tarefa é o corpo da issue verbatim (sem rodapé, para não ecoar no push)', () => {
    expect(taskDescriptionFromIssue('Passos\n\nMais')).toBe('Passos\n\nMais')
    expect(taskDescriptionFromIssue(null)).toBe('')
    expect(taskDescriptionFromIssue('   ')).toBe('')
  })
})

describe('mapeamento reverso (tarefa → issue)', () => {
  it('tipo e prioridade viram labels pelas regras do mapeamento', () => {
    expect(reverseLabels('bugfix', 'urgent', { typeRules: DEFAULT_TYPE_RULES, priorityRules: DEFAULT_PRIORITY_RULES })).toEqual(['bug', 'urgent'])
    expect(reverseLabels('feature', 'medium', { typeRules: DEFAULT_TYPE_RULES, priorityRules: DEFAULT_PRIORITY_RULES })).toEqual(['enhancement', 'P2'])
    expect(reverseLabels(null, null, { typeRules: DEFAULT_TYPE_RULES, priorityRules: DEFAULT_PRIORITY_RULES })).toEqual([])
  })
})

describe('coluna ↔ estado da issue', () => {
  it('coluna de conclusão fecha a issue; sair dela reabre', () => {
    expect(issueStateForColumn('done', 'done')).toBe('closed')
    expect(issueStateForColumn('doing', 'done')).toBe('open')
    expect(issueStateForColumn('done', null)).toBe('open')
  })

  it('estado da issue define a coluna de destino', () => {
    expect(columnForIssueState('closed', 'done', 'todo', 'doing')).toBe('done')
    expect(columnForIssueState('closed', 'done', 'todo', 'done')).toBeNull()
    expect(columnForIssueState('open', 'done', 'todo', 'done')).toBe('todo')
    expect(columnForIssueState('open', 'done', 'todo', 'doing')).toBeNull()
    expect(columnForIssueState('closed', null, 'todo', 'doing')).toBeNull()
  })
})

describe('menção da issue numa tarefa', () => {
  it('#999 casa sozinho, mas não #9990 nem âncoras de URL', () => {
    expect(mentionsIssue('Corrige (#999) no login', 'sipal/app', 999)).toBe(true)
    expect(mentionsIssue('Ver #9990', 'sipal/app', 999)).toBe(false)
    expect(mentionsIssue('https://site.com/page#999', 'sipal/app', 999)).toBe(false)
    expect(mentionsIssue('ref sipal/app#999', 'sipal/app', 999)).toBe(true)
    expect(mentionsIssue('Issue: https://github.com/Sipal/App/issues/999', 'sipal/app', 999)).toBe(true)
    expect(mentionsIssue('https://github.com/sipal/app/issues/9991', 'sipal/app', 999)).toBe(false)
    expect(mentionsIssue(null, 'sipal/app', 1)).toBe(false)
  })

  it('ignora âncoras de sumário Markdown (#9-titulo)', () => {
    const sumario = '- [9. Esforço relativo](#9-esforço-relativo)\n- [3. Dependências](#3-dependencias-externas)\n[Seção](#9)'
    expect(mentionsIssue(sumario, 'sipal/app', 9)).toBe(false)
    expect(mentionsIssue(sumario, 'sipal/app', 3)).toBe(false)
    expect(mentionsIssue('Corrige #9.', 'sipal/app', 9)).toBe(true)
    expect(mentionsIssue('Fecha #9, #10', 'sipal/app', 9)).toBe(true)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  graphql: vi.fn(async (_query: string, _variables?: Record<string, unknown>, _options?: unknown): Promise<unknown> => ({})),
  githubRequest: vi.fn(async (_path: string, _options?: unknown): Promise<unknown> => ({})),
  githubPaginate: vi.fn(async (_path: string, _options?: unknown): Promise<unknown[]> => []),
  listTasks: vi.fn(async (): Promise<unknown> => ({ tasks: [] })),
  findIssueTask: vi.fn(async (): Promise<{ id: string } | null> => null),
  getTask: vi.fn(async (_id: string): Promise<unknown> => ({})),
  active: new Set<string>(),
  recordAudit: vi.fn(async () => {}),
}))

vi.mock('ai', () => ({ dynamicTool: (def: unknown) => def }))
vi.mock('@/features/github/client', async (original) => ({
  ...(await original<object>()),
  githubGraphql: mocks.graphql,
  githubRequest: mocks.githubRequest,
  githubPaginate: mocks.githubPaginate,
  githubBaseUrl: async () => 'https://api.github.com',
}))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => ({ token: 'tok', apiUrl: 'https://api.github.com' }) }))
vi.mock('@/features/agentic/server/centrals', () => ({ listCentrals: async () => [{ projectName: 'CRM', repo: 'Sipal/CRM', config: { git: { baseBranch: 'dev', prTargetBranch: 'main' } } }] }))
vi.mock('@/features/tasks/server/service', async (original) => ({ ...(await original<object>()), listTasks: mocks.listTasks, getTask: mocks.getTask }))
vi.mock('@/features/tasks/server/columns', () => ({ getBoard: async () => ({ columns: [], layout: [] }) }))
// Situação das tarefas sem banco: coluna = id, concluída = coluna "done", mesa aberta = `mocks.active`.
vi.mock('@/features/opex-agent/server/issue-graph', async (original) => ({
  ...(await original<object>()),
  findIssueTask: mocks.findIssueTask,
  loadTaskSituation: async () => ({
    columnName: (task: { columnId: string }) => task.columnId,
    concluded: (task: { columnId: string }) => task.columnId === 'done',
    active: (task: { id: string }) => mocks.active.has(task.id),
  }),
}))
vi.mock('@/lib/db', async (original) => ({ ...(await original<object>()), recordAudit: mocks.recordAudit }))

import { graphqlUrlOf } from '@/features/github/client'
import { prsOf, toIssueNode, type RawNode } from '@/features/opex-agent/issue-nodes'
import {
  compareRank,
  deliveryOf,
  isResolved,
  normalizeTitle,
  prMatchesIssue,
  similarPairs,
  titleSimilarity,
  unlocksOf,
  verdictOf,
  type IssuePr,
} from '@/features/opex-agent/issue-readiness'
import { resetRepoCaches } from '@/features/opex-agent/server/repo-snapshot'
import { findOpexTool, needsConfirmation } from '@/features/opex-agent/server/tools/registry'

const context = { sessionId: 's1', actorId: 'local' }
const REPO = 'sipal/crm'

const pr = (over: Partial<IssuePr> = {}): IssuePr => ({ number: 100, title: 'Outra coisa', url: 'https://github.com/sipal/crm/pull/100', state: 'merged', mergedAt: '2026-10-01T00:00:00Z', baseRef: 'dev', closes: false, ...over })

describe('entrega de uma issue (puro)', () => {
  const issue = { state: 'open' as const, stateReason: null, title: '[Feature] Carteira — Minha carteira do vendedor' }
  const dev = new Set(['dev', 'main'])

  it('normaliza títulos sem acento nem pontuação', () => {
    expect(normalizeTitle('[Feature] Carteira — Minha Ação!')).toBe('feature carteira minha acao')
  })

  it('PR só liga à issue se a fecha, tem o código da tarefa ou o título da issue (menção não basta)', () => {
    expect(prMatchesIssue(pr({ closes: true }), issue)).toBe('closing')
    expect(prMatchesIssue(pr({ title: 'Algo (OPX-786)' }), issue, 'OPX-786')).toBe('task_code')
    expect(prMatchesIssue(pr({ title: '[Feature] Carteira — Minha carteira do vendedor (OPX-786)' }), issue)).toBe('title')
    expect(prMatchesIssue(pr({ title: '[Feature] Visualização do Bolsão (OPX-778)' }), issue)).toBeNull()
  })

  it('fechada: concluída = done, não planejada/duplicada = cancelled', () => {
    expect(deliveryOf({ ...issue, state: 'closed', stateReason: 'completed' }, null, dev).state).toBe('done')
    expect(deliveryOf({ ...issue, state: 'closed', stateReason: 'not_planned' }, null, dev).state).toBe('cancelled')
    expect(deliveryOf({ ...issue, state: 'closed', stateReason: 'duplicate' }, null, dev).state).toBe('cancelled')
  })

  it('tarefa na coluna de conclusão do projeto = done, mesmo com a issue aberta', () => {
    const result = deliveryOf(issue, { id: 't', code: 'OPX-1', column: 'Concluído', concluded: true, active: false }, dev)
    expect(result).toMatchObject({ state: 'done', task: { code: 'OPX-1', column: 'Concluído' } })
  })

  it('PR forte mesclado numa branch de entrega = merged (o caso da issue aberta com código no dev)', () => {
    const task = { id: 't', code: 'OPX-786', column: 'Em andamento', concluded: false, active: true }
    const result = deliveryOf({ ...issue, prs: [pr({ number: 105, title: 'Entrega (OPX-786)' })] }, task, dev)
    expect(result.state).toBe('merged')
    expect(result.pr?.number).toBe(105)
    expect(result.evidence).toContain('ainda em Em andamento')
  })

  it('PR mesclado fora das branches de entrega não conta; PR aberto = in_progress', () => {
    expect(deliveryOf({ ...issue, prs: [pr({ closes: true, baseRef: 'feature/x' })] }, null, dev).state).toBe('pending')
    expect(deliveryOf({ ...issue, prs: [pr({ closes: true, baseRef: 'feature/x' })] }, null, null).state).toBe('merged')
    expect(deliveryOf({ ...issue, prs: [pr({ closes: true, state: 'open', mergedAt: null })] }, null, dev).state).toBe('in_progress')
  })

  it('tarefa com mesa aberta sem PR = in_progress; sem mesa nem PR = pending', () => {
    expect(deliveryOf(issue, { id: 't', code: 'OPX-1', column: 'A fazer', concluded: false, active: true }, dev).state).toBe('in_progress')
    expect(deliveryOf(issue, { id: 't', code: 'OPX-1', column: 'A fazer', concluded: false, active: false }, dev)).toMatchObject({ state: 'pending', evidence: 'Tarefa OPX-1 em A fazer, sem PR mesclado' })
  })

  it('resolvida conforme o critério: merged só libera no modo "merged"; cancelada libera sempre', () => {
    expect(isResolved('merged', 'merged')).toBe(true)
    expect(isResolved('merged', 'done')).toBe(false)
    expect(isResolved('cancelled', 'done')).toBe(true)
    expect(isResolved('in_progress', 'merged')).toBe(false)
  })
})

describe('veredito, desbloqueios e ranking (puro)', () => {
  it('veredito pelas bloqueadoras', () => {
    expect(verdictOf('pending', false, [], 'merged')).toBe('ready')
    expect(verdictOf('pending', false, ['done', 'merged'], 'merged')).toBe('ready')
    expect(verdictOf('pending', false, ['done', 'merged'], 'done')).toBe('partial')
    expect(verdictOf('pending', false, ['in_progress'], 'merged')).toBe('partial')
    expect(verdictOf('pending', false, ['unknown', 'in_progress'], 'merged')).toBe('unknown')
    expect(verdictOf('pending', false, ['pending', 'unknown'], 'merged')).toBe('blocked')
    expect(verdictOf('merged', false, ['pending'], 'merged')).toBe('delivered')
    expect(verdictOf('pending', true, [], 'merged')).toBe('epic')
  })

  it('desbloqueios diretos e indiretos, sem repetir e sem laço', () => {
    const edges: Record<string, string[]> = { a: ['b', 'c', 'x'], b: ['d'], c: ['d', 'a'], d: ['e'], x: ['y'] }
    const result = unlocksOf('a', (key) => edges[key] ?? [], (key) => key === 'x')
    expect(result.direct).toEqual(['b', 'c'])
    expect(result.total.sort()).toEqual(['b', 'c', 'd', 'e'])
  })

  it('ordena por veredito, depois quanto destrava, prioridade e estimativa', () => {
    const base = { key: '', unlocksDirect: 0, priority: 'medium' as const, estimateHours: null, number: 1 }
    const items = [
      { ...base, key: 'blocked', verdict: 'blocked' as const, unlocksTotal: 9, number: 1 },
      { ...base, key: 'ready-0', verdict: 'ready' as const, unlocksTotal: 0, number: 2 },
      { ...base, key: 'ready-6', verdict: 'ready' as const, unlocksTotal: 6, number: 3 },
      { ...base, key: 'ready-0-urgent', verdict: 'ready' as const, unlocksTotal: 0, priority: 'urgent' as const, number: 4 },
      { ...base, key: 'partial', verdict: 'partial' as const, unlocksTotal: 3, number: 5 },
    ]
    expect(items.sort(compareRank).map((item) => item.key)).toEqual(['ready-6', 'ready-0-urgent', 'ready-0', 'partial', 'blocked'])
  })

  it('títulos parecidos (possíveis duplicadas)', () => {
    expect(titleSimilarity('[Feature] Agente Garimpeiro', 'Agente garimpeiro')).toBe(1)
    expect(titleSimilarity('[Feature] Agente Garimpeiro', '[Feature] Visitas e check-in')).toBe(0)
    const pairs = similarPairs([
      { key: '1', title: '[Feature] Agente Garimpeiro' },
      { key: '2', title: 'Agente garimpeiro' },
      { key: '3', title: 'Visitas e check-in' },
    ])
    expect(pairs.map((pair) => [pair.a.key, pair.b.key])).toEqual([['1', '2']])
  })
})

// ---------------------------------------------------------------------------
// Respostas do GraphQL
// ---------------------------------------------------------------------------

type Lite = { number: number; state?: string; stateReason?: string | null; assignees?: string[]; title?: string; repo?: string }
const lite = (item: Lite) => ({
  number: item.number,
  title: item.title ?? `Issue ${item.number}`,
  url: `https://github.com/${item.repo ?? 'Sipal/CRM'}/issues/${item.number}`,
  state: item.state ?? 'OPEN',
  stateReason: item.stateReason ?? null,
  repository: { nameWithOwner: item.repo ?? 'Sipal/CRM' },
  ...(item.assignees ? { assignees: { nodes: item.assignees.map((login) => ({ login })) } } : {}),
})

interface Fixture extends Lite {
  blockedBy?: Lite[]
  blocking?: Lite[]
  parent?: number
  subIssues?: number
  prs?: { number: number; title: string; state?: string; baseRefName?: string; closes?: boolean; repo?: string }[]
}

function rawNode(item: Fixture): RawNode {
  const prNode = (p: NonNullable<Fixture['prs']>[number]) => ({
    number: p.number,
    title: p.title,
    url: `https://github.com/Sipal/CRM/pull/${p.number}`,
    state: p.state ?? 'MERGED',
    mergedAt: (p.state ?? 'MERGED') === 'MERGED' ? '2026-10-20T00:00:00Z' : null,
    baseRefName: p.baseRefName ?? 'dev',
    repository: { nameWithOwner: p.repo ?? 'Sipal/CRM' },
  })
  return {
    ...lite(item),
    assignees: { nodes: (item.assignees ?? []).map((login) => ({ login })) },
    closedAt: null,
    createdAt: null,
    updatedAt: null,
    labels: { nodes: [] },
    issueType: null,
    milestone: null,
    parent: item.parent ? lite({ number: item.parent, title: 'Épico' }) : null,
    subIssuesSummary: { total: item.subIssues ?? 0, completed: 0 },
    blockedBy: { nodes: (item.blockedBy ?? []).map(lite) },
    blocking: { nodes: (item.blocking ?? []).map(lite) },
    closedByPullRequestsReferences: { nodes: (item.prs ?? []).filter((p) => p.closes).map(prNode) },
    timelineItems: { nodes: [null, { source: {} }, ...(item.prs ?? []).filter((p) => !p.closes).map((p) => ({ source: prNode(p) }))] },
  } as RawNode
}

/** Simula o GraphQL: devolve as issues pedidas (aliases `iN`) a partir das fixtures. */
function serveGraph(fixtures: Fixture[]) {
  const byNumber = new Map(fixtures.map((item) => [item.number, rawNode(item)]))
  mocks.graphql.mockImplementation(async (query: string) => {
    const repository: Record<string, unknown> = { defaultBranchRef: { name: 'main' } }
    for (const match of query.matchAll(/i(\d+): issue\(number: (\d+)\)/g)) repository[`i${match[1]}`] = byNumber.get(Number(match[2])) ?? null
    return { repository }
  })
}

describe('conversão do GraphQL', () => {
  it('URL do GraphQL a partir da API REST (github.com e GHES)', () => {
    expect(graphqlUrlOf('https://api.github.com')).toBe('https://api.github.com/graphql')
    expect(graphqlUrlOf('https://ghe.empresa.com/api/v3/')).toBe('https://ghe.empresa.com/api/graphql')
  })

  it('normaliza repositório/estado e junta os PRs (fecha a issue + citados no mesmo repositório)', () => {
    const node = toIssueNode(rawNode({ number: 49, blockedBy: [{ number: 5, state: 'CLOSED', stateReason: 'COMPLETED' }], parent: 118, prs: [{ number: 105, title: 'X' }, { number: 7, title: 'Fecha', closes: true }, { number: 9, title: 'Outro repo', repo: 'Sipal/Site' }] }), 'sipal/crm')
    expect(node).toMatchObject({ repo: 'sipal/crm', state: 'open', parent: { number: 118 }, blockedBy: [{ repo: 'sipal/crm', number: 5, state: 'closed', stateReason: 'completed' }] })
    expect(node.prs.map((item) => [item.number, item.closes, item.state])).toEqual([
      [7, true, 'merged'],
      [105, false, 'merged'],
    ])
    expect(prsOf({ closedByPullRequestsReferences: { nodes: [] }, timelineItems: { nodes: [] } }, 'sipal/crm')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------

type Run = (input: unknown) => Promise<Record<string, unknown>>
const run = (name: string): Run => {
  const tool = findOpexTool(name)
  if (!tool) throw new Error(`ferramenta ${name} não registrada`)
  return async (input) => (await tool.execute(tool.input.parse(input), context)) as Record<string, unknown>
}

const task = (over: Record<string, unknown>) => ({
  id: 'x',
  code: 'OPX-0',
  columnId: 'todo',
  order: 0,
  title: 'Tarefa',
  summary: null,
  tags: [],
  taskType: 'feature',
  priority: 'medium',
  archived: false,
  project: { id: 'p1', name: 'CRM', repo: REPO, sigla: 'CRM' },
  createdAt: null,
  updatedAt: null,
  estimate: null,
  agenticFlow: null,
  ...over,
})
const linked = (number: number, title: string, over: Record<string, unknown> = {}) =>
  task({ id: `t${number}`, code: `CRM-${number}`, title, issue: { url: '', repo: REPO, number, state: 'open', notice: null }, ...over })

/** O cenário real do CRM: #49 com código no dev, #86/#87 sem dono, #89 destrava quase tudo. */
const SCENARIO: Fixture[] = [
  { number: 49, title: '[Feature] Carteira — Minha carteira do vendedor', blocking: [{ number: 89 }, { number: 88 }, { number: 87 }], prs: [{ number: 105, title: '[Feature] Carteira — Minha carteira do vendedor (OPX-786)' }] },
  { number: 86, title: 'Dono do cliente', blocking: [{ number: 88 }] },
  { number: 87, title: 'Importância do cliente', blockedBy: [{ number: 49 }], blocking: [{ number: 51 }, { number: 90 }], prs: [{ number: 105, title: 'Minha carteira (OPX-786)' }] },
  { number: 88, title: 'Movimentação da carteira', assignees: ['fernando'], blockedBy: [{ number: 86 }, { number: 49 }], blocking: [{ number: 90 }] },
  { number: 89, title: 'Tarefas e Agenda', assignees: ['fernando'], blockedBy: [{ number: 49 }], blocking: [{ number: 90 }, { number: 51 }], parent: 118 },
  { number: 90, title: 'Meu dia', assignees: ['fernando'], blockedBy: [{ number: 89 }, { number: 87 }, { number: 88 }], blocking: [{ number: 114 }] },
  { number: 51, title: 'Visitas', blockedBy: [{ number: 89 }, { number: 87 }], blocking: [{ number: 114 }] },
  { number: 114, title: 'Equipe em campo', blockedBy: [{ number: 51 }, { number: 90 }] },
  { number: 45, title: '[Feature] Agente Garimpeiro', assignees: ['fernando'], blockedBy: [{ number: 5, state: 'CLOSED', stateReason: 'COMPLETED' }] },
  { number: 15, title: 'Agente garimpeiro' },
  { number: 76, title: '[Bug] Formulários — padrão único para mostrar erros', assignees: ['fernando'], prs: [{ number: 109, title: '[Bug] Formulários — padrão único para mostrar erros (OPX-798)' }] },
  { number: 118, title: 'Épico', subIssues: 15 },
]

beforeEach(() => {
  vi.clearAllMocks()
  resetRepoCaches()
  serveGraph(SCENARIO)
  mocks.active = new Set(['t49'])
  mocks.listTasks.mockResolvedValue({
    tasks: [
      task({ id: 't49', code: 'OPX-786', title: 'Minha carteira', columnId: 'doing', issue: { url: '', repo: REPO, number: 49, state: 'open', notice: null } }),
      linked(89, 'Tarefas e Agenda'),
      linked(88, 'Movimentação da carteira', { priority: 'high' }),
      linked(90, 'Meu dia'),
      linked(45, '[Feature] Agente Garimpeiro'),
      linked(15, 'Agente garimpeiro'),
      linked(76, '[Bug] Formulários — padrão único para mostrar erros'),
      task({ id: 't-sem', code: 'OPX-900', title: 'Sem issue', columnId: 'todo' }),
      task({ id: 't-outro', code: 'OUT-901', title: 'Outro projeto', project: { id: 'p2', name: 'Outro', repo: 'sipal/outro', sigla: 'OUT' }, issue: { url: '', repo: REPO, number: 86, state: 'open', notice: null } }),
      task({ id: 't-val', code: 'OPX-902', title: 'Concluída', columnId: 'done', issue: { url: '', repo: REPO, number: 300, state: 'open', notice: null } }),
    ],
  })
})

describe('rank_ready_tasks', () => {
  it('ranqueia as tarefas abertas do projeto: #89 pronta e destravando mais vem primeiro', async () => {
    const result = await run('rank_ready_tasks')({ projectIds: ['p1'] })
    const ranking = result.ranking as { code: string; verdict: string; unlocks: { direct: string[]; total: number }; waitingOn: { issue: string; delivery: string }[]; resolvedBlockers: string[] }[]
    expect(ranking.map((row) => [row.code, row.verdict])).toEqual([
      ['CRM-89', 'ready'],
      ['CRM-15', 'ready'],
      ['CRM-45', 'ready'],
      ['CRM-88', 'blocked'],
      ['CRM-90', 'blocked'],
      ['OPX-786', 'delivered'],
      ['CRM-76', 'delivered'],
    ])
    expect(ranking[0]!.unlocks).toMatchObject({ direct: ['#90', '#51'], total: 3 })
    expect(ranking[0]!.resolvedBlockers).toEqual(['#49 (merged)'])
    expect(ranking.find((row) => row.code === 'CRM-88')!.waitingOn.map((item) => [item.issue, item.delivery])).toEqual([['#86', 'pending']])
    expect(result.withoutIssue).toEqual([{ code: 'OPX-900', title: 'Sem issue', column: 'todo' }])
  })

  it('alertas: gargalo sem dono nem tarefa, entregue sem fechar, tarefa entregue e títulos parecidos', async () => {
    const { alerts } = (await run('rank_ready_tasks')({ projectIds: ['p1'] })) as { alerts: Record<string, { [key: string]: unknown }[]> }
    expect(alerts.unassignedBottlenecks!.map((item) => [item.issue, item.blocks])).toEqual([['#87', ['CRM-90']]])
    expect(alerts.deliveredNotClosed!.map((item) => [item.issue, item.task])).toEqual(
      expect.arrayContaining([
        ['#49', 'OPX-786'],
        ['#76', 'CRM-76'],
      ]),
    )
    expect(alerts.deliveredItems!.map((item) => item.code)).toEqual(['OPX-786', 'CRM-76'])
    expect(alerts.similarTitles!.map((item) => [(item.a as { code: string }).code, (item.b as { code: string }).code])).toEqual([['CRM-45', 'CRM-15']])
  })

  it('modo "done": código só mesclado não libera (parcial) nem conta como entregue', async () => {
    const result = await run('rank_ready_tasks')({ projectIds: ['p1'], deliveredAt: 'done' })
    const ranking = result.ranking as { code: string; verdict: string }[]
    expect(ranking.find((row) => row.code === 'CRM-89')?.verdict).toBe('partial')
    expect(ranking.find((row) => row.code === 'OPX-786')?.verdict).toBe('ready')
  })

  it('filtra por épico, por projeto e ignora as concluídas', async () => {
    const epic = await run('rank_ready_tasks')({ epic: 118 })
    expect((epic.ranking as { code: string }[]).map((row) => row.code)).toEqual(['CRM-89'])
    const other = await run('rank_ready_tasks')({ projectIds: ['p2'] })
    expect((other.ranking as { code: string }[]).map((row) => row.code)).toEqual(['OUT-901'])
    const all = await run('rank_ready_tasks')({ limit: 50 })
    expect((all.ranking as { code: string }[]).map((row) => row.code)).not.toContain('OPX-902')
  })

  it('carrega o grafo em lote (uma consulta por nível)', async () => {
    await run('rank_ready_tasks')({ projectIds: ['p1'] })
    const queries = mocks.graphql.mock.calls.map(([query]) => [...String(query).matchAll(/i(\d+): issue/g)].length)
    expect(queries.length).toBeLessThanOrEqual(4)
    expect(queries[0]).toBe(7)
  })
})

describe('get_issue_dependencies e get_issue', () => {
  it('árvore de bloqueadoras com a entrega e o veredito', async () => {
    const result = await run('get_issue_dependencies')({ repo: 'Sipal/CRM', number: 90 })
    expect(result).toMatchObject({ issue: '#90', verdict: 'blocked', waitingOn: ['#89', '#87', '#88'] })
    const tree = result.blockedBy as { issue: string; delivery: string; blockedBy?: { issue: string; delivery: string }[] }[]
    expect(tree.find((item) => item.issue === '#89')).toMatchObject({ delivery: 'pending', blockedBy: [{ issue: '#49', delivery: 'merged' }] })
    expect(tree.find((item) => item.issue === '#88')?.blockedBy?.map((item) => item.issue)).toEqual(['#86', '#49'])
  })

  it('marca ciclo sem entrar em laço', async () => {
    serveGraph([
      { number: 1, blockedBy: [{ number: 2 }] },
      { number: 2, blockedBy: [{ number: 1 }] },
    ])
    const result = await run('get_issue_dependencies')({ repo: 'Sipal/CRM', number: 1, depth: 5 })
    expect(result.blockedBy).toMatchObject([{ issue: '#2', blockedBy: [{ issue: '#1', cycle: true }] }])
  })

  it('get_issue junta corpo, comentários, tarefa vinculada e dependências', async () => {
    mocks.githubRequest.mockResolvedValue({ number: 89, body: 'Corpo', user: { login: 'eros' } })
    mocks.githubPaginate.mockResolvedValue([{ user: { login: 'ana' }, created_at: '2026-10-20', body: 'Ok' }])
    const result = await run('get_issue')({ repo: 'Sipal/CRM', number: 89 })
    expect(result).toMatchObject({ number: 89, body: 'Corpo', author: 'eros', epic: { issue: '#118' }, task: { code: 'CRM-89', concluded: false, active: false }, blockedBy: [{ issue: '#49', delivery: 'merged', task: 'OPX-786' }] })
    expect(result.comments).toEqual([{ author: 'ana', createdAt: '2026-10-20', body: 'Ok' }])
  })

  it('get_issue recusa pull request', async () => {
    mocks.githubRequest.mockResolvedValue({ number: 105, pull_request: {} })
    await expect(run('get_issue')({ repo: 'Sipal/CRM', number: 89 })).rejects.toThrow('pull request')
  })
})

describe('list_issues', () => {
  it('REST sem PRs, com contagens de dependências', async () => {
    mocks.githubPaginate.mockResolvedValue([
      { number: 1, title: 'A', state: 'open', html_url: 'u1', updated_at: 'd', comments: 0, issue_dependencies_summary: { blocked_by: 2, blocking: 1 }, sub_issues_summary: { total: 0 } },
      { number: 2, title: 'PR', state: 'open', html_url: 'u2', updated_at: 'd', comments: 0, pull_request: {} },
    ])
    const result = await run('list_issues')({ repo: 'Sipal/CRM', assignee: 'none', labels: ['bug'] })
    expect(String(mocks.githubPaginate.mock.calls[0]![0])).toContain('assignee=none&labels=bug')
    expect(result.issues).toMatchObject([{ number: 1, blockedBy: 2, blocking: 1 }])
  })

  it('busca por texto usa a busca do GitHub', async () => {
    mocks.githubRequest.mockResolvedValue({ total_count: 1, items: [{ number: 45, title: 'Agente', state: 'open', html_url: 'u', updated_at: 'd', comments: 0 }] })
    await run('list_issues')({ repo: 'Sipal/CRM', query: 'garimpeiro', milestone: 'Sprint 3' })
    const url = decodeURIComponent(String(mocks.githubRequest.mock.calls[0]![0])).replace(/\+/g, ' ')
    expect(url).toContain('garimpeiro repo:sipal/crm is:issue is:open milestone:"Sprint 3"')
  })

  it('sub-issues do épico pelo GraphQL, com filtros', async () => {
    mocks.graphql.mockResolvedValue({
      repository: {
        issue: {
          title: 'Épico',
          subIssues: {
            nodes: [
              { number: 89, title: 'Tarefas', state: 'OPEN', stateReason: null, url: 'u', updatedAt: 'd', repository: { nameWithOwner: 'Sipal/CRM' }, assignees: { nodes: [{ login: 'fernando' }] }, labels: { nodes: [] }, milestone: null },
              { number: 86, title: 'Dono', state: 'OPEN', stateReason: null, url: 'u', updatedAt: 'd', repository: { nameWithOwner: 'Sipal/CRM' }, assignees: { nodes: [] }, labels: { nodes: [] }, milestone: null },
              { number: 50, title: 'Bolsão', state: 'CLOSED', stateReason: 'COMPLETED', url: 'u', updatedAt: 'd', repository: { nameWithOwner: 'Sipal/CRM' }, assignees: { nodes: [] }, labels: { nodes: [] }, milestone: null },
            ],
          },
        },
      },
    })
    const result = await run('list_issues')({ repo: 'Sipal/CRM', parent: 118, assignee: 'none' })
    expect((result.issues as { issue: string }[]).map((item) => item.issue)).toEqual(['#86'])
  })
})

describe('escritas de relações', () => {
  it('add_issue_dependency usa o id da issue bloqueadora, pede confirmação e audita', async () => {
    mocks.githubRequest.mockImplementation(async (path: string) => (path.endsWith('/issues/86') ? { id: 9086 } : {}))
    const result = await run('add_issue_dependency')({ repo: 'Sipal/CRM', number: 88, blockedBy: 86 })
    expect(result).toEqual({ ok: true, issue: 'sipal/crm#88', blockedBy: 'sipal/crm#86' })
    expect(mocks.githubRequest).toHaveBeenLastCalledWith('/repos/sipal/crm/issues/88/dependencies/blocked_by', expect.objectContaining({ method: 'POST', body: { issue_id: 9086 } }))
    expect(mocks.recordAudit).toHaveBeenCalledOnce()
    expect(needsConfirmation(findOpexTool('add_issue_dependency')!)).toBe(true)
    expect(needsConfirmation(findOpexTool('remove_issue_dependency')!)).toBe(true)
  })

  it('recusa bloqueio de si mesma e PR no lugar de issue', async () => {
    await expect(run('add_issue_dependency')({ repo: 'Sipal/CRM', number: 88, blockedBy: 88 })).rejects.toThrow('si mesma')
    mocks.githubRequest.mockResolvedValue({ id: 1, pull_request: {} })
    await expect(run('add_issue_dependency')({ repo: 'Sipal/CRM', number: 88, blockedBy: 105 })).rejects.toThrow('pull request')
  })

  it('remove_issue_dependency e sub-issues chamam os endpoints certos', async () => {
    mocks.githubRequest.mockResolvedValue({ id: 777 })
    await run('remove_issue_dependency')({ repo: 'Sipal/CRM', number: 88, blockedBy: 86 })
    expect(mocks.githubRequest).toHaveBeenLastCalledWith('/repos/sipal/crm/issues/88/dependencies/blocked_by/777', expect.objectContaining({ method: 'DELETE' }))
    await run('add_sub_issue')({ repo: 'Sipal/CRM', parent: 118, subIssue: 89, replaceParent: true })
    expect(mocks.githubRequest).toHaveBeenLastCalledWith('/repos/sipal/crm/issues/118/sub_issues', expect.objectContaining({ method: 'POST', body: { sub_issue_id: 777, replace_parent: true } }))
    await run('remove_sub_issue')({ repo: 'Sipal/CRM', parent: 118, subIssue: 89 })
    expect(mocks.githubRequest).toHaveBeenLastCalledWith('/repos/sipal/crm/issues/118/sub_issue', expect.objectContaining({ method: 'DELETE', body: { sub_issue_id: 777 } }))
  })
})

describe('tarefa pela issue vinculada (repo#N)', () => {
  it('get_task aceita o código repo#N e lê a tarefa vinculada', async () => {
    mocks.findIssueTask.mockResolvedValue({ id: 't89' })
    mocks.getTask.mockResolvedValue({ ...task({ id: 't89', code: 'CRM-89', title: 'Tarefas e Agenda' }), description: 'Corpo', technicalSpec: null, comments: [], history: [], timeLogs: [], totalTimeLogged: 0 })
    const result = await run('get_task')({ task: 'crm#89' })
    expect(mocks.findIssueTask).toHaveBeenCalledWith('crm', 89)
    expect(mocks.getTask).toHaveBeenCalledWith('t89')
    expect(result).toMatchObject({ code: 'CRM-89' })
  })

  it('issue sem tarefa vinculada dá erro acionável', async () => {
    mocks.findIssueTask.mockResolvedValue(null)
    await expect(run('get_task')({ task: 'sipal/crm#999' })).rejects.toThrow('get_issue')
  })
})

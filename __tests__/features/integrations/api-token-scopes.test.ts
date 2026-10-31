import { describe, expect, it } from 'vitest'
import {
  apiTokenScopesSchema,
  describeScopes,
  effectiveScopes,
  mcpOwnerToolDecision,
  routeAllowed,
  scopesToSelection,
  selectionToScopes,
  toolScopeHint,
  type ApiTokenScopeSelection,
  type ScopeToolMeta,
} from '@/features/integrations/api-tokens/scopes'
import { dateFromExpiry, expiryFromDate, buildTokenGroupTree, buildTokenToolTree } from '@/features/integrations/api-tokens/ui'

/** Matcher de escopos dos tokens de sistema (OPE-102): rotas, MCP do dono, curingas, destrutivas e legado. */

const overview: ScopeToolMeta = { name: 'get_app_overview', group: 'context', risk: 'read', alwaysOn: true }
const list: ScopeToolMeta = { name: 'list_tasks', group: 'tasks', risk: 'read' }
const del: ScopeToolMeta = { name: 'delete_task', group: 'tasks', risk: 'destructive' }
const write: ScopeToolMeta = { name: 'write_file', group: 'github', risk: 'write', confirmByDefault: true }
const files: ScopeToolMeta = { name: 'list_chat_files', group: 'files', risk: 'read' }

describe('routeAllowed', () => {
  it('rota livre aceita qualquer token; com escopo, exige o escopo ou api:v1:*', () => {
    expect(routeAllowed([], null)).toBe(true)
    expect(routeAllowed(['mcp:owner'], null)).toBe(true)
    expect(routeAllowed(['api:v1:relatorios'], 'api:v1:relatorios')).toBe(true)
    expect(routeAllowed(['api:v1:*'], 'api:v1:relatorios')).toBe(true)
    expect(routeAllowed(['api:v1:outra'], 'api:v1:relatorios')).toBe(false)
    expect(routeAllowed(['mcp:owner', 'mcp:owner:tool:*'], 'api:v1:relatorios')).toBe(false)
    expect(routeAllowed([], 'api:v1:relatorios')).toBe(false)
  })
})

describe('mcpOwnerToolDecision', () => {
  it('sem mcp:owner, nada passa', () => {
    expect(mcpOwnerToolDecision(['api:v1:*', 'mcp:owner:tool:*'], list)).toEqual({ ok: false, reason: 'no_mcp' })
  })

  it('Contexto vem com mcp:owner; curinga, grupo e nome concedem', () => {
    expect(mcpOwnerToolDecision(['mcp:owner'], overview).ok).toBe(true)
    expect(mcpOwnerToolDecision(['mcp:owner'], list)).toEqual({ ok: false, reason: 'not_granted' })
    expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:tool:*'], list).ok).toBe(true)
    expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:group:tasks'], list).ok).toBe(true)
    expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:tool:list_tasks'], list).ok).toBe(true)
    expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:group:github'], list).ok).toBe(false)
  })

  it('ajuste "pede confirmação" do dono exige o escopo destrutivo; desligar numa destrutiva não libera', () => {
    expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:tool:*'], list, { list_tasks: true })).toEqual({ ok: false, reason: 'destructive' })
    expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:tool:*', 'mcp:owner:destructive'], list, { list_tasks: true }).ok).toBe(true)
    expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:tool:*'], del, { delete_task: false })).toEqual({ ok: false, reason: 'destructive' })
  })

  it('destrutivas e com confirmação padrão exigem mcp:owner:destructive, mesmo concedidas', () => {
    for (const tool of [del, write]) {
      expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:tool:*'], tool)).toEqual({ ok: false, reason: 'destructive' })
      expect(mcpOwnerToolDecision(['mcp:owner', `mcp:owner:tool:${tool.name}`], tool)).toEqual({ ok: false, reason: 'destructive' })
      expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:tool:*', 'mcp:owner:destructive'], tool).ok).toBe(true)
    }
    // O escopo destrutivo não concede ferramenta sozinho.
    expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:destructive'], del)).toEqual({ ok: false, reason: 'not_granted' })
  })

  it('arquivos do chat nunca vão para o token', () => {
    expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:tool:*', 'mcp:owner:destructive'], files)).toEqual({ ok: false, reason: 'not_grantable' })
    expect(toolScopeHint(files)).toBe('não disponível por token')
    expect(toolScopeHint(del)).toBe('mcp:owner:tool:delete_task | mcp:owner:group:tasks | mcp:owner:tool:* + mcp:owner:destructive')
    expect(toolScopeHint(overview)).toBe('mcp:owner')
  })
})

describe('apiTokenScopesSchema', () => {
  it('exige pelo menos um escopo válido, sem repetição, e mcp:owner para as ferramentas', () => {
    expect(apiTokenScopesSchema.safeParse([]).success).toBe(false)
    expect(apiTokenScopesSchema.safeParse(['admin']).success).toBe(false)
    expect(apiTokenScopesSchema.safeParse(['api:v1:*', 'api:v1:*']).success).toBe(false)
    expect(apiTokenScopesSchema.safeParse(['mcp:owner:tool:*']).success).toBe(false)
    expect(apiTokenScopesSchema.safeParse(['mcp:owner:destructive']).success).toBe(false)
    expect(apiTokenScopesSchema.safeParse(['mcp:portal']).success).toBe(false)
    expect(apiTokenScopesSchema.safeParse(['mcp:owner', 'mcp:owner:group:ai-settings', 'mcp:owner:tool:list_tasks', 'mcp:owner:destructive']).success).toBe(true)
    expect(apiTokenScopesSchema.safeParse(['api:v1:*']).success).toBe(true)
  })
})

describe('legado', () => {
  it('token sem escopo gravado não tem escopo: só as rotas livres', () => {
    expect(effectiveScopes(undefined)).toEqual({ scopes: [], legacy: true })
    expect(effectiveScopes(null)).toEqual({ scopes: [], legacy: true })
    expect(effectiveScopes(['api:v1:*'])).toEqual({ scopes: ['api:v1:*'], legacy: false })
    const { scopes } = effectiveScopes(undefined)
    expect(routeAllowed(scopes, null)).toBe(true)
    expect(routeAllowed(scopes, 'api:v1:futura')).toBe(false)
    expect(mcpOwnerToolDecision(scopes, overview).ok).toBe(false)
    expect(describeScopes(undefined).badges).toEqual([{ key: 'legacy', label: 'Legado · só whoami', tone: 'secondary' }])
  })
})

describe('seleção da tela ⇄ escopos', () => {
  const base: ApiTokenScopeSelection = { apiAll: true, apiRoutes: [], mcpOwner: true, toolMode: 'groups', groups: ['tasks'], tools: ['list_tasks'], destructive: true }

  it('o modo de ferramentas decide a concessão gravada', () => {
    expect(selectionToScopes(base)).toEqual(['api:v1:*', 'mcp:owner', 'mcp:owner:group:tasks', 'mcp:owner:destructive'])
    expect(selectionToScopes({ ...base, toolMode: 'all' })).toEqual(['api:v1:*', 'mcp:owner', 'mcp:owner:tool:*', 'mcp:owner:destructive'])
    expect(selectionToScopes({ ...base, toolMode: 'tools', destructive: false })).toEqual(['api:v1:*', 'mcp:owner', 'mcp:owner:tool:list_tasks'])
    // MCP desligado descarta ferramentas e destrutivas.
    expect(selectionToScopes({ ...base, mcpOwner: false })).toEqual(['api:v1:*'])
  })

  it('MCP sem curinga, grupo nem ferramenta volta como lista vazia, nunca "Todas"', () => {
    expect(scopesToSelection(['mcp:owner'])).toMatchObject({ mcpOwner: true, toolMode: 'tools', tools: [], groups: [] })
    expect(selectionToScopes({ ...base, toolMode: 'groups', groups: [], destructive: false, apiAll: false })).toEqual(['mcp:owner'])
    expect(scopesToSelection(['api:v1:*']).toolMode).toBe('all')
  })

  it('ida e volta preserva a seleção', () => {
    for (const scopes of [['mcp:owner'], ['api:v1:*', 'mcp:owner'], ['api:v1:*', 'mcp:owner', 'mcp:owner:group:tasks'], ['mcp:owner', 'mcp:owner:tool:list_tasks', 'mcp:owner:destructive'], ['mcp:owner', 'mcp:owner:tool:*'], ['api:v1:relatorios']]) {
      expect(selectionToScopes(scopesToSelection(scopes))).toEqual(scopes)
    }
  })
})

describe('describeScopes', () => {
  const catalog = { groups: [{ id: 'tasks', label: 'Tarefas' }], tools: [{ ...overview, label: 'Visão' }, { ...list, label: 'Listar' }, { ...del, label: 'Excluir tarefa' }] }

  it('resume API, MCP e destrutivas liberadas', () => {
    const summary = describeScopes(['api:v1:*', 'mcp:owner', 'mcp:owner:group:tasks', 'mcp:owner:destructive'], catalog)
    expect(summary.badges.map((badge) => badge.label)).toEqual(['API v1', 'MCP · 3 ferramentas', 'Destrutivas'])
    expect(summary.allowedTools).toBe(3)
    expect(summary.sensitiveTools).toEqual(['Excluir tarefa'])
    expect(summary.lines.join(' ')).toContain('grupos Tarefas')
    expect(summary.lines.join(' ')).toContain('LIBERADAS')
  })

  it('avisa as destrutivas recusadas sem o escopo dedicado', () => {
    const summary = describeScopes(['mcp:owner', 'mcp:owner:tool:*'], catalog)
    expect(summary.allowedTools).toBe(2)
    expect(summary.badges.map((badge) => badge.key)).not.toContain('destructive')
    expect(summary.lines.join(' ')).toContain('Destrutivas recusadas')
  })
})

describe('apoio da tela', () => {
  it('expiração: dia escolhido → fim do dia (ISO) → mesmo dia', () => {
    const iso = expiryFromDate('2027-03-10')!
    expect(new Date(iso).getHours()).toBe(23)
    expect(dateFromExpiry(iso)).toBe('2027-03-10')
    expect(expiryFromDate('')).toBeNull()
    expect(dateFromExpiry(null)).toBe('')
  })

  it('árvores marcam como sensíveis as que exigem o escopo destrutivo', () => {
    const tools = [
      { name: 'list_tasks', group: 'tasks' as const, label: 'Listar', description: '', risk: 'read' as const, alwaysOn: false },
      { name: 'write_file', group: 'github' as const, label: 'Gravar', description: '', risk: 'write' as const, confirmByDefault: true, alwaysOn: false },
    ]
    const tree = buildTokenToolTree(tools)
    const github = tree.find((branch) => branch.id === 'tools_github')!
    expect(github.sensitive).toBe(true)
    expect(github.children[0]).toMatchObject({ key: 'write_file', sensitive: true })
    expect(tree.find((branch) => branch.id === 'tools_tasks')!.sensitive).toBeUndefined()
    const groups = buildTokenGroupTree({ groups: [{ id: 'tasks', label: 'Tarefas', description: '' }, { id: 'github', label: 'GitHub', description: '' }], tools })
    expect(groups[0]!.children.map((leaf) => [('key' in leaf ? leaf.key : ''), Boolean(leaf.sensitive)])).toEqual([['tasks', false], ['github', true]])
  })
})

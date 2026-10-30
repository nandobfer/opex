import { describe, expect, it } from 'vitest'
import { maddoxSessionPermissions } from '@/features/maddox-agent/permissions'
import { MADDOX_CLIENT_TOOL_NAMES, buildMaddoxClientToolTree, enabledMaddoxClientToolNames, maddoxMcpToolName, maddoxOwnerToolMetas, parseMaddoxMcpToolName } from '@/features/maddox-agent/catalog'
import { readFileSync } from 'node:fs'
import { agentColorStyle } from '@/features/maddox-agent/colors'
import { COLUMN_COLORS } from '@/features/tasks/board'
import { isMaddoxShortcut } from '@/features/maddox-agent/constants'
import { isOpexShortcut } from '@/features/opex-agent/constants'
import { activeAgentStorageKey, otherAgent, resolveActiveAgent } from '@/features/opex-agent/agents'
import { handleMcpBody, handleMcpMessage, mcpTextResult, OPENCODE_SESSION_META } from '@/features/maddox-agent/mcp-protocol'
import { applyLiveLine, closePendingRequests, startLiveMessage } from '@/features/opex-agent/live-message'
import { normalizeOpencodeEvent, toOpencodePermission } from '@/lib/ai/opencode-events'
import { resolveTurnModel } from '@/features/maddox-agent/server/runner-model'
import type { OpexToolMetaDto } from '@/features/opex-agent/tool-tree'

const meta = (name: string, group: OpexToolMetaDto['group'], risk: OpexToolMetaDto['risk'], extra: Partial<OpexToolMetaDto> = {}): OpexToolMetaDto => ({ name, group, label: name, description: '', risk, alwaysOn: group === 'context', ...extra })

describe('permissões da sessão do OpenCode (Maddox)', () => {
  const tools = [meta('get_app_overview', 'context', 'read'), meta('list_tasks', 'tasks', 'read'), meta('delete_task', 'tasks', 'destructive'), meta('create_branch', 'github', 'write', { confirmByDefault: true }), meta('update_task', 'tasks', 'write')]

  it('dono: nega o servidor do portal, desligada vira deny, confirmação vira ask e o resto allow', () => {
    const rules = maddoxSessionPermissions({ scope: 'owner', tools, enabled: new Set(['get_app_overview', 'delete_task', 'create_branch', 'update_task']), overrides: { update_task: true } })
    expect(rules[0]).toEqual({ action: 'opex_portal_*', resource: '*', effect: 'deny' })
    const effect = (name: string) => rules.find((rule) => rule.action === `opex_app_${name}`)?.effect
    expect(effect('get_app_overview')).toBe('allow')
    expect(effect('list_tasks')).toBe('deny')
    expect(effect('delete_task')).toBe('ask')
    expect(effect('create_branch')).toBe('ask')
    expect(effect('update_task')).toBe('ask')
  })

  it('o ajuste "Pede confirmação" desligado numa destrutiva libera sem pedir', () => {
    const rules = maddoxSessionPermissions({ scope: 'owner', tools, enabled: new Set(['delete_task']), overrides: { delete_task: false } })
    expect(rules.find((rule) => rule.action === 'opex_app_delete_task')?.effect).toBe('allow')
  })

  it('portal: nega o servidor do dono e as destrutivas pedem confirmação pelo risco', () => {
    const rules = maddoxSessionPermissions({ scope: 'portal', tools: [{ name: 'delete_user', risk: 'destructive' }, { name: 'list_tasks', risk: 'read' }], enabled: new Set(['delete_user', 'list_tasks']) })
    expect(rules[0]).toEqual({ action: 'opex_app_*', resource: '*', effect: 'deny' })
    expect(rules.find((rule) => rule.action === 'opex_portal_delete_user')?.effect).toBe('ask')
    expect(rules.find((rule) => rule.action === 'opex_portal_list_tasks')?.effect).toBe('allow')
  })
})

describe('catálogo do Maddox', () => {
  it('fica sem os jobs agendados, no dono e no portal', () => {
    expect(maddoxOwnerToolMetas([meta('schedule_job', 'jobs', 'write'), meta('list_tasks', 'tasks', 'read')]).map((tool) => tool.name)).toEqual(['list_tasks'])
    expect(MADDOX_CLIENT_TOOL_NAMES).not.toContain('schedule_job')
    expect(buildMaddoxClientToolTree().some((branch) => branch.id === 'jobs')).toBe(false)
  })

  it('no portal o contexto fica sempre ligado e as de admin só para o admin', () => {
    const user = enabledMaddoxClientToolNames(['get_portal_overview', 'list_tasks'], false)
    expect(user).toContain('get_portal_overview')
    expect(user).not.toContain('list_tasks')
    expect(user).not.toContain('get_finance')
    expect(enabledMaddoxClientToolNames([], true)).toContain('get_finance')
  })

  it('traduz o nome visto no OpenCode de volta para a ferramenta do Opex (nativas = null)', () => {
    expect(maddoxMcpToolName('owner', 'list_tasks')).toBe('opex_app_list_tasks')
    expect(parseMaddoxMcpToolName('opex_portal_list_tasks')).toEqual({ scope: 'portal', tool: 'list_tasks' })
    expect(parseMaddoxMcpToolName('opex_app_get_task')).toEqual({ scope: 'owner', tool: 'get_task' })
    expect(parseMaddoxMcpToolName('bash')).toBeNull()
  })
})

describe('cor do agente', () => {
  it('sem cor (primária) não sobrescreve o tema', () => {
    expect(agentColorStyle(null)).toEqual({})
  })

  it('a cor vira os tokens do tema (cor e texto legível), sem valores fixos', () => {
    expect(agentColorStyle('sky')).toEqual({ '--primary': 'var(--agent-sky)', '--primary-foreground': 'var(--agent-sky-foreground)', '--ring': 'var(--agent-sky)' })
  })

  it('o tema declara a cor e o texto de cada cor da paleta', () => {
    const css = readFileSync('src/app/globals.css', 'utf8')
    for (const color of COLUMN_COLORS) {
      expect(css).toMatch(new RegExp(`--agent-${color}: [0-9]`))
      expect(css).toMatch(new RegExp(`--agent-${color}-foreground: [0-9]`))
    }
  })
})

describe('troca de agente', () => {
  it('abre o último escolhido se disponível; senão o primeiro disponível', () => {
    expect(resolveActiveAgent('maddox', ['opex', 'maddox'])).toBe('maddox')
    expect(resolveActiveAgent('maddox', ['opex'])).toBe('opex')
    expect(resolveActiveAgent(null, ['maddox'])).toBe('maddox')
    expect(resolveActiveAgent('opex', [])).toBeNull()
  })

  it('o botão do outro agente só existe com dois agentes', () => {
    expect(otherAgent('opex', ['opex', 'maddox'])).toBe('maddox')
    expect(otherAgent('maddox', ['maddox'])).toBeNull()
  })

  it('a escolha fica separada por cliente e usuário no portal', () => {
    expect(activeAgentStorageKey(null, null)).toBe('opex:chat-agent:active:v1')
    expect(activeAgentStorageKey('c1', 'u1')).toBe('opex:chat-agent:active:v1:c1:u1')
  })

  it('Ctrl+Shift+M é do Maddox e Ctrl+Shift+O continua do Opex', () => {
    const key = (k: string) => ({ key: k, ctrlKey: true, metaKey: false, shiftKey: true, altKey: false })
    expect(isMaddoxShortcut(key('M'))).toBe(true)
    expect(isMaddoxShortcut(key('o'))).toBe(false)
    expect(isOpexShortcut(key('O'))).toBe(true)
    expect(isOpexShortcut(key('m'))).toBe(false)
  })
})

describe('protocolo MCP mínimo', () => {
  const handlers = {
    listTools: () => [{ name: 'list_tasks', description: 'Lista', inputSchema: { type: 'object', properties: {} } }],
    callTool: async (name: string, args: Record<string, unknown>, metaArg: Record<string, unknown>) => mcpTextResult({ name, args, session: metaArg[OPENCODE_SESSION_META] }),
  }

  it('initialize devolve a versão pedida e a capacidade de ferramentas', async () => {
    const response = await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, handlers)
    expect(response?.result).toMatchObject({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'opex' } })
  })

  it('tools/list e tools/call repassam a sessão do OpenCode do _meta', async () => {
    const list = await handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, handlers)
    expect((list?.result as { tools: unknown[] }).tools).toHaveLength(1)
    const call = await handleMcpMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_tasks', arguments: { q: 'x' }, _meta: { [OPENCODE_SESSION_META]: 'ses_1' } } }, handlers)
    const text = (call?.result as { content: { text: string }[] }).content[0].text
    expect(JSON.parse(text)).toEqual({ name: 'list_tasks', args: { q: 'x' }, session: 'ses_1' })
  })

  it('notificação não tem resposta; método desconhecido e requisição inválida dão erro JSON-RPC', async () => {
    expect(await handleMcpBody({ jsonrpc: '2.0', method: 'notifications/initialized' }, handlers)).toBeNull()
    expect((await handleMcpMessage({ jsonrpc: '2.0', id: 4, method: 'resources/list' }, handlers))?.error?.code).toBe(-32601)
    expect((await handleMcpMessage({ id: 5 }, handlers))?.error?.code).toBe(-32600)
  })

  it('lote devolve só as respostas das requisições', async () => {
    const result = await handleMcpBody([{ jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 9, method: 'ping' }], handlers)
    expect(result).toEqual([{ jsonrpc: '2.0', id: 9, result: {} }])
  })
})

describe('resposta ao vivo com pedidos do OpenCode', () => {
  const base = () => applyLiveLine(startLiveMessage('m1', '2026-10-30T00:00:00.000Z'), { type: 'tool-start', id: 't1', name: 'bash', group: 'opencode-native', label: 'bash' })!

  it('a confirmação chega no meio do turno e sobrevive ao fim da ferramenta', () => {
    let live = applyLiveLine(base(), { type: 'tool-confirmation', id: 't1', confirmation: { actionId: 'p1', summary: 'Rodar ls?', status: 'pending', error: null } })
    live = applyLiveLine(live, { type: 'tool-end', id: 't1', state: 'done', output: 'ok', error: null, confirmation: null, durationMs: 10 })
    const part = live!.parts[0]
    expect(part.type === 'tool' && part.confirmation?.actionId).toBe('p1')
  })

  it('pergunta entra como parte e muda de situação; ao fim do turno os pedidos abertos fecham', () => {
    let live = applyLiveLine(base(), { type: 'form', form: { id: 'f1', title: 'Qual ambiente?', fields: [] } })
    expect(live!.parts.some((part) => part.type === 'form' && part.status === 'pending')).toBe(true)
    live = applyLiveLine(live, { type: 'tool-confirmation', id: 't1', confirmation: { actionId: 'p1', summary: 'x', status: 'pending', error: null } })
    const closed = closePendingRequests(live!.parts)
    expect(closed.find((part) => part.type === 'form')).toMatchObject({ status: 'cancelled' })
    expect(closed.find((part) => part.type === 'tool')).toMatchObject({ confirmation: { status: 'expired' } })
    const answered = applyLiveLine(live, { type: 'form-status', id: 'f1', status: 'answered' })
    expect(answered!.parts.find((part) => part.type === 'form')).toMatchObject({ status: 'answered' })
  })
})

describe('eventos do OpenCode usados pelo Maddox', () => {
  it('a permissão traz a chamada de ferramenta que a pediu', () => {
    expect(toOpencodePermission({ id: 'p1', action: 'bash', resources: ['ls'], source: { type: 'tool', messageID: 'm', id: 'call_1' } })).toMatchObject({ id: 'p1', toolCallId: 'call_1' })
    expect(toOpencodePermission({ id: 'p2', action: 'edit' })?.toolCallId).toBeUndefined()
  })

  it('o raciocínio leva o texto', () => {
    expect(normalizeOpencodeEvent({ type: 'session.reasoning.delta', data: { sessionID: 's', delta: 'pensando' } }, 's')).toEqual({ kind: 'reasoning', delta: 'pensando' })
  })
})

describe('modelo do turno', () => {
  const settings = { main: { model: 'anthropic/claude', variant: 'high' } }
  const catalog = [{ id: 'anthropic/claude', variants: ['high'] }, { id: 'openai/gpt', variants: ['low'] }]

  it('usa o modelo da sessão quando está no catálogo', () => {
    expect(resolveTurnModel(settings, { model: 'openai/gpt', variant: 'low' }, catalog)).toEqual({ model: 'openai/gpt', variant: 'low', fellBack: false })
  })

  it('modelo da sessão fora do catálogo volta ao padrão e avisa', () => {
    expect(resolveTurnModel(settings, { model: 'x/sumiu', variant: null }, catalog)).toEqual({ model: 'anthropic/claude', variant: 'high', fellBack: true })
  })

  it('sem troca na sessão, o padrão da configuração', () => {
    expect(resolveTurnModel(settings, null, catalog)).toEqual({ model: 'anthropic/claude', variant: 'high', fellBack: false })
  })
})

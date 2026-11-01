import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-104: MCP "Memória própria" dos agentes no OpenCode: autorização, agente pela sessão e registro por diretório. */

const mocks = vi.hoisted(() => ({
  workbench: null as Record<string, unknown> | null,
  review: null as Record<string, unknown> | null,
  diagram: null as Record<string, unknown> | null,
  parents: {} as Record<string, string>,
  enabled: true,
  create: vi.fn(async (_agent: string, texto: string) => ({ memoria: { id: 'm_1', texto, resumo: texto, categoria: 'PROJECT_RULES', fixada: false, ativa: true, doDono: false, autor: null, versao: 1 } })),
  publish: vi.fn(),
  overrides: {} as Record<string, boolean>,
  disabled: [] as string[],
  remove: vi.fn(async () => ({ id: 'm_1', texto: 'x', resumo: 'x', categoria: 'PROJECT_RULES', fixada: false, ativa: true, doDono: false, autor: null, versao: 1 })),
}))
const lean = (value: unknown) => ({ select: () => ({ lean: async () => value }), lean: async () => value })
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/crypto/secretBox', () => ({ deriveSubkey: () => Buffer.from('segredo-derivado-de-teste') }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local', name: 'Dono' }) }))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => ({ opexPublicUrl: 'http://opex:3100/' }) }))
vi.mock('@/lib/db/models/Agentic', () => ({
  AgenticWorkbench: { findOne: (query: { sessionId: string }) => lean(mocks.workbench && mocks.workbench.sessionId === query.sessionId ? mocks.workbench : null) },
  AgenticFork: { findOne: () => lean(null) },
}))
vi.mock('@/features/adversarial-agent/server/models', () => ({ AdversarialReview: { findOne: (query: { sessionId: string }) => lean(mocks.review && mocks.review.sessionId === query.sessionId ? mocks.review : null) } }))
vi.mock('@/features/architect-agent/server/models', () => ({ ArchitectDiagram: { findOne: (query: { sessionId: string }) => lean(mocks.diagram && mocks.diagram.sessionId === query.sessionId ? mocks.diagram : null) } }))
vi.mock('@/lib/db/models/Opex', () => ({ OpexSession: { findOne: () => lean(null) } }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: async () => ({ session: { get: async ({ sessionID }: { sessionID: string }) => ({ parentID: mocks.parents[sessionID] ?? null }) } }) }))
vi.mock('@/features/ai/server/self-memory/settings', () => ({ selfMemoryEnabled: async () => mocks.enabled }))
vi.mock('@/features/ai/server/agent-memory-service', () => ({ createAgentMemory: mocks.create, updateAgentMemory: vi.fn(), deleteAgentMemory: mocks.remove, listAgentMemories: vi.fn(async () => []) }))
vi.mock('@/features/opex-agent/server/settings', () => ({ loadOpexSettings: async () => ({ settings: { confirmationOverrides: mocks.overrides, disabledTools: mocks.disabled } }) }))
vi.mock('@/features/agentic/server/hub', () => ({ publishWorkbenchEvent: mocks.publish }))

import { agentMemoryMcpSecret, callSelfMemoryTool, ensureAgentMemoryMcp, handleAgentMemoryMcpRequest, isAgentMemoryMcpAuthorized, selfMemorySessionPermissions } from '@/features/ai/server/self-memory/mcp'
import { resetSelfMemoryCounters } from '@/features/ai/server/self-memory/tools'

const C = 'a'.repeat(24)
const meta = (sessionId: string) => ({ 'ai.opencode/sessionID': sessionId })
const text = (result: { content: { text: string }[] }) => result.content[0]!.text

beforeEach(() => {
  vi.clearAllMocks()
  resetSelfMemoryCounters()
  mocks.workbench = { _id: 'w1', sessionId: 'ses_mesa', centralId: C, taskCode: 'OPE-1', turnStartedAt: new Date('2026-11-01T10:00:00Z') }
  mocks.review = null
  mocks.parents = {}
  mocks.enabled = true
  mocks.overrides = {}
  mocks.disabled = []
})

describe('MCP de memórias', () => {
  it('autoriza só com o segredo derivado', () => {
    const secret = agentMemoryMcpSecret()!
    expect(isAgentMemoryMcpAuthorized(`Bearer ${secret}`)).toBe(true)
    expect(isAgentMemoryMcpAuthorized('Bearer outro')).toBe(false)
    expect(isAgentMemoryMcpAuthorized(null)).toBe(false)
  })

  it('sem autorização: 401 sem tocar nas memórias', async () => {
    const response = await handleAgentMemoryMcpRequest(new Request('http://x', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }))
    expect(response.status).toBe(401)
  })

  it('tools/list publica as ferramentas de memória própria', async () => {
    const response = await handleAgentMemoryMcpRequest(new Request('http://x', { method: 'POST', headers: { Authorization: `Bearer ${agentMemoryMcpSecret()}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }))
    const body = (await response.json()) as { result: { tools: { name: string }[] } }
    expect(body.result.tools.map((tool) => tool.name)).toEqual(['list_my_memories', 'remember', 'update_my_memory', 'pin_my_memory', 'set_my_memory_active', 'forget_my_memory'])
  })

  it('a sessão da mesa identifica o agente desenvolvedor e a central (inclusive vinda de um subagente)', async () => {
    mocks.parents = { ses_sub: 'ses_mesa' }
    const result = await callSelfMemoryTool('remember', { lista: 'developer-central', texto: 'Use pnpm.' }, meta('ses_sub'))
    expect(result.isError).toBeFalsy()
    expect(mocks.create).toHaveBeenCalledWith('developer-central', 'Use pnpm.', 'local', expect.objectContaining({ centralId: C, agent: { consumer: 'desenvolvedor', label: 'Agente desenvolvedor · OPE-1' }, auditContext: { mesa: 'w1', tarefa: 'OPE-1' } }))
    await vi.waitFor(() => expect(mocks.publish).toHaveBeenCalledWith('w1', expect.objectContaining({ type: 'notice', message: expect.stringContaining('Memória gravada pelo agente') })))
  })

  it('a sessão da revisão identifica o Agente Adversário: a lista do desenvolvedor é recusada', async () => {
    mocks.workbench = null
    mocks.review = { _id: 'r1', sessionId: 'ses_rev', workbenchId: 'w1', taskCode: 'OPE-1' }
    const refused = await callSelfMemoryTool('remember', { lista: 'developer-global', texto: 'x' }, meta('ses_rev'))
    expect(refused.isError).toBe(true)
    await callSelfMemoryTool('remember', { lista: 'adversarial', texto: 'F2 é intencional neste repositório.' }, meta('ses_rev'))
    expect(mocks.create).toHaveBeenCalledWith('adversarial', 'F2 é intencional neste repositório.', 'local', expect.objectContaining({ agent: expect.objectContaining({ consumer: 'adversario' }) }))
  })

  it('a sessão do diagrama identifica o Agente Arquiteto: grava só na lista dele', async () => {
    mocks.workbench = null
    mocks.diagram = { _id: 'd1', sessionId: 'ses_arch', workbenchId: 'w1', taskCode: 'OPE-1' }
    const refused = await callSelfMemoryTool('remember', { lista: 'adversarial', texto: 'x' }, meta('ses_arch'))
    expect(refused.isError).toBe(true)
    await callSelfMemoryTool('remember', { lista: 'architect', texto: 'As camadas do Opex são app, features e lib.' }, meta('ses_arch'))
    expect(mocks.create).toHaveBeenCalledWith('architect', 'As camadas do Opex são app, features e lib.', 'local', expect.objectContaining({ agent: { consumer: 'arquiteto', label: 'Agente Arquiteto · OPE-1' }, auditContext: { mesa: 'w1', arquitetura: 'd1', tarefa: 'OPE-1' } }))
    mocks.diagram = null
  })

  it('sessão desconhecida, sem sessão ou com o aprendizado desligado: recusa com o motivo', async () => {
    expect(text((await callSelfMemoryTool('remember', { lista: 'adversarial', texto: 'x' }, meta('ses_fora'))) as never)).toContain('não é de um agente do Opex')
    expect(text((await callSelfMemoryTool('remember', { lista: 'adversarial', texto: 'x' }, {})) as never)).toContain('sem a sessão do OpenCode')
    mocks.enabled = false
    expect(text((await callSelfMemoryTool('remember', { lista: 'developer-global', texto: 'x' }, meta('ses_mesa'))) as never)).toContain('está desligado')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('registro: adiciona o servidor por diretório uma vez; falha vira { ok: false } sem lançar', async () => {
    const add = vi.fn(async () => ({}))
    const list = vi.fn(async () => ({ data: [] as { name: string }[] }))
    const client = { mcp: { add, list, remove: vi.fn() } } as never
    expect(await ensureAgentMemoryMcp(client, ['/repo/wt', '/repo/wt', null])).toEqual({ ok: true, error: null })
    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ server: 'opex_memorias', location: { directory: '/repo/wt' }, config: expect.objectContaining({ type: 'remote', url: 'http://opex:3100/api/agent-memory/mcp' }) }))
    list.mockResolvedValue({ data: [{ name: 'opex_memorias' }] })
    await ensureAgentMemoryMcp(client, ['/repo/wt'])
    expect(add).toHaveBeenCalledTimes(1)
    const failing = { mcp: { add: vi.fn(async () => Promise.reject(new Error('OpenCode fora'))), list: vi.fn(async () => ({ data: [] })), remove: vi.fn() } } as never
    expect(await ensureAgentMemoryMcp(failing, ['/outro'])).toEqual({ ok: false, error: 'OpenCode fora' })
  })

  it('excluir/inativar pedem a confirmação do dono: na mesa (sem chat) a chamada é recusada e nada muda', async () => {
    const refused = await callSelfMemoryTool('forget_my_memory', { lista: 'developer-global', memoryId: 'm_1' }, meta('ses_mesa'))
    expect(refused.isError).toBe(true)
    expect(text(refused as never)).toContain('pede a confirmação do dono')
    expect(mocks.remove).not.toHaveBeenCalled()
    // O dono desliga a confirmação da ferramenta (Integrações › Agente Opex › Ferramentas): a mesa exclui.
    mocks.overrides = { forget_my_memory: false }
    expect((await callSelfMemoryTool('forget_my_memory', { lista: 'developer-global', memoryId: 'm_1' }, meta('ses_mesa'))).isError).toBeFalsy()
    expect(mocks.remove).toHaveBeenCalledTimes(1)
  })

  it('ferramenta desligada pelo dono é recusada', async () => {
    mocks.disabled = ['remember']
    expect(text((await callSelfMemoryTool('remember', { lista: 'developer-global', texto: 'x' }, meta('ses_mesa'))) as never)).toContain('desligada pelo dono')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('Maddox: a sessão do OpenCode pergunta antes de inativar/excluir; desligada vira deny; ajuste do dono vale', () => {
    const rules = selfMemorySessionPermissions({ overrides: { set_my_memory_active: false }, disabled: new Set(['pin_my_memory']) })
    const effect = (name: string) => rules.findLast((rule) => rule.action === `opex_memorias_${name}`)?.effect
    expect(rules[0]).toEqual({ action: 'opex_memorias_*', resource: '*', effect: 'allow' })
    expect(effect('forget_my_memory')).toBe('ask')
    expect(effect('set_my_memory_active')).toBe('allow')
    expect(effect('pin_my_memory')).toBe('deny')
    expect(effect('remember')).toBe('allow')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

/** MCP de uma execução (motor OpenCode, OPE-130): autenticado pelo segredo da execução; só as ferramentas internas do turno vivo. */

const holder = vi.hoisted(() => ({ run: null as null | { mcp: { secretHash: string } | null; status: string }, steps: [] as Record<string, unknown>[] }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: async () => undefined, AcaoAuditoria: {} }))
vi.mock('@/lib/db/models/RoutineAgent', () => ({
  RoutineRun: { findById: () => ({ select: () => ({ lean: async () => holder.run }) }) },
  RoutineRunStep: { create: async (doc: Record<string, unknown>) => void holder.steps.push(doc) },
}))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: async () => undefined }))

import { handleRoutineRunMcpRequest } from '@/features/routine-agents/server/mcp'
import { hashMcpSecret, routineSessionPermissions } from '@/features/routine-agents/server/engines/opencode'
import { beginActivation, resetActivationsForTests } from '@/features/routine-agents/server/hub'
import { routineControlTools } from '@/features/routine-agents/server/tools/internal'
import { EMPTY_ROUTINE_LIMITS } from '@/features/routine-agents/schemas'
import { httpTools } from '@/features/opex-agent/server/tools/http'
import { guardedRoutineTool } from '@/features/routine-agents/server/tools/guarded'

const RUN = 'b'.repeat(24)
const rpc = (body: unknown, secret = 'segredo') => handleRoutineRunMcpRequest(RUN, new Request('http://app/api/routine-agents/mcp/' + RUN, { method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body) }))

beforeEach(() => {
  resetActivationsForTests()
  holder.run = { mcp: { secretHash: hashMcpSecret('segredo') }, status: 'running' }
  holder.steps = []
})
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('MCP da execução', () => {
  it('recusa segredo errado e execução sem turno ativo (finalizada)', async () => {
    expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'outro')).status).toBe(401)
    holder.run = { mcp: { secretHash: hashMcpSecret('segredo') }, status: 'completed' }
    expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).status).toBe(401)
  })

  it('lista e executa as ferramentas internas do turno vivo', async () => {
    const activation = beginActivation({ runId: RUN, agentId: 'a'.repeat(24), baseTokens: 0, baseActiveMs: 0 })
    activation.tools = routineControlTools({ activation, limits: EMPTY_ROUTINE_LIMITS, confirmIrreversible: true, setPhase: async () => undefined })
    const list = (await (await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).json()) as { result: { tools: { name: string }[] } }
    expect(list.result.tools.map((item) => item.name).sort()).toEqual(['finish', 'hibernate', 'request_confirmation', 'wait'])
    await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'finish', arguments: { report: 'Pronto' } } })
    expect(activation.outcome).toEqual({ kind: 'finish', report: 'Pronto' })
  })

  it('a Chamada HTTP do MCP da execução usa os segredos do agente da execução e devolve o valor mascarado', async () => {
    const activation = beginActivation({ runId: RUN, agentId: 'a'.repeat(24), baseTokens: 0, baseActiveMs: 0 })
    activation.tools = [...httpTools]
    activation.secrets = { list: () => [{ name: 'TOKEN', description: '', allowedHosts: [] }], value: (name) => (name === 'TOKEN' ? 'valor-do-agente-a' : undefined), markUsed: () => undefined }
    const seen: string[] = []
    vi.stubGlobal('fetch', async (_url: URL, init: RequestInit) => (seen.push(new Headers(init.headers).get('authorization') ?? ''), new Response('eco valor-do-agente-a')))
    try {
      const response = (await (await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'http_request', arguments: { url: 'https://api.x.com', headers: { Authorization: 'Bearer {{secret:TOKEN}}' } } } })).json()) as { result: { content: { text: string }[] } }
      expect(seen).toEqual(['Bearer valor-do-agente-a'])
      expect(response.result.content[0]!.text).toContain('eco {{secret:TOKEN}}')
      expect(response.result.content[0]!.text).not.toContain('valor-do-agente-a')
      // A chamada vira passo da execução, com a entrada sem o valor do segredo.
      await flush()
      expect(holder.steps).toEqual([expect.objectContaining({ kind: 'tool', label: 'Chamada HTTP', toolName: 'http_request', error: false })])
      expect(JSON.stringify(holder.steps)).toContain('{{secret:TOKEN}}')
      expect(JSON.stringify(holder.steps)).not.toContain('valor-do-agente-a')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('critério aprovado (OPE-130, D4/D6): o ajuste "pede confirmação" do dono vale na Chamada HTTP do MCP; o que libera executa', async () => {
    const fetchSpy = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const activation = beginActivation({ runId: RUN, agentId: 'a'.repeat(24), baseTokens: 0, baseActiveMs: 0 })
      activation.tools = httpTools.map((tool) => guardedRoutineTool(tool, { activation, confirmIrreversible: true, overrides: { http_request: true } }))
      const call = { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'http_request', arguments: { method: 'POST', url: 'https://api.x.com', body: { type: 'text', value: 'oi' } } } }
      const paused = (await (await rpc(call)).json()) as { result: { content: { text: string }[] } }
      expect(paused.result.content[0]!.text).toContain('confirmation_required')
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(activation.outcome).toMatchObject({ kind: 'confirmation', action: { kind: 'tool', toolName: 'http_request', summary: 'POST https://api.x.com' } })
      await flush()
      expect(holder.steps.at(-1)).toMatchObject({ label: 'Chamada HTTP (aguardando confirmação)' })
      resetActivationsForTests()
      const free = beginActivation({ runId: RUN, agentId: 'a'.repeat(24), baseTokens: 0, baseActiveMs: 0 })
      free.tools = httpTools.map((tool) => guardedRoutineTool(tool, { activation: free, confirmIrreversible: true, overrides: {} }))
      await rpc(call)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(free.outcome).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a sessão do OpenCode nega os MCPs do host não liberados e libera o da execução', () => {
    expect(routineSessionPermissions(['playwright', 'github', 'rotina_x'], ['playwright'], 'rotina_x')).toEqual([
      { action: 'github_*', resource: '*', effect: 'deny' },
      { action: 'rotina_x_*', resource: '*', effect: 'allow' },
    ])
  })
})

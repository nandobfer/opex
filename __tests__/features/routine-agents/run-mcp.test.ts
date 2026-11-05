import { beforeEach, describe, expect, it, vi } from 'vitest'

/** MCP de uma execução (motor OpenCode, OPE-130): autenticado pelo segredo da execução; só as ferramentas internas do turno vivo. */

const holder = vi.hoisted(() => ({ run: null as null | { mcp: { secretHash: string } | null; status: string } }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: async () => undefined, AcaoAuditoria: {} }))
vi.mock('@/lib/db/models/RoutineAgent', () => ({ RoutineRun: { findById: () => ({ select: () => ({ lean: async () => holder.run }) }) } }))

import { handleRoutineRunMcpRequest } from '@/features/routine-agents/server/mcp'
import { hashMcpSecret, routineSessionPermissions } from '@/features/routine-agents/server/engines/opencode'
import { beginActivation, resetActivationsForTests } from '@/features/routine-agents/server/hub'
import { routineControlTools } from '@/features/routine-agents/server/tools/internal'
import { EMPTY_ROUTINE_LIMITS } from '@/features/routine-agents/schemas'

const RUN = 'b'.repeat(24)
const rpc = (body: unknown, secret = 'segredo') => handleRoutineRunMcpRequest(RUN, new Request('http://app/api/routine-agents/mcp/' + RUN, { method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body) }))

beforeEach(() => {
  resetActivationsForTests()
  holder.run = { mcp: { secretHash: hashMcpSecret('segredo') }, status: 'running' }
})

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

  it('a sessão do OpenCode nega os MCPs do host não liberados e libera o da execução', () => {
    expect(routineSessionPermissions(['playwright', 'github', 'rotina_x'], ['playwright'], 'rotina_x')).toEqual([
      { action: 'github_*', resource: '*', effect: 'deny' },
      { action: 'rotina_x_*', resource: '*', effect: 'allow' },
    ])
  })
})

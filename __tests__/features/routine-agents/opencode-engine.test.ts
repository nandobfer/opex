import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Motor OpenCode dos agentes rotineiros (OPE-130): permissões da sessão (só os MCPs liberados), MCP da
 * execução com o segredo só em hash, serviço indisponível vira Erro, sessão antiga inexistente vira
 * aviso numa sessão nova e o MCP da execução sai no fim. Cliente do OpenCode simulado (sem rede).
 */

const holder = vi.hoisted(() => ({
  clientError: null as Error | null,
  base: 'https://opex.example' as string | null,
  hostMcps: ['playwright', 'github'],
  existing: new Set<string>(),
  calls: { add: [] as unknown[], remove: [] as unknown[], create: [] as unknown[], update: [] as unknown[], turns: [] as unknown[] },
  runUpdates: [] as unknown[],
  turnOutcome: { outcome: 'done' as string, message: null as string | null },
}))

vi.mock('@/lib/db/models/RoutineAgent', () => ({ RoutineRun: { updateOne: async (_filter: unknown, update: unknown) => void holder.runUpdates.push(update) } }))
vi.mock('@/features/routine-agents/server/workdir', () => ({ ensureRoutineWorkdir: async (slug: string) => `/home/burgos/opex-rotineiros/${slug}` }))
vi.mock('@/features/ai/server/self-memory/mcp', () => ({ opexPublicBaseUrl: async () => holder.base }))
vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: async () => {
    if (holder.clientError) throw holder.clientError
    return {
      mcp: {
        list: async () => ({ data: holder.hostMcps.map((name) => ({ name })) }),
        add: async (args: unknown) => void holder.calls.add.push(args),
        remove: async (args: unknown) => void holder.calls.remove.push(args),
      },
      session: {
        get: async ({ sessionID }: { sessionID: string }) => {
          if (!holder.existing.has(sessionID)) throw new Error('not found')
          return { id: sessionID }
        },
        update: async (args: unknown) => void holder.calls.update.push(args),
        create: async (args: unknown) => (holder.calls.create.push(args), { id: 'ses_nova' }),
        instructions: { entry: { put: async () => undefined } },
      },
    }
  },
}))
vi.mock('@/lib/ai/opencode-run', () => ({
  runAgentTurn: async (_client: unknown, args: unknown, hooks: { onStep: (usage: unknown) => void; onText: (delta: string) => void }) => {
    holder.calls.turns.push(args)
    hooks.onText('Pronto')
    hooks.onStep({ tokens: { input: 10, output: 5, reasoning: 1 }, costUsd: 0.01, stepId: 's1' })
    return holder.turnOutcome
  },
}))

import { hashMcpSecret, routineSessionPermissions, runOpencodeEngine } from '@/features/routine-agents/server/engines/opencode'
import type { EngineInput } from '@/features/routine-agents/server/engines/types'
import { EMPTY_ROUTINE_LIMITS } from '@/features/routine-agents/schemas'

const RUN_ID = 'abcdef0123456789abcdef01'
const MCP = 'rotina_abcdef01'

function engineInput(opencodeSessionId: string | null = null) {
  const activation = { runId: RUN_ID, controller: new AbortController(), outcome: null, stopReason: null, warnings: [] as string[], baseActiveMs: 0 }
  const usage: unknown[] = []
  const input = {
    agent: { name: 'Vagas', slug: 'vagas' },
    run: { _id: RUN_ID, seq: 1, opencodeSessionId, snapshot: { limits: EMPTY_ROUTINE_LIMITS, opencode: { agent: 'build', model: 'anthropic/claude', variant: null, enabledMcps: ['playwright', 'sumiu'] } } },
    activation,
    instructions: (prefix: string) => `use ${prefix}finish`,
    message: 'comece',
    internalTools: [],
    onStep: () => undefined,
    onUsage: (step: unknown) => void usage.push(step),
  } as unknown as EngineInput
  return { input, activation, usage }
}

beforeEach(() => {
  holder.clientError = null
  holder.base = 'https://opex.example'
  holder.hostMcps = ['playwright', 'github']
  holder.existing = new Set()
  holder.calls = { add: [], remove: [], create: [], update: [], turns: [] }
  holder.runUpdates = []
  holder.turnOutcome = { outcome: 'done', message: null }
})

describe('routineSessionPermissions', () => {
  it('nega os MCPs do host não liberados e libera o MCP da execução', () => {
    expect(routineSessionPermissions(['playwright', 'github', MCP], ['playwright'], MCP)).toEqual([
      { action: 'github_*', resource: '*', effect: 'deny' },
      { action: `${MCP}_*`, resource: '*', effect: 'allow' },
    ])
  })
})

describe('runOpencodeEngine', () => {
  it('serviço OpenCode indisponível vira Erro sem abrir sessão', async () => {
    holder.clientError = new Error('ECONNREFUSED')
    const result = await runOpencodeEngine(engineInput().input)
    expect(result.error).toBe('Serviço OpenCode indisponível: ECONNREFUSED')
    expect(holder.calls.create).toEqual([])
  })

  it('sem URL pública do Opex, recusa com a orientação e remove o MCP', async () => {
    holder.base = null
    const result = await runOpencodeEngine(engineInput().input)
    expect(result.error).toContain('Configure a URL pública do Opex')
    expect(holder.calls.add).toEqual([])
  })

  it('caminho feliz: MCP da execução com segredo só em hash, permissões, uso registrado e MCP removido no fim', async () => {
    const { input, activation, usage } = engineInput()
    const result = await runOpencodeEngine(input)
    expect(result).toMatchObject({ error: null, text: 'Pronto', sessionId: 'ses_nova' })
    const added = holder.calls.add[0] as { server: string; config: { url: string; headers: { Authorization: string } } }
    expect(added.server).toBe(MCP)
    expect(added.config.url).toBe(`https://opex.example/api/routine-agents/mcp/${RUN_ID}`)
    const secret = added.config.headers.Authorization.replace('Bearer ', '')
    expect(JSON.stringify(holder.runUpdates)).not.toContain(secret)
    expect(holder.runUpdates[0]).toEqual({ $set: { mcp: { name: MCP, secretHash: hashMcpSecret(secret) } } })
    expect((holder.calls.create[0] as { permissions: unknown }).permissions).toEqual([
      { action: 'github_*', resource: '*', effect: 'deny' },
      { action: `${MCP}_*`, resource: '*', effect: 'allow' },
    ])
    expect(activation.warnings).toEqual(['O MCP "sumiu" foi liberado mas não existe mais no opencode.jsonc do host: a execução segue sem ele.'])
    expect(usage).toEqual([expect.objectContaining({ tokens: 16, provider: 'opencode', recorded: true })])
    expect(holder.calls.remove).toEqual([expect.objectContaining({ server: MCP })])
  })

  it('sessão antiga que não existe mais: aviso e sessão nova; sessão existente é reaproveitada com as permissões atualizadas', async () => {
    const missing = engineInput('ses_velha')
    expect((await runOpencodeEngine(missing.input)).sessionId).toBe('ses_nova')
    expect(missing.activation.warnings).toContain('A sessão anterior do OpenCode não existe mais: a execução continuou numa sessão nova.')
    holder.calls.create = []
    holder.existing.add('ses_viva')
    const alive = engineInput('ses_viva')
    expect((await runOpencodeEngine(alive.input)).sessionId).toBe('ses_viva')
    expect(holder.calls.create).toEqual([])
    expect(holder.calls.update).toEqual([expect.objectContaining({ sessionID: 'ses_viva' })])
  })

  it('turno que falha no OpenCode vira Erro com a mensagem', async () => {
    holder.turnOutcome = { outcome: 'failed', message: 'Modelo indisponível' }
    expect((await runOpencodeEngine(engineInput().input)).error).toBe('Modelo indisponível')
  })
})

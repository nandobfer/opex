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
  listError: false,
  skillListError: false,
  // Diretório "frio" (OPE-158): quantas leituras da lista de skills voltam vazias antes da lista completa.
  coldSkillReads: 0,
  skillReads: 0,
  hostSkills: [{ id: 'revisar-pr', name: 'revisar-pr' }, { id: 'customize-opencode', name: 'customize-opencode' }] as { id: string; name: string }[],
  updateError: false,
  runFilters: [] as unknown[],
  ownCount: 1,
  active: {} as Record<string, boolean>,
  interrupted: [] as string[],
}))

vi.mock('@/lib/db/models/RoutineAgent', () => ({
  RoutineRun: {
    updateOne: async (filter: unknown, update: unknown) => void (holder.runFilters.push(filter), holder.runUpdates.push(update)),
    countDocuments: async () => holder.ownCount,
  },
}))
vi.mock('@/features/routine-agents/server/workdir', () => ({ ensureRoutineWorkdir: async (slug: string) => `/home/burgos/opex-rotineiros/${slug}` }))
vi.mock('@/features/ai/server/self-memory/mcp', () => ({ opexPublicBaseUrl: async () => holder.base }))
vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: async () => {
    if (holder.clientError) throw holder.clientError
    return {
      mcp: {
        list: async () => {
          if (holder.listError) throw new Error('timeout')
          return { data: holder.hostMcps.map((name) => ({ name })) }
        },
        add: async (args: unknown) => void holder.calls.add.push(args),
        remove: async (args: unknown) => void holder.calls.remove.push(args),
      },
      skill: {
        list: async () => {
          if (holder.skillListError) throw new Error('skills fora do ar')
          holder.skillReads++
          if (holder.skillReads <= holder.coldSkillReads) return { data: [] }
          return { data: holder.hostSkills.map((skill) => ({ ...skill, path: `/x/${skill.id}`, content: '' })) }
        },
      },
      session: {
        get: async ({ sessionID }: { sessionID: string }) => {
          if (!holder.existing.has(sessionID)) throw new Error('not found')
          return { id: sessionID }
        },
        update: async (args: unknown) => {
          if (holder.updateError) throw new Error('falhou')
          holder.calls.update.push(args)
        },
        create: async (args: unknown) => (holder.calls.create.push(args), { id: 'ses_nova' }),
        active: async () => ({ ...holder.active }),
        interrupt: async ({ sessionID }: { sessionID: string }) => {
          holder.interrupted.push(sessionID)
          delete holder.active[sessionID]
        },
        instructions: { entry: { put: async () => undefined } },
      },
    }
  },
}))
// A espera entre leituras da lista de skills não usa timer real nos testes.
vi.mock('@/lib/ai/opencode-skill-list', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/opencode-skill-list')>()
  return { ...actual, listOpencodeSkillsAt: (client: Parameters<typeof actual.listOpencodeSkillsAt>[0], directory: string, options: Parameters<typeof actual.listOpencodeSkillsAt>[2] = {}) => actual.listOpencodeSkillsAt(client, directory, { ...options, wait: async () => undefined }) }
})
vi.mock('@/lib/ai/opencode-run', () => ({
  runAgentTurn: async (_client: unknown, args: unknown, hooks: { onStep: (usage: unknown) => void; onText: (delta: string) => void }) => {
    holder.calls.turns.push(args)
    hooks.onText('Pronto')
    hooks.onStep({ tokens: { input: 10, output: 5, reasoning: 1 }, costUsd: 0.01, stepId: 's1' })
    return holder.turnOutcome
  },
}))

import { hashMcpSecret, routineSessionPermissions, routineSkillPermissions, runOpencodeEngine } from '@/features/routine-agents/server/engines/opencode'
import type { EngineInput } from '@/features/routine-agents/server/engines/types'
import { EMPTY_ROUTINE_LIMITS } from '@/features/routine-agents/schemas'

const RUN_ID = 'abcdef0123456789abcdef01'
const MCP = 'rotina_abcdef01'

function engineInput(opencodeSessionId: string | null = null) {
  const activation = { runId: RUN_ID, controller: new AbortController(), outcome: null, stopReason: null, warnings: [] as string[], baseActiveMs: 0 }
  const usage: unknown[] = []
  const input = {
    agent: { name: 'Vagas', slug: 'vagas' },
    run: { _id: RUN_ID, seq: 1, activationId: 'ativ-1', opencodeSessionId, snapshot: { limits: EMPTY_ROUTINE_LIMITS, opencode: { agent: 'build', model: 'anthropic/claude', variant: null, enabledMcps: ['playwright', 'sumiu'] } } },
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
  holder.listError = false
  holder.skillListError = false
  holder.coldSkillReads = 0
  holder.skillReads = 0
  holder.hostSkills = [{ id: 'revisar-pr', name: 'revisar-pr' }, { id: 'customize-opencode', name: 'customize-opencode' }]
  holder.updateError = false
  holder.runFilters = []
  holder.ownCount = 1
  holder.active = {}
  holder.interrupted = []
  delete process.env.OPEX_PREVIEW
  delete process.env.OPEX_PREVIEW_URL
})

describe('routineSessionPermissions', () => {
  it('nega os MCPs do host não liberados e libera o MCP da execução', () => {
    expect(routineSessionPermissions(['playwright', 'github', MCP], ['playwright'], MCP)).toEqual([
      { action: 'github_*', resource: '*', effect: 'deny' },
      { action: `${MCP}_*`, resource: '*', effect: 'allow' },
    ])
  })
})

describe('routineSkillPermissions (OPE-153)', () => {
  it('nega todas as skills (inclusive nativas) e libera só as selecionadas que existem no host', () => {
    const host = [
      { id: 'revisar-pr', name: 'revisar-pr' },
      { id: 'customize-opencode', name: 'customize-opencode' },
      { id: 'git-release', name: 'Git Release' },
    ]
    expect(routineSkillPermissions(host, ['customize-opencode', 'Git Release', 'sumiu'])).toEqual({
      rules: [
        { action: 'skill', resource: '*', effect: 'deny' },
        { action: 'skill', resource: 'customize-opencode', effect: 'allow' },
        { action: 'skill', resource: 'git-release', effect: 'allow' },
      ],
      missing: ['sumiu'],
    })
  })

  it('OPE-158: casa a skill liberada pelo nome normalizado ou id qualificado e libera pelo id do OpenCode', () => {
    const host = [{ id: 'user/refinar-issue', name: 'Refinar Issue' }, { id: 'opencode', name: 'OpenCode' }]
    expect(routineSkillPermissions(host, [' refinar-issue ', 'opencode', 'OpenCode']).rules).toEqual([
      { action: 'skill', resource: '*', effect: 'deny' },
      { action: 'skill', resource: 'user/refinar-issue', effect: 'allow' },
      { action: 'skill', resource: 'opencode', effect: 'allow' },
    ])
  })

  it('sem seleção, só a negação geral', () => {
    expect(routineSkillPermissions([{ id: 'a', name: 'a' }], []).rules).toEqual([{ action: 'skill', resource: '*', effect: 'deny' }])
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
      // OPE-153 (D3): snapshot antigo sem skills = nenhuma liberada, inclusive as nativas.
      { action: 'skill', resource: '*', effect: 'deny' },
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

  it('OPE-147: retomada com o turno antigo ainda ativo no host interrompe-o e continua na mesma sessão', async () => {
    holder.existing.add('ses_viva')
    holder.active = { ses_viva: true }
    const { input } = engineInput('ses_viva')
    expect((await runOpencodeEngine(input)).sessionId).toBe('ses_viva')
    expect(holder.interrupted).toEqual(['ses_viva'])
    expect(holder.calls.create).toEqual([])
    expect((holder.calls.turns[0] as { sessionId: string }).sessionId).toBe('ses_viva')
  })

  it('OPE-147: sessão ociosa não é interrompida; as gravações conferem a ativação dona', async () => {
    holder.existing.add('ses_viva')
    await runOpencodeEngine(engineInput('ses_viva').input)
    expect(holder.interrupted).toEqual([])
    expect(holder.runFilters).toEqual([{ _id: RUN_ID, activationId: 'ativ-1' }])
  })

  it('OPE-147: execução já retomada noutra ativação: o turno antigo não remove o MCP dela', async () => {
    holder.ownCount = 0
    await runOpencodeEngine(engineInput().input)
    expect(holder.calls.remove).toEqual([])
  })

  it('OPE-147: numa prévia, o MCP da execução aponta para a própria prévia', async () => {
    process.env.OPEX_PREVIEW = '1'
    process.env.OPEX_PREVIEW_URL = 'http://192.168.0.64:4021/'
    await runOpencodeEngine(engineInput().input)
    expect((holder.calls.add[0] as { config: { url: string } }).config.url).toBe(`http://192.168.0.64:4021/api/routine-agents/mcp/${RUN_ID}`)
  })

  it('falha fechada: sem a lista de MCPs do host, a execução vira Erro sem abrir sessão nem registrar o MCP', async () => {
    holder.listError = true
    const result = await runOpencodeEngine(engineInput().input)
    expect(result.error).toContain('Não foi possível listar os MCPs do host')
    expect(holder.calls.add).toEqual([])
    expect(holder.calls.create).toEqual([])
  })

  it('sessão antiga cujas permissões não puderam ser atualizadas: abre uma sessão nova com as permissões atuais', async () => {
    holder.existing.add('ses_viva')
    holder.updateError = true
    const { input, activation } = engineInput('ses_viva')
    expect((await runOpencodeEngine(input)).sessionId).toBe('ses_nova')
    expect(activation.warnings).toContain('Não foi possível atualizar as permissões da sessão anterior do OpenCode: a execução continuou numa sessão nova.')
    expect((holder.calls.create[0] as { permissions: unknown[] }).permissions).toContainEqual({ action: 'github_*', resource: '*', effect: 'deny' })
  })

  it('OPE-153: skills selecionadas liberadas na sessão; a que sumiu do host vira aviso e é ignorada', async () => {
    const { input, activation } = engineInput()
    ;(input.run.snapshot.opencode as { enabledSkills?: string[] }).enabledSkills = ['customize-opencode', 'apagada']
    await runOpencodeEngine(input)
    const permissions = (holder.calls.create[0] as { permissions: unknown[] }).permissions
    expect(permissions).toContainEqual({ action: 'skill', resource: '*', effect: 'deny' })
    expect(permissions).toContainEqual({ action: 'skill', resource: 'customize-opencode', effect: 'allow' })
    expect(permissions).not.toContainEqual(expect.objectContaining({ resource: 'revisar-pr' }))
    expect(activation.warnings).toContain('A skill "apagada" foi liberada mas não existe mais no OpenCode do host: a execução segue sem ela.')
  })

  it('OPE-158: diretório frio (lista vazia nas primeiras leituras) espera as skills e libera a selecionada sem aviso falso', async () => {
    holder.coldSkillReads = 2
    const { input, activation } = engineInput()
    ;(input.run.snapshot.opencode as { enabledSkills?: string[] }).enabledSkills = ['customize-opencode']
    await runOpencodeEngine(input)
    const permissions = (holder.calls.create[0] as { permissions: unknown[] }).permissions
    expect(permissions).toContainEqual({ action: 'skill', resource: 'customize-opencode', effect: 'allow' })
    expect(activation.warnings.some((warning) => warning.includes('customize-opencode'))).toBe(false)
    expect(holder.skillReads).toBe(3)
  })

  it('OPE-153: falha fechada — sem a lista de skills do host, a execução vira Erro sem abrir sessão nem registrar o MCP', async () => {
    holder.skillListError = true
    const result = await runOpencodeEngine(engineInput().input)
    expect(result.error).toContain('Não foi possível listar as skills do host')
    expect(holder.calls.add).toEqual([])
    expect(holder.calls.create).toEqual([])
  })

  it('turno que falha no OpenCode vira Erro com a mensagem', async () => {
    holder.turnOutcome = { outcome: 'failed', message: 'Modelo indisponível' }
    expect((await runOpencodeEngine(engineInput().input)).error).toBe('Modelo indisponível')
  })
})

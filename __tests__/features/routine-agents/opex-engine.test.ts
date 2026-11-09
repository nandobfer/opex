import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { OpexTool } from '@/features/opex-agent/server/tools/define'

/**
 * Motor Opex dos agentes rotineiros (OPE-130): interceptação D4 (com os ajustes de confirmação do dono
 * mesclados aos dos MCPs, como no runner do Agente Opex), ferramentas desligadas no Agente Opex, grupo
 * `routine-agents` proibido e aviso de ferramenta removida. `streamText` é simulado: chama a
 * ferramenta pedida pelo "modelo" e termina.
 */

const holder = vi.hoisted(() => ({
  calls: [] as { name: string; args: unknown }[],
  results: [] as unknown[],
  toolNames: [] as string[],
  sent: [] as unknown[],
  settings: { disabledTools: [] as string[], confirmationOverrides: {} as Record<string, boolean> },
  catalog: new Map<string, OpexTool>(),
  executed: [] as string[],
  stepCosts: [] as unknown[],
  prepared: [] as unknown[],
}))

vi.mock('ai', () => ({
  dynamicTool: (def: unknown) => def,
  isLoopFinished: () => () => false,
  streamText: ({ tools, messages }: { messages: unknown[]; tools: Record<string, { execute: (raw: unknown, options: object) => Promise<unknown> }> }) => {
    holder.toolNames = Object.keys(tools)
    holder.sent = messages
    return {
      fullStream: (async function* () {
        for (const call of holder.calls) holder.results.push(await tools[call.name]!.execute(call.args, {}))
        yield { type: 'finish-step', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
      })(),
      responseMessages: Promise.resolve([]),
    }
  },
}))
vi.mock('@/lib/ai/stream', () => ({
  prepareModel: async (request: unknown) => {
    holder.prepared.push(request)
    return { model: {}, providerOptions: {}, reasoning: null, apiKeyId: 'key_x', takeStepCost: () => holder.stepCosts.shift() ?? null, dispose: async () => undefined }
  },
  describeAiError: (error: unknown) => String(error),
  samplingOptions: () => ({}),
}))
vi.mock('@/features/opex-agent/server/settings', () => ({ loadOpexSettings: async () => ({ settings: holder.settings }) }))
vi.mock('@/features/opex-agent/server/tools/registry', async () => {
  const { toolConfirms } = await import('@/features/opex-agent/tool-tree')
  return {
    findOpexTool: (name: string) => holder.catalog.get(name),
    enabledOpexTools: (disabled: readonly string[]) => [...holder.catalog.values()].filter((tool) => !disabled.includes(tool.name)),
    needsConfirmation: (tool: OpexTool, overrides: Record<string, boolean> = {}) => toolConfirms(tool, overrides),
  }
})

import { runOpexEngine, TURN_ALREADY_CLOSED } from '@/features/routine-agents/server/engines/opex'
import { ROUTINE_HISTORY_CHAR_BUDGET } from '@/features/routine-agents/history'
import type { EngineInput } from '@/features/routine-agents/server/engines/types'
import type { Activation } from '@/features/routine-agents/server/hub'

const tool = (name: string, risk: OpexTool['risk'], group = 'tasks', extra: Partial<OpexTool> = {}): OpexTool =>
  ({
    name,
    label: name,
    description: name,
    group,
    risk,
    input: z.object({ x: z.number().optional() }),
    execute: async () => {
      holder.executed.push(name)
      return { ok: true }
    },
    ...extra,
  }) as unknown as OpexTool

function engineInput(enabledTools: string[], confirmIrreversible = true, messages: string | null = null, onUsage: EngineInput['onUsage'] = () => undefined, provider = 'anthropic'): { input: EngineInput; activation: Activation; steps: string[] } {
  const activation = { runId: 'r'.repeat(24), controller: new AbortController(), outcome: null, stopReason: null, warnings: [] as string[], usage: { tokens: 0, costUsd: null }, baseTokens: 0 } as unknown as Activation
  const steps: string[] = []
  const input = {
    agent: { name: 'Vagas' },
    run: { snapshot: { confirmIrreversible, opex: { provider, model: 'claude', variant: null, enabledTools, enabledMcpServers: [] } }, messages },
    activation,
    instructions: () => '',
    message: 'comece',
    internalTools: [],
    onStep: (step: { label: string }) => void steps.push(step.label),
    onUsage,
  } as unknown as EngineInput
  return { input, activation, steps }
}

beforeEach(() => {
  holder.calls = []
  holder.results = []
  holder.executed = []
  holder.stepCosts = []
  holder.prepared = []
  holder.settings = { disabledTools: [], confirmationOverrides: {} }
  holder.catalog = new Map(
    [tool('delete_task', 'destructive'), tool('update_task', 'write'), tool('list_tasks', 'read'), tool('confirm_routine_action', 'write', 'routine-agents'), tool('update_routine_agent', 'write', 'routine-agents')].map((item) => [item.name, item]),
  )
})

describe('motor Opex — consumo por chave de API (OPE-155)', () => {
  it('o uso de cada passo leva a chave usada na preparação do modelo', async () => {
    const { input } = engineInput([])
    const usages: unknown[] = []
    ;(input as { onUsage: (step: unknown) => void }).onUsage = (step) => void usages.push(step)
    await runOpexEngine(input)
    expect(usages).toEqual([expect.objectContaining({ provider: 'anthropic', model: 'claude', apiKeyId: 'key_x' })])
  })
})

describe('motor Opex — custo do passo (OPE-154)', () => {
  it('OpenCode Go: cada passo repassa ao onUsage o custo e o billing do medidor, com a sessão estável da execução', async () => {
    holder.stepCosts = [{ costUsd: 0.0002, billing: { source: 'go', allowanceUsd: 0.0002, listCostUsd: 0.0003 } }]
    const usages: unknown[] = []
    const { input } = engineInput([], true, null, (step) => void usages.push(step), 'opencode-go')
    const result = await runOpexEngine(input)
    expect(result.error).toBeNull()
    expect(holder.prepared[0]).toMatchObject({ provider: 'opencode-go', session: `opex-routine-${'r'.repeat(24)}` })
    expect(usages).toEqual([
      expect.objectContaining({ provider: 'opencode-go', tokens: 2, costUsd: 0.0002, billing: { source: 'go', allowanceUsd: 0.0002, listCostUsd: 0.0003 }, stepId: '1' }),
    ])
  })

  it('provedor sem custo informado: costUsd e billing null, sem erro no motor', async () => {
    const usages: unknown[] = []
    const { input } = engineInput([], true, null, (step) => void usages.push(step))
    const result = await runOpexEngine(input)
    expect(result.error).toBeNull()
    expect(usages).toEqual([expect.objectContaining({ costUsd: null, billing: null })])
  })
})

describe('motor Opex — interceptação D4', () => {
  it('destrutiva com o switch ligado vira Aguardando confirmação sem executar; o input completo segue para a confirmação', async () => {
    holder.calls = [{ name: 'delete_task', args: { x: 7 } }]
    const { input, activation } = engineInput(['delete_task'])
    await runOpexEngine(input)
    expect(holder.executed).toEqual([])
    expect(holder.results[0]).toMatchObject({ status: 'confirmation_required' })
    expect(activation.outcome).toMatchObject({ kind: 'confirmation', action: { kind: 'tool', toolName: 'delete_task', input: JSON.stringify({ x: 7 }) } })
  })

  it('com o switch desligado a destrutiva executa direto', async () => {
    holder.calls = [{ name: 'delete_task', args: {} }]
    const { input, activation } = engineInput(['delete_task'], false)
    await runOpexEngine(input)
    expect(holder.executed).toEqual(['delete_task'])
    expect(activation.outcome).toBeNull()
  })

  it('ajuste do dono que exige confirmação numa ferramenta de escrita vale no rotineiro', async () => {
    holder.settings.confirmationOverrides = { update_task: true }
    holder.calls = [{ name: 'update_task', args: {} }]
    const { input, activation } = engineInput(['update_task'])
    await runOpexEngine(input)
    expect(holder.executed).toEqual([])
    expect(activation.outcome).toMatchObject({ kind: 'confirmation', action: { toolName: 'update_task' } })
  })

  it('ajuste do dono que libera uma destrutiva executa sem parar', async () => {
    holder.settings.confirmationOverrides = { delete_task: false }
    holder.calls = [{ name: 'delete_task', args: {} }]
    const { input, activation } = engineInput(['delete_task'])
    await runOpexEngine(input)
    expect(holder.executed).toEqual(['delete_task'])
    expect(activation.outcome).toBeNull()
  })
})

describe('motor Opex — ferramentas liberadas', () => {
  it('desligada no Agente Opex, removida do catálogo e do grupo routine-agents ficam fora, com aviso', async () => {
    holder.settings.disabledTools = ['update_task']
    const { input, activation } = engineInput(['list_tasks', 'update_task', 'sumiu', 'confirm_routine_action', 'update_routine_agent'])
    await runOpexEngine(input)
    expect(holder.toolNames).toEqual(['list_tasks'])
    expect(activation.warnings).toEqual([
      'A ferramenta "update_task" está desligada no Agente Opex: a execução segue sem ela.',
      'A ferramenta "sumiu" foi liberada mas não existe mais no Opex: a execução segue sem ela.',
      'A ferramenta "confirm_routine_action" não pode ser usada por agentes rotineiros: a execução segue sem ela.',
      'A ferramenta "update_routine_agent" não pode ser usada por agentes rotineiros: a execução segue sem ela.',
    ])
  })
})

describe('motor Opex — uma ferramenta por vez depois de encerrar o turno', () => {
  it('duas ferramentas com confirmação no mesmo passo: a primeira fica pendente e a segunda não executa nem sobrescreve', async () => {
    holder.calls = [
      { name: 'delete_task', args: { x: 1 } },
      { name: 'update_task', args: { x: 2 } },
    ]
    holder.settings.confirmationOverrides = { update_task: true }
    const { input, activation } = engineInput(['delete_task', 'update_task'])
    await runOpexEngine(input)
    expect(activation.outcome).toMatchObject({ kind: 'confirmation', action: { toolName: 'delete_task', input: JSON.stringify({ x: 1 }) } })
    expect(holder.results[1]).toEqual(TURN_ALREADY_CLOSED)
    expect(holder.executed).toEqual([])
  })

  it('escrita chamada depois de uma confirmação no mesmo passo não roda', async () => {
    holder.calls = [
      { name: 'delete_task', args: {} },
      { name: 'list_tasks', args: {} },
    ]
    const { input } = engineInput(['delete_task', 'list_tasks'])
    await runOpexEngine(input)
    expect(holder.executed).toEqual([])
    expect(holder.results[1]).toEqual(TURN_ALREADY_CLOSED)
  })
})

describe('motor Opex — histórico entre ativações', () => {
  it('acima do orçamento: mantém o disparo e as ativações recentes, avisa as omitidas e tira o raciocínio passado', async () => {
    const big = 'x'.repeat(Math.ceil(ROUTINE_HISTORY_CHAR_BUDGET / 3))
    const stored = [
      { role: 'user', content: 'disparo: candidate-se às vagas' },
      { role: 'assistant', content: [{ type: 'reasoning', text: 'pensando' }, { type: 'text', text: 'ok' }] },
      ...Array.from({ length: 6 }, (_, index) => [
        { role: 'user', content: `retomada ${index}` },
        { role: 'assistant', content: [{ type: 'text', text: big }] },
      ]).flat(),
    ]
    const { input } = engineInput([], true, JSON.stringify(stored))
    const result = await runOpexEngine(input)
    const sent = holder.sent as { role: string; content: unknown }[]
    expect(sent[0]).toEqual({ role: 'user', content: 'disparo: candidate-se às vagas' })
    expect(sent[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'ok' }] })
    expect(String(sent[2]!.content)).toMatch(/ativações intermediárias desta execução foram omitidas/)
    const texts = sent.filter((message) => message.role === 'user').map((message) => String(message.content))
    expect(texts).toContain('retomada 5')
    expect(texts).not.toContain('retomada 0')
    expect(JSON.stringify(sent).length).toBeLessThan(ROUTINE_HISTORY_CHAR_BUDGET * 1.2)
    expect(sent.at(-1)).toEqual({ role: 'user', content: 'comece' })
    expect(JSON.parse(result.messages!).length).toBeLessThan(stored.length + 1)
  })
})

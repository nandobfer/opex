import { z } from "zod"
import {
    DEFAULT_ROUTINE_AGENT_INPUT,
    routineAgentInputSchema,
    routineLimitsSchema,
    routineOpencodeEngineSchema,
    routineOpexEngineSchema,
    routineTriggerSchema,
    type RoutineAgentInput,
} from "@/features/routine-agents/schemas"
import { ROUTINE_RUN_STATUSES } from "@/features/routine-agents/status"
import type { RoutineAgentDto } from "@/features/routine-agents/types"
import { defineTool, OpexToolError, type OpexTool, type OpexToolContext } from "./define"

/**
 * Agentes rotineiros (OPE-130), só no dono: chamam os serviços reais (sem HTTP). Nenhuma saída traz o
 * token do agente no Engramind (os DTOs não o têm). Destrutivas: arquivar e cancelar execução.
 */

const id = z.string().regex(/^[a-f0-9]{24}$/, "Id inválido")

const agentFields = {
    name: z.string().optional().describe("Nome único, só o papel (ex.: \"Recrutador\"; dele nasce o slug, que não muda). Vazio: o provisionamento gera"),
    objective: z.string().optional().describe("Objetivo do agente. Vazio: o provisionamento gera a partir das instruções (objetivo ou instruções são obrigatórios)"),
    instructions: z.string().optional().describe("Instruções em markdown"),
    engine: z.enum(["opex", "opencode"]).optional().describe("Motor: opex (provedores do app) ou opencode (OpenCode no host)"),
    opex: routineOpexEngineSchema.partial().optional().describe("Motor Opex: provider, model, variant, enabledTools (nomes das ferramentas do Agente Opex), enabledMcpServers (ids)"),
    opencode: routineOpencodeEngineSchema.partial().optional().describe("Motor OpenCode: model (provedor/modelo), variant, agent, enabledMcps (nomes do opencode.jsonc)"),
    confirmIrreversible: z.boolean().optional().describe("Pedir confirmação antes de ações irreversíveis (padrão: sim)"),
    limits: routineLimitsSchema.partial().optional().describe("concurrency, maxActiveMinutes, maxWaitingMinutes, maxTokens, maxLiveWaitMinutes (null = sem limite)"),
    triggers: z.array(routineTriggerSchema).optional().describe("Gatilhos: interval, daily, weekly, once (YYYY-MM-DDTHH:mm, Brasília) e webhook"),
}

function mergeInput(base: RoutineAgentInput, patch: Partial<Record<keyof typeof agentFields, unknown>>): RoutineAgentInput {
    const p = patch as Partial<RoutineAgentInput> & { opex?: Partial<RoutineAgentInput["opex"]>; opencode?: Partial<RoutineAgentInput["opencode"]>; limits?: Partial<RoutineAgentInput["limits"]> }
    return routineAgentInputSchema.parse({
        ...base,
        ...Object.fromEntries(Object.entries(p).filter(([, value]) => value !== undefined)),
        opex: { ...base.opex, ...(p.opex ?? {}) },
        opencode: { ...base.opencode, ...(p.opencode ?? {}) },
        limits: { ...base.limits, ...(p.limits ?? {}) },
    })
}

const inputOf = (agent: RoutineAgentDto): RoutineAgentInput => ({
    name: agent.name,
    objective: agent.objective,
    instructions: agent.instructions,
    engine: agent.engine,
    opex: agent.opex,
    opencode: agent.opencode,
    confirmIrreversible: agent.confirmIrreversible,
    limits: agent.limits,
    triggers: agent.triggers,
})

/**
 * Pelo token de sistema, o agente rotineiro não pode ganhar mais alcance que o próprio token (F2): cada
 * ferramenta NOVA em `opex.enabledTools` precisa da mesma decisão que o token teria para chamá-la
 * (grupos fora dos tokens, como `http` e `files`, nunca), e MCPs do app/host e a Chamada HTTP do motor
 * OpenCode não são ligados por token. O que o dono já tinha configurado continua como está.
 */
export async function assertTokenRoutineReach(origin: OpexToolContext["origin"], next: RoutineAgentInput, current: RoutineAgentInput | null): Promise<void> {
    if (origin?.kind !== "api-token") return
    const scopes = origin.scopes ?? []
    const { findOpexTool } = await import("./registry")
    const { mcpOwnerToolDecision } = await import("@/features/integrations/api-tokens/scopes")
    const { isAlwaysOnGroup } = await import("@/features/opex-agent/tool-tree")
    const had = new Set(current?.opex.enabledTools ?? [])
    const refused = next.opex.enabledTools.filter((name) => {
        if (had.has(name)) return false
        const tool = findOpexTool(name)
        if (!tool) return true
        return !mcpOwnerToolDecision(scopes, { name: tool.name, group: tool.group, risk: tool.risk, confirmByDefault: tool.confirmByDefault, alwaysOn: isAlwaysOnGroup(tool.group) }).ok
    })
    if (refused.length) throw new OpexToolError(`O token não pode liberar ao agente rotineiro ferramentas que ele mesmo não pode usar: ${refused.join(", ")}. Libere pela tela do agente (dono).`)
    const hadMcps = new Set([...(current?.opex.enabledMcpServers ?? []), ...(current?.opencode.enabledMcps ?? [])])
    const newMcps = [...next.opex.enabledMcpServers, ...next.opencode.enabledMcps].filter((name) => !hadMcps.has(name))
    if (newMcps.length) throw new OpexToolError(`MCPs do agente rotineiro só são liberados pelo dono, na tela do agente: ${newMcps.join(", ")}.`)
    if (next.opencode.httpRequests === true && current?.opencode.httpRequests !== true) throw new OpexToolError("A Chamada HTTP do motor OpenCode só é ligada pelo dono, na tela do agente.")
}

const service = () => import("@/features/routine-agents/server/service")
const runs = () => import("@/features/routine-agents/server/runs")
const actions = () => import("@/features/routine-agents/server/run-actions")

export const routineAgentTools: OpexTool[] = [
    defineTool({
        name: "list_routine_agents",
        group: "routine-agents",
        label: "Agentes rotineiros",
        risk: "read",
        description: "Lista os agentes rotineiros (status, provisionamento, última execução e próximo disparo). arquivados=true lista só os arquivados.",
        input: z.object({ arquivados: z.boolean().optional() }),
        execute: async (input) => (await service()).listRoutineAgents(input.arquivados ? "archived" : "current"),
    }),
    defineTool({
        name: "get_routine_agent",
        group: "routine-agents",
        label: "Agente rotineiro",
        risk: "read",
        description: "Lê a configuração de um agente rotineiro (motor, modelo, ferramentas, limites, gatilhos e canais do Engramind).",
        input: z.object({ id }),
        execute: async (input) => (await service()).getRoutineAgent(input.id),
    }),
    defineTool({
        name: "create_routine_agent",
        group: "routine-agents",
        label: "Criar agente rotineiro",
        risk: "write",
        description: "Cria um agente rotineiro. O subagente de provisionamento roda sozinho em seguida (Engramind, token e canais). Sem motor informado, usa o Opex.",
        input: z.object(agentFields),
        summarize: (input) => (input.name?.trim() ? `Criar o agente rotineiro "${input.name.trim()}"` : "Criar um agente rotineiro (nome gerado pelo provisionamento)"),
        execute: async (input, ctx) => {
            const next = mergeInput(DEFAULT_ROUTINE_AGENT_INPUT, input)
            await assertTokenRoutineReach(ctx.origin, next, null)
            return (await service()).createRoutineAgent(next, ctx.actorId)
        },
    }),
    defineTool({
        name: "update_routine_agent",
        group: "routine-agents",
        label: "Editar agente rotineiro",
        risk: "write",
        description: "Altera a configuração de um agente rotineiro (só os campos informados). Não reprovisiona; motor e modelo valem para as próximas execuções.",
        input: z.object({ id, ...Object.fromEntries(Object.entries(agentFields).map(([key, schema]) => [key, (schema as z.ZodType).optional()])) }) as z.ZodType<{ id: string } & Partial<Record<keyof typeof agentFields, unknown>>>,
        summarize: (input) => `Editar o agente rotineiro ${input.id}`,
        execute: async (input, ctx) => {
            const { id: agentId, ...patch } = input
            const current = await (await service()).getRoutineAgent(agentId)
            const before = inputOf(current)
            const next = mergeInput(before, patch)
            await assertTokenRoutineReach(ctx.origin, next, before)
            return (await service()).updateRoutineAgent(agentId, next, ctx.actorId)
        },
    }),
    defineTool({
        name: "pause_routine_agent",
        group: "routine-agents",
        label: "Pausar/retomar agente rotineiro",
        risk: "write",
        description: "Pausa (agendados não disparam, webhook 409) ou retoma (pausar=false) um agente rotineiro. As execuções em andamento terminam normalmente.",
        input: z.object({ id, pausar: z.boolean().default(true) }),
        summarize: (input) => `${input.pausar ? "Pausar" : "Retomar"} o agente rotineiro ${input.id}`,
        execute: async (input, ctx) => (await service()).setRoutineAgentStatus(input.id, input.pausar ? "pause" : "resume", ctx.actorId),
    }),
    defineTool({
        name: "archive_routine_agent",
        group: "routine-agents",
        label: "Arquivar agente rotineiro",
        risk: "destructive",
        description: "Arquiva (ou desarquiva com arquivar=false) um agente rotineiro: tem os efeitos da pausa e sai da barra lateral e da lista padrão. O Engramind fica intacto.",
        input: z.object({ id, arquivar: z.boolean().default(true) }),
        summarize: (input) => `${input.arquivar ? "Arquivar" : "Desarquivar"} o agente rotineiro ${input.id}`,
        execute: async (input, ctx) => (await service()).setRoutineAgentStatus(input.id, input.arquivar ? "archive" : "unarchive", ctx.actorId),
    }),
    defineTool({
        name: "reprovision_routine_agent",
        group: "routine-agents",
        label: "Reprovisionar agente rotineiro",
        risk: "write",
        description: "Reprovisionar: reavalia os canais extras do Engramind (só acrescenta; nunca remove opex, o global dos rotineiros nem o canal próprio). tentarDeNovo=true retoma um provisionamento com erro.",
        input: z.object({ id, tentarDeNovo: z.boolean().optional() }),
        summarize: (input) => `${input.tentarDeNovo ? "Tentar de novo o provisionamento" : "Reprovisionar"} do agente rotineiro ${input.id}`,
        execute: async (input, ctx) => (await service()).reprovisionRoutineAgent(input.id, input.tentarDeNovo ? "retry" : "reprovision", ctx.actorId),
    }),
    defineTool({
        name: "run_routine_agent",
        group: "routine-agents",
        label: "Executar agente rotineiro",
        risk: "write",
        description: "Dispara uma execução do agente rotineiro agora, com a solicitação opcional desta execução. Devolve o id e o status (na fila ou executando).",
        input: z.object({ id, solicitacao: z.string().max(8_000).optional() }),
        summarize: (input) => `Executar o agente rotineiro ${input.id}`,
        execute: async (input, ctx) => (await runs()).triggerRoutineRun(input.id, { origin: "opex-agent", request: input.solicitacao ?? null }, ctx.actorId),
    }),
    defineTool({
        name: "list_routine_runs",
        group: "routine-agents",
        label: "Execuções dos rotineiros",
        risk: "read",
        description: "Lista as execuções (de um agente, ou de todos), com status, origem, duração, tokens, custo, relato e a ação pendente de confirmação.",
        input: z.object({ agentId: id.optional(), status: z.array(z.enum(ROUTINE_RUN_STATUSES)).optional(), limite: z.number().int().min(1).max(100).optional() }),
        execute: async (input) => (await import("@/features/routine-agents/server/run-queries")).listRoutineRuns({ agentId: input.agentId, status: input.status, limit: input.limite ?? 30 }),
    }),
    defineTool({
        name: "cancel_routine_run",
        group: "routine-agents",
        label: "Cancelar execução",
        risk: "destructive",
        description: "Cancela uma execução de agente rotineiro em qualquer status não final.",
        input: z.object({ runId: id }),
        summarize: (input) => `Cancelar a execução ${input.runId}`,
        execute: async (input, ctx) => (await actions()).cancelRoutineRun(input.runId, ctx.actorId),
    }),
    defineTool({
        name: "confirm_routine_action",
        group: "routine-agents",
        label: "Confirmar ação do rotineiro",
        risk: "write",
        // A ação confirmada pode ser destrutiva (é executada pelo Opex na confirmação): pede Confirmar/Cancelar
        // no chat e exige `mcp:owner:destructive` por token, como a própria ação exigiria.
        confirmByDefault: true,
        description: "Confirma a ação irreversível pendente de uma execução (retoma com a ação liberada). Respondida duas vezes → 409 ROUTINE_ACTION_ALREADY_RESOLVED.",
        input: z.object({ runId: id, observacao: z.string().max(2_000).optional() }),
        summarize: (input) => `Confirmar a ação pendente da execução ${input.runId}`,
        execute: async (input, ctx) => (await actions()).resolveRoutineAction(input.runId, "confirmed", ctx.actorId, input.observacao),
    }),
    defineTool({
        name: "reject_routine_action",
        group: "routine-agents",
        label: "Recusar ação do rotineiro",
        risk: "write",
        description: "Recusa a ação irreversível pendente de uma execução (o agente segue sem a ação ou conclui).",
        input: z.object({ runId: id, observacao: z.string().max(2_000).optional() }),
        summarize: (input) => `Recusar a ação pendente da execução ${input.runId}`,
        execute: async (input, ctx) => (await actions()).resolveRoutineAction(input.runId, "rejected", ctx.actorId, input.observacao),
    }),
    defineTool({
        name: "add_routine_entry",
        group: "routine-agents",
        label: "Entrada do dono",
        risk: "write",
        description: "Grava uma entrada do dono (uma memória) para um agente rotineiro (destino \"agent\") ou para todos os rotineiros (\"global\"); as próximas execuções passam a considerá-la.",
        input: z.object({ id, texto: z.string().trim().min(1).max(4_000), destino: z.enum(["agent", "global"]).default("agent") }),
        summarize: (input) => `Gravar uma entrada ${input.destino === "global" ? "para todos os rotineiros" : `no agente ${input.id}`}`,
        execute: async (input, ctx) => (await import("@/features/routine-agents/server/entries")).addRoutineEntry(input.id, { text: input.texto, target: input.destino }, ctx.actorId),
    }),
]

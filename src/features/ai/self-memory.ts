import { z } from "zod"
import { AI_AGENTS, MEMORY_CONSUMERS, writableListsFor, type MemoryConsumer, type MemoryTurn } from "./agents"

/**
 * Aprendizado autônomo dos agentes (OPE-104; módulo PURO). Cada agente grava, edita, fixa, inativa,
 * consolida e exclui as memórias dos próprios canais sozinho, pelas ferramentas "Memória própria".
 * Não há filtro de conteúdo (códigos de tarefa, URLs, rotas, nomes, tokens e chaves podem ser
 * registrados): o cuidado é escolher a lista certa para não sujar as listas globais. Memória escrita
 * pelo dono pode ser editada, mas só ele exclui ou inativa.
 */

/** Configuração em `ai_feature_settings` (`feature: "agent-self-memory"`): liga/desliga por agente. */
export const SELF_MEMORY_FEATURE = "agent-self-memory"

export const selfMemorySettingsSchema = z.object({
    opex: z.boolean(),
    maddox: z.boolean(),
    adversario: z.boolean(),
    desenvolvedor: z.boolean(),
})
export type SelfMemorySettings = z.infer<typeof selfMemorySettingsSchema>

export const DEFAULT_SELF_MEMORY_SETTINGS: SelfMemorySettings = { opex: true, maddox: true, adversario: true, desenvolvedor: true }

/** Gravações (criar, editar, fixar, ativar/inativar, excluir) aceitas por turno do agente. */
export const SELF_MEMORY_TURN_LIMIT = 5

export const SELF_MEMORY_TOOL_NAMES = ["list_my_memories", "remember", "update_my_memory", "pin_my_memory", "set_my_memory_active", "forget_my_memory"] as const
export type SelfMemoryToolName = (typeof SELF_MEMORY_TOOL_NAMES)[number]

export const isMemoryConsumer = (value: string): value is MemoryConsumer => (MEMORY_CONSUMERS as readonly string[]).includes(value)

/** Quando gravar em cada lista (orienta o agente a não sujar as globais). */
function listGuide(consumer: MemoryConsumer, turn: MemoryTurn): string[] {
    return writableListsFor(consumer, turn).map((id) => {
        const def = AI_AGENTS[id]
        const hint: Record<string, string> = {
            "app-global": "só fatos do Opex que valem para TODOS os agentes (raro)",
            "opex-global": "regras suas que valem com o dono e no portal",
            "maddox-global": "regras suas que valem com o dono e no portal",
            "opex-owner": "preferências e regras do dono",
            "maddox-owner": "preferências e regras do dono",
            "opex-client": "regras que valem para TODOS os clientes do portal",
            "maddox-client": "regras que valem para TODOS os clientes do portal",
            "opex-client-specific": turn.kind === "client" ? "o que vale para este cliente (a única lista que você grava aqui)" : "o que vale para um cliente específico (informe o clientId)",
            "maddox-client-specific": turn.kind === "client" ? "o que vale para este cliente (a única lista que você grava aqui)" : "o que vale para um cliente específico (informe o clientId)",
            adversarial: "o que verificar ou ignorar nas revisões",
            "developer-global": "como trabalhar em qualquer projeto",
            "developer-central": "convenções, comandos, caminhos e preferências deste projeto (a central da mesa)",
        }
        return `- \`${id}\` (${def.title}): ${hint[id] ?? def.description}`
    })
}

/** Instrução do aprendizado autônomo, anexada depois do bloco de memórias. */
export function selfMemoryInstructions(consumer: MemoryConsumer, turn: MemoryTurn, options: { toolPrefix?: string } = {}): string {
    const tool = (name: SelfMemoryToolName) => `\`${options.toolPrefix ?? ""}${name}\``
    return [
        "",
        "## Memória própria (aprendizado autônomo)",
        `Você aprende sozinho: use ${tool("remember")} quando descobrir algo durável e reaproveitável (regra, preferência confirmada, convenção, comando, caminho, decisão, lição de uma correção). Antes de gravar, confira ${tool("list_my_memories")}; quando a resposta trouxer \`similares\`, prefira ${tool("update_my_memory")} e funda o conteúdo em vez de duplicar. Inative (${tool("set_my_memory_active")}) ou exclua (${tool("forget_my_memory")}) o que ficou superado.`,
        "Pode registrar códigos de tarefa, URLs, rotas, nomes, tokens e chaves quando forem úteis, mas grave cada memória na lista mais específica que couber: as listas globais só recebem o que vale em qualquer contexto.",
        "Listas que você grava:",
        ...listGuide(consumer, turn),
        `Memórias escritas pelo dono (\`doDono\`) você pode editar, mas não excluir nem inativar. Não grave o estado passageiro do trabalho atual. No máximo ${SELF_MEMORY_TURN_LIMIT} gravações por turno.`,
    ].join("\n")
}

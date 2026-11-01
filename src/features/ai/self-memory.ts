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

/**
 * Metadados das ferramentas "Memória própria" (mesmos nomes em todos os agentes). Inativar e excluir são
 * `destructive`: pedem Confirmar/Cancelar no chat pelo padrão, e o dono troca a confirmação ferramenta a
 * ferramenta em Integrações › Inteligência Artificial › Agente Opex (a mesma política vale no Maddox e nas
 * mesas/revisões, onde não há chat: com a confirmação ligada, a chamada é recusada).
 */
export const SELF_MEMORY_TOOL_METAS: Record<SelfMemoryToolName, { label: string; description: string; risk: "read" | "write" | "destructive" }> = {
    list_my_memories: {
        label: "Minhas memórias",
        risk: "read",
        description: "Memórias que você segue neste turno (ativas e inativas), por lista, com id, resumo, texto, categoria, fixada, ativa, doDono e versão; e quantas ficaram fora do contexto (consolide quando houver).",
    },
    remember: { label: "Gravar memória", risk: "write", description: "Grava uma memória durável numa das suas listas (a mais específica que couber)." },
    update_my_memory: {
        label: "Editar memória",
        risk: "write",
        description: "Edita o texto e/ou a categoria de uma memória sua (inclusive as do dono). Envie a versão lida para não sobrescrever uma edição concorrente.",
    },
    pin_my_memory: { label: "Fixar memória", risk: "write", description: "Fixa (entra primeiro no contexto) ou desafixa uma memória sua." },
    set_my_memory_active: {
        label: "Ativar/inativar memória",
        risk: "destructive",
        description: "Inativa (sai do contexto, recuperável) ou reativa uma memória sua. As do dono você não inativa. Pode pedir a confirmação do dono.",
    },
    forget_my_memory: {
        label: "Excluir memória",
        risk: "destructive",
        description: "Exclui de vez uma memória sua que ficou errada ou superada (prefira inativar quando houver dúvida). As do dono você não exclui. Pode pedir a confirmação do dono.",
    },
}

/** Ferramentas "Memória própria" que pedem a confirmação do dono (padrão pelo risco + ajuste do dono). */
export function selfMemoryToolConfirms(name: SelfMemoryToolName, overrides: Readonly<Record<string, boolean>> = {}): boolean {
    const override = overrides[name]
    return typeof override === "boolean" ? override : SELF_MEMORY_TOOL_METAS[name].risk === "destructive"
}

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
        `Você aprende sozinho: use ${tool("remember")} quando descobrir algo durável e reaproveitável (regra, preferência confirmada, convenção, comando, caminho, decisão, lição de uma correção). Antes de gravar, confira ${tool("list_my_memories")}; quando a resposta trouxer \`similares\`, prefira ${tool("update_my_memory")} e funda o conteúdo em vez de duplicar. Inative (${tool("set_my_memory_active")}) ou exclua (${tool("forget_my_memory")}) o que ficou superado: essas duas podem pedir a confirmação do dono (ou ser recusadas quando não há chat); se forem recusadas, edite a memória em vez de insistir.`,
        "Pode registrar códigos de tarefa, URLs, rotas, nomes, tokens e chaves quando forem úteis, mas grave cada memória na lista mais específica que couber: as listas globais só recebem o que vale em qualquer contexto.",
        "Listas que você grava:",
        ...listGuide(consumer, turn),
        `Memórias escritas pelo dono (\`doDono\`) você pode editar, mas não excluir nem inativar. Não grave o estado passageiro do trabalho atual. No máximo ${SELF_MEMORY_TURN_LIMIT} gravações por turno.`,
    ].join("\n")
}

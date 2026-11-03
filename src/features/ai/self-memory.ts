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
    arquiteto: z.boolean(),
    desenvolvedor: z.boolean(),
})
export type SelfMemorySettings = z.infer<typeof selfMemorySettingsSchema>

export const DEFAULT_SELF_MEMORY_SETTINGS: SelfMemorySettings = { opex: true, maddox: true, adversario: true, arquiteto: true, desenvolvedor: true }

/** Gravações (criar, editar, fixar, ativar/inativar, excluir) aceitas por turno do agente. */
export const SELF_MEMORY_TURN_LIMIT = 5

/** Ferramentas de gravação (só com o aprendizado autônomo ligado). */
export const SELF_MEMORY_WRITE_TOOL_NAMES = ["list_my_memories", "remember", "update_my_memory", "pin_my_memory", "set_my_memory_active", "forget_my_memory"] as const
/** Ferramentas de leitura da faixa de títulos (OPE-117): valem sempre que o agente recebe contexto. */
export const SELF_MEMORY_READ_TOOL_NAMES = ["get_hints", "get_memory", "search_memories"] as const
export const SELF_MEMORY_TOOL_NAMES = [...SELF_MEMORY_WRITE_TOOL_NAMES, ...SELF_MEMORY_READ_TOOL_NAMES] as const
export type SelfMemoryToolName = (typeof SELF_MEMORY_TOOL_NAMES)[number]
export const isSelfMemoryReadTool = (name: string) => (SELF_MEMORY_READ_TOOL_NAMES as readonly string[]).includes(name)

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
    get_hints: {
        label: "Dicas de memórias",
        risk: "read",
        description: "Memórias dos seus canais que ficaram fora do texto completo e combinam com o texto informado (a mensagem ou a cena atual): só id, título e canal, nunca o texto. Leia a escolhida com get_memory.",
    },
    get_memory: { label: "Ler memória", risk: "read", description: "Lê uma memória dos seus canais pelo id (da faixa <titles> ou de get_hints): texto, título, categoria e canal." },
    search_memories: {
        label: "Buscar memórias",
        risk: "read",
        description: "Busca nos seus canais por termos (reserva quando get_hints vem vazio): título, canal e um trecho curto de cada resultado.",
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
            architect: "como desenhar a arquitetura deste app (camadas, nomes, o que destacar ou omitir)",
            "developer-global": "como trabalhar em qualquer projeto",
            "developer-central": "convenções, comandos, caminhos e preferências deste projeto (a central da mesa)",
        }
        return `- \`${id}\` (${def.title}): ${hint[id] ?? def.description}`
    })
}

/** Contagem do turno (`counts` da entrega do contexto). */
export interface SelfMemoryTurnCounts {
    titles: number
    overflow: number
}

export interface SelfMemoryInstructionOptions {
    toolPrefix?: string
    /** Faixa 2 e overflow da entrega do turno; ausente = Engramind indisponível (a linha é omitida). */
    counts?: SelfMemoryTurnCounts | null
    /** Bloco de gravação (aprendizado autônomo ligado). Padrão: `true`. */
    write?: boolean
    /** Bloco de leitura (`get_hints`/`get_memory`/`search_memories` disponíveis). Padrão: `true`. */
    read?: boolean
}

/** Agentes das mesas com o Agente Mentor como segunda camada (OPE-117). */
const MENTORED: readonly MemoryConsumer[] = ["desenvolvedor", "adversario"]

function outsideLine(counts: SelfMemoryTurnCounts | null | undefined): string | null {
    if (!counts) return null
    const total = counts.titles + counts.overflow
    if (total === 0) return "Memórias fora do contexto neste turno: 0 fora do contexto."
    return `Memórias fora do contexto neste turno: ${counts.titles} só pelo título (faixa \`<titles>\`) e ${counts.overflow} fora do bloco.`
}

/**
 * Instrução do aprendizado autônomo (OPE-117), anexada depois do bloco de memórias: o bloco de LEITURA
 * (faixa de títulos acionável) e o CHECKLIST DE FIM DE TURNO (gatilhos concretos de gravação), em
 * seções separadas. Sem `write`, só a leitura; sem `read`, só a gravação.
 */
export function selfMemoryInstructions(consumer: MemoryConsumer, turn: MemoryTurn, options: SelfMemoryInstructionOptions = {}): string {
    const tool = (name: SelfMemoryToolName) => `\`${options.toolPrefix ?? ""}${name}\``
    const write = options.write !== false
    // Só leitura e nada fora do contexto: o bloco seria ruído (com gravação, mostra "0 fora do contexto").
    const nothingOutside = options.counts ? options.counts.titles + options.counts.overflow === 0 : false
    const read = options.read !== false && (write || !nothingOutside)
    const lines: string[] = []
    if (read) {
        const outside = outsideLine(options.counts)
        lines.push(
            "",
            "## Memórias fora do contexto (leitura)",
            ...(outside ? [outside] : []),
            `Se um título da faixa \`<titles>\` parecer relevante para o pedido, chame ${tool("get_hints")} com a mensagem ou a cena atual e leia a escolhida com ${tool("get_memory")}. Quando as dicas vierem vazias, use ${tool("search_memories")} com os termos do título. Não despeje todas as memórias no prompt e não invente uma memória que não existe: se não encontrar, siga sem ela.`,
        )
    }
    if (write) {
        lines.push(
            "",
            "## Memória própria (aprendizado autônomo)",
            `Você aprende sozinho: ${tool("remember")} é o seu caminho de aprendizado. As ferramentas de gestão do Engramind (\`*_engramind_*\`) gravam como o DONO e a memória fica protegida (você não a exclui nem inativa depois): para aprender, use sempre ${tool("remember")}.`,
            "Checklist de fim de turno (antes de encerrar a resposta, confira cada gatilho):",
            "1. O dono ou o usuário corrigiu você ou o seu trabalho? Grave a regra que evita repetir o erro.",
            "2. Uma decisão se repetiu (você ou o dono escolheu o mesmo caminho de novo)? Grave a decisão.",
            "3. Descobriu um comando, caminho, rota ou nome novo que vai precisar de novo? Grave-o.",
            "4. Uma preferência foi confirmada (o dono aprovou ou pediu explicitamente)? Grave a preferência.",
            `Se nenhum gatilho bateu, não grave nada. Antes de gravar, confira ${tool("list_my_memories")}; quando a resposta trouxer \`similares\`, prefira ${tool("update_my_memory")} e funda o conteúdo em vez de duplicar. Com muitas memórias fora do contexto, consolide: funda as parecidas e inative (${tool("set_my_memory_active")}) ou exclua (${tool("forget_my_memory")}) o que ficou superado. Essas duas podem pedir a confirmação do dono (ou ser recusadas quando não há chat); se forem recusadas, edite a memória em vez de insistir.`,
            "Cada memória é um fato durável e autossuficiente (quem lê não tem o contexto desta conversa), na categoria certa: escreva o fato, não a conversa. Pode registrar códigos de tarefa, URLs, rotas, nomes, tokens e chaves quando forem úteis, mas grave cada memória na lista mais específica que couber: as listas globais só recebem o que vale em qualquer contexto.",
            ...(MENTORED.includes(consumer) ? ["Duas camadas: grave o que você percebeu, sem esperar por ninguém. O Agente Mentor revisa a cadeia depois e grava só o que passou batido (ele vê as suas memórias e funde em vez de duplicar)."] : []),
            "Listas que você grava:",
            ...listGuide(consumer, turn),
            `Memórias escritas pelo dono (\`doDono\`) você pode editar, mas não excluir nem inativar. Não grave o estado passageiro do trabalho atual. No máximo ${SELF_MEMORY_TURN_LIMIT} gravações por turno.`,
        )
    }
    return lines.join("\n")
}

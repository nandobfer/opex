/**
 * Universo único das memórias de um agente do Opex (OPE-148, puro): o agente no Engramind (`opex/<id>`), o
 * canal inicial de "Nova memória" e, na central, os canais que valem nela. Usado pelas seções de memórias
 * (integração `/integracoes/ia`, páginas `/agente-*` e a aba Memórias da central).
 */
import { OPEX_APP_SLUG } from "@/features/engramind/constants"
import { AI_AGENTS, contextChannelsFor, MEMORY_CONSUMER_DEFS, memoryChannelOf, type AiAgentId, type MemoryConsumer } from "./agents"

/** Lista em que "Nova memória" começa, por agente (a global dele; a central, quando há uma). */
const DEFAULT_CREATE_LIST: Record<MemoryConsumer, AiAgentId> = {
    opex: "opex-global",
    maddox: "maddox-global",
    adversario: "adversarial",
    arquiteto: "architect",
    desenvolvedor: "developer-global",
}

export interface MemoryUniverseDef {
    consumer: MemoryConsumer
    /** Agente no Engramind (`opex/<consumidor>`), o centro do universo. */
    agent: string
    defaultCreateChannel: string
    /** Canais que entram no universo (`null` = todos os que o agente assina). */
    channels: readonly string[] | null
    description: string
}

/** Agente do Opex no Engramind (`opex/<consumidor>`). */
export const memoryUniverseAgent = (consumer: MemoryConsumer) => `${OPEX_APP_SLUG}/${consumer}`

/**
 * Universo de um agente. Na central (`centralId`), o desenvolvedor mostra só o que vale nela: as Memórias do
 * Opex, as globais do desenvolvedor e as da central (os mesmos canais do contexto do turno da central).
 */
export function memoryUniverseOf(consumer: MemoryConsumer, scope: { centralId?: string | null } = {}): MemoryUniverseDef {
    const name = MEMORY_CONSUMER_DEFS[consumer].name
    const central = consumer === "desenvolvedor" && scope.centralId ? memoryChannelOf("developer-central", { centralId: scope.centralId }) : null
    if (central) {
        return {
            consumer,
            agent: memoryUniverseAgent(consumer),
            defaultCreateChannel: central,
            channels: contextChannelsFor("desenvolvedor", { kind: "central", centralId: scope.centralId! }),
            description: `As memórias que o ${name} segue nesta central: as Memórias do Opex, as globais e as da central, por canal. Passe o mouse ou toque numa memória para ver as ações.`,
        }
    }
    return {
        consumer,
        agent: memoryUniverseAgent(consumer),
        defaultCreateChannel: AI_AGENTS[DEFAULT_CREATE_LIST[consumer]].channel,
        channels: null,
        description: `Todas as memórias que o ${name} alcança, por canal. Use para alimentar e treinar o agente. Passe o mouse ou toque numa memória para ver as ações.`,
    }
}

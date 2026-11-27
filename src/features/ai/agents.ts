/**
 * Listas de memórias dos agentes de IA do Opex (módulo PURO: tela e servidor). Desde a OPE-104 cada
 * lista é um **canal do Engramind** (a fonte das memórias): uma lista nova entra aqui e ganha, sem
 * código novo, a API, as ferramentas do Agente Opex, o card na aba do agente (`tab`), o canal criado
 * pelo passo "Memórias dos agentes" do bootstrap e a tradução do webhook (`listOfChannel`).
 *
 * - **Memórias do Opex** (`app-global`, canal `opex`): valem para TODOS os agentes do app.
 * - **Agente Opex** e **Agente Maddox**: globais (dono e portal), do dono (só os turnos do dono), do
 *   cliente (portal, todos os clientes) e de um cliente específico (`scope: "client"`, um canal por
 *   cliente; é onde o agente do portal grava o que aprende).
 * - **Agente Adversário**: uma lista própria, nas instruções de toda revisão da mesa.
 * - **Agente Arquiteto**: uma lista própria, nas instruções de toda geração do diagrama do plano.
 * - **agente desenvolvedor** (mesas e forks): as globais, que valem em todas as centrais, e uma lista
 *   por central (`scope: "central"`).
 * - **Agentes rotineiros** (OPE-130): o global dos rotineiros e uma lista por agente rotineiro
 *   (`scope: "routine"`, canal `agentes/rotineiros/<slug>`). Cada agente rotineiro é uma identidade
 *   dinâmica no Engramind (`opex/rotineiro-<slug>`, fora de `MEMORY_IDENTITIES`), provisionada pela
 *   feature `routine-agents`.
 * - **Agente Secretário** (OPE-192): o global do Secretário e uma lista por conversa do WhatsApp
 *   (`scope: "conversation"`, canal `agentes/secretario/conversas/<id>`). Ele NÃO lê as Memórias do Opex: o
 *   contexto do turno tem só o global dele e o canal da conversa atual.
 *
 * Desde a OPE-206 os canais de `AI_AGENTS` são LÓGICOS: o nome real no Engramind leva o app da instância na frente
 * (`opex/agentes/maddox/dono`), calculado por `channel-namespace.ts`. Toda função que devolve canal real exige o
 * espaço de nomes (`ChannelNamespace`).
 */
import { isManagedReal, logicalChannel, realChannel, realFixedChannel, realSubscriptionTarget, type ChannelNamespace } from "@/features/engramind/channel-namespace"

export type { ChannelNamespace }

export const AI_AGENT_IDS = [
    "app-global",
    "opex-global",
    "opex-owner",
    "opex-client",
    "opex-client-specific",
    "maddox-global",
    "maddox-owner",
    "maddox-client",
    "maddox-client-specific",
    "adversarial",
    "architect",
    "developer-global",
    "developer-central",
    "routine-global",
    "routine-specific",
    "secretary-global",
    "secretary-conversation",
] as const
export type AiAgentId = (typeof AI_AGENT_IDS)[number]

/** Agentes do Opex que consomem memórias (um agente no app `opex` do Engramind, com token próprio). */
export const MEMORY_CONSUMERS = ["opex", "maddox", "adversario", "arquiteto", "desenvolvedor", "secretario"] as const
export type MemoryConsumer = (typeof MEMORY_CONSUMERS)[number]

export const MEMORY_CONSUMER_DEFS: Record<MemoryConsumer, { name: string; description: string; label: string }> = {
    opex: { name: "Agente Opex", label: "Agente Opex", description: "Agente nativo do Opex (dono e portal do cliente)" },
    maddox: { name: "Agente Maddox", label: "Agente Maddox", description: "Agente do Opex no OpenCode (dono e portal do cliente)" },
    adversario: { name: "Agente Adversário", label: "Agente Adversário", description: "Revisor adversário das mesas de desenvolvimento" },
    arquiteto: { name: "Agente Arquiteto", label: "Agente Arquiteto", description: "Desenha a arquitetura do plano aprovado das mesas de desenvolvimento" },
    desenvolvedor: { name: "Agente desenvolvedor", label: "Agente desenvolvedor", description: "Agente das mesas e forks das centrais de desenvolvimento" },
    secretario: { name: "Agente Secretário", label: "Agente Secretário", description: "Responde no WhatsApp do dono com a personalidade dele" },
}

/**
 * Identidades de memória no Engramind (agente + token próprios): os consumidores de contexto e o
 * Agente Mentor, que só escreve (não tem lista, contexto nem aprendizado autônomo).
 */
export const MEMORY_IDENTITIES = [...MEMORY_CONSUMERS, "mentor"] as const
export type MemoryIdentity = (typeof MEMORY_IDENTITIES)[number]

export const MEMORY_IDENTITY_DEFS: Record<MemoryIdentity, { name: string; description: string; label: string }> = {
    ...MEMORY_CONSUMER_DEFS,
    mentor: { name: "Agente Mentor", label: "Agente Mentor", description: "Transforma lições das mesas em memórias do Adversário e do agente desenvolvedor" },
}

/** Escopos do token de cada identidade: o Mentor só cria e edita (sem `delete`). */
export const MEMORY_TOKEN_SCOPES: Record<MemoryIdentity, string[]> = {
    opex: ["read", "write", "delete"],
    maddox: ["read", "write", "delete"],
    adversario: ["read", "write", "delete"],
    arquiteto: ["read", "write", "delete"],
    desenvolvedor: ["read", "write", "delete"],
    secretario: ["read", "write", "delete"],
    mentor: ["read", "write"],
}

/** Canal (lógico) das memórias globais do app, assinado por todos os agentes. */
export const APP_MEMORY_CHANNEL = "opex"

export interface AiAgentDef {
    label: string
    title: string
    description: string
    tab: string
    /**
     * `central`: uma lista por central; `client`: uma lista por cliente do portal; `routine`: uma por agente rotineiro (slug);
     * `conversation`: uma por conversa do WhatsApp do Agente Secretário (id derivado do JID).
     */
    scope?: "central" | "client" | "routine" | "conversation"
    /** Canal do Engramind (nas listas com escopo, o prefixo seguido do id). */
    channel: string
    /** Agente dono da lista (`null` nas Memórias do Opex, de todos). */
    consumer: MemoryConsumer | null
}

export const AI_AGENTS: Record<AiAgentId, AiAgentDef> = {
    "app-global": {
        label: "todos os agentes do Opex",
        title: "Memórias do Opex",
        description: "Instruções e fatos permanentes que valem para todos os agentes do app (Agente Opex, Agente Maddox, Agente Adversário, Agente Arquiteto e agente desenvolvedor).",
        tab: "todos",
        channel: APP_MEMORY_CHANNEL,
        consumer: null,
    },
    "opex-global": {
        label: "Agente Opex (global)",
        title: "Memórias globais",
        description: "Instruções permanentes que o Agente Opex segue em toda conversa, no app do dono e no portal do cliente.",
        tab: "agente-opex",
        channel: "agentes/opex/global",
        consumer: "opex",
    },
    "opex-owner": {
        label: "Agente Opex do dono",
        title: "Memórias do dono",
        description: "Instruções permanentes que o Agente Opex segue só nas conversas do dono.",
        tab: "agente-opex",
        channel: "agentes/opex/dono",
        consumer: "opex",
    },
    "opex-client": {
        label: "Agente Opex do portal",
        title: "Memórias do cliente",
        description: "Instruções permanentes que o Agente Opex segue só nas conversas do portal do cliente (todos os clientes).",
        tab: "agente-opex",
        channel: "agentes/opex/cliente",
        consumer: "opex",
    },
    "opex-client-specific": {
        label: "Agente Opex deste cliente",
        title: "Memórias de um cliente",
        description: "Instruções permanentes que o Agente Opex segue só nas conversas do portal deste cliente. É onde o agente do portal grava o que aprende.",
        tab: "agente-opex",
        scope: "client",
        channel: "agentes/opex/clientes",
        consumer: "opex",
    },
    "maddox-global": {
        label: "Agente Maddox (global)",
        title: "Memórias globais",
        description: "Instruções permanentes que o Agente Maddox segue em toda conversa, no app do dono e no portal do cliente.",
        tab: "agente-maddox",
        channel: "agentes/maddox/global",
        consumer: "maddox",
    },
    "maddox-owner": {
        label: "Agente Maddox do dono",
        title: "Memórias do dono",
        description: "Instruções permanentes que o Agente Maddox segue só nas conversas do dono.",
        tab: "agente-maddox",
        channel: "agentes/maddox/dono",
        consumer: "maddox",
    },
    "maddox-client": {
        label: "Agente Maddox do portal",
        title: "Memórias do cliente",
        description: "Instruções permanentes que o Agente Maddox segue só nas conversas do portal do cliente (todos os clientes).",
        tab: "agente-maddox",
        channel: "agentes/maddox/cliente",
        consumer: "maddox",
    },
    "maddox-client-specific": {
        label: "Agente Maddox deste cliente",
        title: "Memórias de um cliente",
        description: "Instruções permanentes que o Agente Maddox segue só nas conversas do portal deste cliente. É onde o agente do portal grava o que aprende.",
        tab: "agente-maddox",
        scope: "client",
        channel: "agentes/maddox/clientes",
        consumer: "maddox",
    },
    adversarial: {
        label: "Agente Adversário",
        title: "Memórias do Agente Adversário",
        description: "Instruções permanentes que o Agente Adversário segue em toda revisão da mesa (ex.: \"neste repositório, X é intencional\").",
        tab: "agente-adversario",
        channel: "agentes/adversario",
        consumer: "adversario",
    },
    architect: {
        label: "Agente Arquiteto",
        title: "Memórias do Agente Arquiteto",
        description: "Instruções permanentes que o Agente Arquiteto segue em todo diagrama do plano (ex.: \"neste repositório, as camadas são X\").",
        tab: "agente-arquiteto",
        channel: "agentes/arquiteto",
        consumer: "arquiteto",
    },
    "developer-global": {
        label: "agente desenvolvedor",
        title: "Memórias globais do agente desenvolvedor",
        description: "Instruções permanentes que o agente desenvolvedor segue em todas as centrais: em toda etapa da mesa e nos forks.",
        tab: "desenvolvimento-agentico",
        channel: "agentes/desenvolvedor/global",
        consumer: "desenvolvedor",
    },
    "developer-central": {
        label: "agente desenvolvedor desta central",
        title: "Memórias da central",
        description: "Instruções permanentes que o agente desenvolvedor segue só nas mesas e forks desta central, depois das globais.",
        tab: "desenvolvimento-agentico",
        scope: "central",
        channel: "agentes/desenvolvedor/central",
        consumer: "desenvolvedor",
    },
    "routine-global": {
        label: "todos os agentes rotineiros",
        title: "Memórias dos rotineiros",
        description: "Instruções e fatos permanentes que valem para todos os agentes rotineiros. O dono e os próprios rotineiros gravam aqui.",
        tab: "rotineiros",
        channel: "agentes/rotineiros/global",
        consumer: null,
    },
    "routine-specific": {
        label: "este agente rotineiro",
        title: "Memórias do agente rotineiro",
        description: "Instruções e fatos permanentes que só este agente rotineiro segue: o que ele já fez, as correções do dono e as entradas gravadas na página dele.",
        tab: "rotineiros",
        scope: "routine",
        channel: "agentes/rotineiros",
        consumer: null,
    },
    "secretary-global": {
        label: "Agente Secretário (global)",
        title: "Memórias globais do Secretário",
        description: "Fatos e regras que o Agente Secretário segue em todas as conversas do WhatsApp (o que vale para qualquer contato).",
        tab: "agente-secretario",
        channel: "agentes/secretario/global",
        consumer: "secretario",
    },
    "secretary-conversation": {
        label: "Agente Secretário nesta conversa",
        title: "Memórias da conversa",
        description: "Fatos que o Agente Secretário segue só nesta conversa do WhatsApp (contato ou grupo): quem é, combinados, preferências.",
        tab: "agente-secretario",
        scope: "conversation",
        channel: "agentes/secretario/conversas",
        consumer: "secretario",
    },
}

/** Lista com uma coleção por central (a memória exige `centralId`). */
export function isCentralScopedAgent(agentId: AiAgentId): boolean {
    return AI_AGENTS[agentId].scope === "central"
}

/** Lista com uma coleção por agente rotineiro (a memória exige `routineSlug`). */
export function isRoutineScopedAgent(agentId: AiAgentId): boolean {
    return AI_AGENTS[agentId].scope === "routine"
}

/** Lista com uma coleção por cliente do portal (a memória exige `clientId`). */
export function isClientScopedAgent(agentId: AiAgentId): boolean {
    return AI_AGENTS[agentId].scope === "client"
}

/** Lista com uma coleção por conversa do WhatsApp (a memória exige `conversationId`). */
export function isConversationScopedAgent(agentId: AiAgentId): boolean {
    return AI_AGENTS[agentId].scope === "conversation"
}

export function isAiAgentId(value: string): value is AiAgentId {
    return (AI_AGENT_IDS as readonly string[]).includes(value)
}

/** Lista de uma central, de um cliente ou de um agente rotineiro (as demais listas ignoram). */
export interface MemoryListScope {
    centralId?: string | null
    clientId?: string | null
    routineSlug?: string | null
    /** Conversa do Agente Secretário (`conversationIdOfJid`). */
    conversationId?: string | null
}

const OBJECT_ID = /^[a-f0-9]{24}$/
/**
 * Id de conversa do Secretário: dígitos (contato), `g-<dígitos>` (grupo; os antigos têm `<número>-<ts>`) ou
 * `lid-<dígitos>` (contato sem número). Ver `conversationIdOfJid` (`features/secretary-agent/conversation-id.ts`).
 */
const CONVERSATION_ID = /^(?:[0-9]{5,20}|g-[0-9]{5,25}(?:-[0-9]{5,15})?|lid-[0-9]{5,25})$/

export function isConversationId(value: string | null | undefined): value is string {
    return Boolean(value) && CONVERSATION_ID.test(value!)
}
/** Slug de agente rotineiro (`global` é o canal dos rotineiros, nunca um agente). */
const ROUTINE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isRoutineSlug(value: string | null | undefined): value is string {
    return Boolean(value) && ROUTINE_SLUG.test(value!) && value !== "global" && value!.length <= 60
}

/** Canal lógico de uma lista (nas listas com escopo, `null` sem um id válido). */
function logicalChannelOfList(agentId: AiAgentId, scope: MemoryListScope = {}): string | null {
    const def = AI_AGENTS[agentId]
    if (!def.scope) return def.channel
    if (def.scope === "routine") {
        const slug = scope.routineSlug?.trim()
        return isRoutineSlug(slug) ? `${def.channel}/${slug}` : null
    }
    if (def.scope === "conversation") {
        const id = scope.conversationId?.trim()
        return isConversationId(id) ? `${def.channel}/${id}` : null
    }
    const id = (def.scope === "central" ? scope.centralId : scope.clientId)?.trim().toLowerCase()
    return id && OBJECT_ID.test(id) ? `${def.channel}/${id}` : null
}

/**
 * Canal real do Engramind de uma lista, no espaço de nomes da instância (OPE-206: `<app>/agentes/...`). Nas listas
 * com escopo, `null` sem um id válido ou quando o nome passaria dos limites do Engramind.
 */
export function memoryChannelOf(agentId: AiAgentId, scope: MemoryListScope, ns: ChannelNamespace): string | null {
    const logical = logicalChannelOfList(agentId, scope)
    return logical ? realChannel(ns, logical) : null
}

/** Canal real de uma lista sem escopo (sempre definido). */
export function fixedChannelOf(agentId: AiAgentId, ns: ChannelNamespace): string {
    return realFixedChannel(ns, AI_AGENTS[agentId].channel)
}

/** Prefixo real (com a barra) dos canais de uma lista com escopo (`<app>/agentes/desenvolvedor/central/`). */
export function scopedChannelPrefix(agentId: AiAgentId, ns: ChannelNamespace): string {
    return `${realFixedChannel(ns, AI_AGENTS[agentId].channel)}/`
}

export interface ResolvedMemoryList {
    agentId: AiAgentId
    centralId?: string
    clientId?: string
    routineSlug?: string
    conversationId?: string
}

/** Lista de um canal real (webhook, contexto); `null` para canal fora do mapeamento desta instância. */
export function listOfChannel(slug: string | null | undefined, ns: ChannelNamespace): ResolvedMemoryList | null {
    if (!slug || !isManagedReal(ns, slug)) return null
    const logical = logicalChannel(ns, slug)
    for (const agentId of AI_AGENT_IDS) {
        const def = AI_AGENTS[agentId]
        if (!def.scope) {
            if (def.channel === logical) return { agentId }
            continue
        }
        if (!logical.startsWith(`${def.channel}/`)) continue
        const id = logical.slice(def.channel.length + 1)
        if (def.scope === "routine") {
            if (!isRoutineSlug(id)) continue
            return { agentId, routineSlug: id }
        }
        if (def.scope === "conversation") {
            if (!isConversationId(id)) continue
            return { agentId, conversationId: id }
        }
        if (!OBJECT_ID.test(id)) return null
        return def.scope === "central" ? { agentId, centralId: id } : { agentId, clientId: id }
    }
    return null
}

/** Turno de um agente: escopo do chat (dono ou portal com o cliente) ou a central da mesa. */
export type MemoryTurn =
    | { kind: "owner" }
    | { kind: "client"; clientId: string }
    | { kind: "review" }
    | { kind: "central"; centralId: string | null }
    /** Turno do Agente Secretário numa conversa do WhatsApp (`null` = fora de uma conversa, ex.: o teste). */
    | { kind: "conversation"; conversationId: string | null }

/** Listas lidas no turno, na ordem do prompt (Memórias do Opex primeiro). */
export function contextListsFor(consumer: MemoryConsumer, turn: MemoryTurn): { agentId: AiAgentId; scope?: MemoryListScope }[] {
    const app = { agentId: "app-global" as const }
    if (consumer === "opex" || consumer === "maddox") {
        const prefix = consumer === "opex" ? "opex" : "maddox"
        if (turn.kind === "client") return [app, { agentId: `${prefix}-global` }, { agentId: `${prefix}-client` }, { agentId: `${prefix}-client-specific`, scope: { clientId: turn.clientId } }]
        return [app, { agentId: `${prefix}-global` }, { agentId: `${prefix}-owner` }]
    }
    if (consumer === "adversario") return [app, { agentId: "adversarial" }]
    if (consumer === "arquiteto") return [app, { agentId: "architect" }]
    if (consumer === "secretario") {
        // Sem as Memórias do Opex: só o global do Secretário e o canal da conversa atual.
        const conversation = turn?.kind === "conversation" && turn.conversationId ? [{ agentId: "secretary-conversation" as const, scope: { conversationId: turn.conversationId } }] : []
        return [{ agentId: "secretary-global" }, ...conversation]
    }
    const central = turn.kind === "central" && turn.centralId ? [{ agentId: "developer-central" as const, scope: { centralId: turn.centralId } }] : []
    return [app, { agentId: "developer-global" }, ...central]
}

/** Canais do contexto do turno (os de listas com escopo inválido ficam de fora). */
export function contextChannelsFor(consumer: MemoryConsumer, turn: MemoryTurn, ns: ChannelNamespace): string[] {
    return contextListsFor(consumer, turn)
        .map((list) => memoryChannelOf(list.agentId, list.scope ?? {}, ns))
        .filter((channel): channel is string => Boolean(channel))
}

/**
 * Listas em que o agente grava sozinho (aprendizado autônomo). No **portal**, só a do cliente da
 * sessão: o que um cliente ensina nunca vale para outro cliente nem para o dono.
 */
export function writableListsFor(consumer: MemoryConsumer, turn: MemoryTurn): AiAgentId[] {
    if (consumer === "opex" || consumer === "maddox") {
        const prefix = consumer === "opex" ? "opex" : "maddox"
        if (turn.kind === "client") return [`${prefix}-client-specific`]
        return ["app-global", `${prefix}-global`, `${prefix}-owner`, `${prefix}-client`, `${prefix}-client-specific`]
    }
    if (consumer === "adversario") return ["app-global", "adversarial"]
    if (consumer === "arquiteto") return ["app-global", "architect"]
    // Sem turno (texto da instrução, tela), só o global; numa conversa, também o canal dela.
    if (consumer === "secretario") return turn?.kind === "conversation" && turn.conversationId ? ["secretary-global", "secretary-conversation"] : ["secretary-global"]
    return turn.kind === "central" && turn.centralId ? ["app-global", "developer-global", "developer-central"] : ["app-global", "developer-global"]
}

/** Alvos LÓGICOS das assinaturas `inject` de cada agente (o canal `opex` é exato); o real vem de `subscriptionTargetsFor`. */
export const MEMORY_SUBSCRIPTION_TARGETS: Record<MemoryIdentity, string[]> = {
    opex: [APP_MEMORY_CHANNEL, "agentes/opex/*"],
    maddox: [APP_MEMORY_CHANNEL, "agentes/maddox/*"],
    adversario: [APP_MEMORY_CHANNEL, "agentes/adversario"],
    arquiteto: [APP_MEMORY_CHANNEL, "agentes/arquiteto"],
    desenvolvedor: [APP_MEMORY_CHANNEL, "agentes/desenvolvedor/*"],
    // O Secretário não assina as Memórias do Opex (OPE-192).
    secretario: ["agentes/secretario/*"],
    // Só onde o Mentor grava (o token de agente só escreve nos canais que assina).
    mentor: ["agentes/adversario", "agentes/desenvolvedor/*"],
}

/** Alvos reais das assinaturas de uma identidade no espaço de nomes da instância (`opex/agentes/maddox/*`). */
export function subscriptionTargetsFor(identity: MemoryIdentity, ns: ChannelNamespace): string[] {
    return MEMORY_SUBSCRIPTION_TARGETS[identity].map((target) => realSubscriptionTarget(ns, target))
}

/** Canal (real) alcançado por um dos alvos (exato ou prefixo `x/*`). */
export function channelMatchesTargets(channel: string | null | undefined, targets: readonly string[]): boolean {
    if (!channel) return false
    return targets.some((target) => (target.endsWith("*") ? channel.startsWith(target.slice(0, -1)) : target === channel))
}

/** Nome do canal no Engramind ("Memórias globais · Agente Opex (global)"). */
export function memoryChannelName(agentId: AiAgentId, scopeName?: string): string {
    const def = AI_AGENTS[agentId]
    const base = agentId === "app-global" ? def.title : `${def.title} · ${def.label}`
    return (scopeName ? `${base} · ${scopeName}` : base).slice(0, 120)
}

/** Canais fixos (sem escopo) criados pelo passo "Memórias dos agentes". */
export function fixedMemoryChannels(ns: ChannelNamespace): { agentId: AiAgentId; slug: string }[] {
    return AI_AGENT_IDS.filter((id) => !AI_AGENTS[id].scope).map((id) => ({ agentId: id, slug: fixedChannelOf(id, ns) }))
}

/** Listas de memórias que entram no prompt do Agente Opex, conforme o escopo do turno (sem as Memórias do Opex). */
export function opexMemoryAgentsFor(scope: "owner" | "client"): AiAgentId[] {
    return scope === "owner" ? ["opex-global", "opex-owner"] : ["opex-global", "opex-client", "opex-client-specific"]
}

/** Listas de memórias que entram nas instruções do Agente Maddox, conforme o escopo da sessão. */
export function maddoxMemoryAgentsFor(scope: "owner" | "client"): AiAgentId[] {
    return scope === "owner" ? ["maddox-global", "maddox-owner"] : ["maddox-global", "maddox-client", "maddox-client-specific"]
}

/** Agente (`app/agente`) de memórias do Opex no app desta instância (aba Identidades marca "Memórias do Opex"). */
export function isOpexMemoryAgent(appSlug: string | null | undefined, agentSlug: string | null | undefined, instanceApp: string): boolean {
    if (!appSlug || appSlug !== instanceApp || !agentSlug) return false
    const slug = agentSlug.split("/").pop()!
    return (MEMORY_IDENTITIES as readonly string[]).includes(slug) || isRoutineAgentIdentity(slug)
}

/** Prefixo do agente de um rotineiro no Engramind (`<app>/rotineiro-<slug>`, OPE-130). */
export const ROUTINE_IDENTITY_PREFIX = "rotineiro-"
export type RoutineIdentity = `rotineiro-${string}`

/** Identidade de memória de um agente rotineiro (`rotineiro-<slug>`). */
export function isRoutineAgentIdentity(slug: string | null | undefined): slug is RoutineIdentity {
    return Boolean(slug?.startsWith(ROUTINE_IDENTITY_PREFIX)) && isRoutineSlug(slug!.slice(ROUTINE_IDENTITY_PREFIX.length))
}

export const routineIdentityOf = (slug: string): RoutineIdentity => `${ROUTINE_IDENTITY_PREFIX}${slug}`

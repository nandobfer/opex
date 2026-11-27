/**
 * Espaço de nomes dos canais gerenciados pelo Opex no Engramind (OPE-206, módulo PURO: tela e servidor).
 *
 * O código usa nomes **lógicos** (`opex` = raiz das Memórias do Opex, `agentes/...` = listas dos agentes) e o
 * Engramind guarda o nome **real**, com o app da instância na frente:
 * - raiz lógica `opex` → `<app>` (no app do dono continua `opex`);
 * - `agentes/...` → `<app>/agentes/...` (no app do dono, `opex/agentes/...`).
 *
 * No modo "nomes antigos" (`prefixed: false`, só a instância do dono até a migração B) o nome real é o próprio
 * lógico. Canais escolhidos pelo usuário (ex.: `vagas/empresa-x`) nunca mudam. O Engramind aceita até 8
 * segmentos e 120 caracteres: um nome real fora disso vira `null`.
 */

import { BOOTSTRAP_APP_SLUG, OPEX_APP_SLUG } from "./constants"

/** App da instância a partir do app do `whoami` da chave (a do bootstrap vira o app `opex`, regra do `connection.ts`). */
export const instanceAppOf = (whoamiAppSlug: string): string => (whoamiAppSlug === BOOTSTRAP_APP_SLUG ? OPEX_APP_SLUG : whoamiAppSlug)

export interface ChannelNamespace {
    /** Slug do app da instância no Engramind. */
    app: string
    /** `false` = nomes antigos (sem o app na frente). */
    prefixed: boolean
}

/** Raiz lógica das Memórias do Opex (o canal de todos os agentes). */
export const LOGICAL_ROOT_CHANNEL = "opex"
/** Prefixo lógico das listas dos agentes. */
export const LOGICAL_AGENTS_PREFIX = "agentes"

export const CHANNEL_SLUG_MAX = 120
export const CHANNEL_SEGMENTS_MAX = 8

/** Espaço de nomes do dono antes da migração B (nomes antigos). */
export const LEGACY_NAMESPACE: ChannelNamespace = { app: LOGICAL_ROOT_CHANNEL, prefixed: false }

/** Canal dentro dos limites do Engramind (120 caracteres e 8 segmentos). */
export function fitsChannelLimits(slug: string): boolean {
    return slug.length > 0 && slug.length <= CHANNEL_SLUG_MAX && slug.split("/").length <= CHANNEL_SEGMENTS_MAX
}

/** Nome lógico gerenciado pelo Opex: a raiz `opex` e tudo sob `agentes/`. */
export function isManagedLogical(slug: string): boolean {
    return slug === LOGICAL_ROOT_CHANNEL || slug.startsWith(`${LOGICAL_AGENTS_PREFIX}/`)
}

const agentsRoot = (ns: ChannelNamespace) => (ns.prefixed ? `${ns.app}/${LOGICAL_AGENTS_PREFIX}/` : `${LOGICAL_AGENTS_PREFIX}/`)
const rootOf = (ns: ChannelNamespace) => (ns.prefixed ? ns.app : LOGICAL_ROOT_CHANNEL)

/** Nome real de um canal lógico (o do usuário volta igual); `null` fora dos limites do Engramind. */
export function realChannel(ns: ChannelNamespace, logical: string): string | null {
    const real = realFixedChannel(ns, logical)
    return fitsChannelLimits(real) ? real : null
}

/**
 * Nome real sem a conferência dos limites (canais fixos: curtos, com o app de até 64 caracteres). Um nome que passe
 * dos limites vai assim mesmo e o Engramind recusa; nunca cai para o nome lógico (que seria outro canal).
 */
export function realFixedChannel(ns: ChannelNamespace, logical: string): string {
    if (logical === LOGICAL_ROOT_CHANNEL) return rootOf(ns)
    if (logical.startsWith(`${LOGICAL_AGENTS_PREFIX}/`)) return `${agentsRoot(ns)}${logical.slice(LOGICAL_AGENTS_PREFIX.length + 1)}`
    return logical
}

/** Nome real gerenciado por esta instância (a raiz ou `…/agentes/...`). */
export function isManagedReal(ns: ChannelNamespace, slug: string): boolean {
    return slug === rootOf(ns) || slug.startsWith(agentsRoot(ns))
}

/** Nome lógico de um canal real (o que não é gerenciado volta igual). */
export function logicalChannel(ns: ChannelNamespace, real: string): string {
    if (real === rootOf(ns)) return LOGICAL_ROOT_CHANNEL
    const root = agentsRoot(ns)
    if (real.startsWith(root)) return `${LOGICAL_AGENTS_PREFIX}/${real.slice(root.length)}`
    return real
}

/** Alvo de assinatura real: canal exato ou prefixo terminado em `*` (`agentes/maddox/*` → `opex/agentes/maddox/*`). */
export function realSubscriptionTarget(ns: ChannelNamespace, target: string): string {
    if (!target.endsWith("*")) return realFixedChannel(ns, target)
    const base = target.slice(0, -1)
    if (base.startsWith(`${LOGICAL_AGENTS_PREFIX}/`)) return `${agentsRoot(ns)}${base.slice(LOGICAL_AGENTS_PREFIX.length + 1)}*`
    return target
}

/**
 * Canal reservado aos agentes do Opex (fora dos extras dos rotineiros): a raiz e `…/agentes/...` desta instância,
 * mais os nomes antigos (`opex`, `agentes/...`). Canais de outros apps continuam permitidos (OPE-206, regra 3).
 */
export function isReservedChannel(ns: ChannelNamespace, slug: string): boolean {
    return isManagedReal(ns, slug) || isManagedLogical(slug)
}

/** Ponta do nome mostrada na tela (nome lógico). */
export function channelDisplay(ns: ChannelNamespace | null | undefined, real: string): string {
    return ns ? logicalChannel(ns, real) : real
}

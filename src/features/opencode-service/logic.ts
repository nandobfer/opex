import { latestStable, parseSemver, isNewer } from "@/features/opencode-resources/versions"
import { OPENCODE_SUPPORTED_MAJOR } from "./constants"

/** Regras puras do serviço do OpenCode: versão disponível com a trava da 2.x. */

export interface OpencodeUpdateInfo {
    current: string | null
    /** Última versão da major suportada (2.x). */
    latestSupported: string | null
    /** Última versão de uma major nova (3.x+), quando houver. */
    latestMajor: string | null
    available: boolean
}

export function updateInfo(current: string | null, versions: readonly string[]): OpencodeUpdateInfo {
    const latestSupported = latestStable(versions, OPENCODE_SUPPORTED_MAJOR)
    const newest = latestStable(versions)
    const newestMajor = parseSemver(newest)?.major ?? null
    const latestMajor = newest && newestMajor !== null && newestMajor > OPENCODE_SUPPORTED_MAJOR ? newest : null
    return { current, latestSupported, latestMajor, available: isNewer(latestSupported, current) || isNewer(latestMajor, current) }
}

/**
 * Versão alvo de "Atualizar OpenCode": sem pedido, a última 2.x. Major nova só com `allowMajor`
 * (confirmação extra de possível incompatibilidade).
 */
export function resolveUpgradeTarget(info: OpencodeUpdateInfo, requested: string | undefined, allowMajor: boolean): { version: string } | { error: string } {
    const target = requested?.replace(/^v/, "") ?? info.latestSupported
    if (!target || !parseSemver(target)) return { error: "Não foi possível descobrir a versão para atualizar" }
    const major = parseSemver(target)!.major
    if (major > OPENCODE_SUPPORTED_MAJOR && !allowMajor) return { error: `A versão ${target} é de uma major nova (${major}.x) e pode ser incompatível com o Opex (feito para o OpenCode ${OPENCODE_SUPPORTED_MAJOR}.x): confirme com allowMajor` }
    if (major < OPENCODE_SUPPORTED_MAJOR) return { error: `O Opex exige o OpenCode ${OPENCODE_SUPPORTED_MAJOR}.x` }
    if (info.current && !isNewer(target, info.current) && !requested) return { error: `O OpenCode já está na versão mais recente (${info.current})` }
    return { version: target }
}

/** Porta do servidor a partir da URL (padrão do esquema). */
export function portOf(url: string | null | undefined): number | null {
    if (!url) return null
    try {
        const parsed = new URL(url)
        return parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80
    } catch {
        return null
    }
}

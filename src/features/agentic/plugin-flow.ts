import { PLUGIN_WORKDIR_SEGMENT } from "@/features/plugins/constants"
import type { CentralConfig } from "./schemas"

/**
 * Regras puras do fluxo Plugin da mesa (OPE-172): a tarefa do tipo Plugin reaproveita as etapas da
 * mesa, mas troca worktree/prévia em container/PR por pasta de trabalho, versão `preview` ao vivo,
 * testes do plugin no host e consolidação da versão como `stable`.
 */

/** Ref "remota" do commit base na pasta de trabalho: o diff do Agente Adversário é `origin/opex-base...HEAD`. */
export const PLUGIN_BASE_BRANCH = "opex-base"
/** Branch local da pasta de trabalho. */
export const PLUGIN_WORK_BRANCH = "plugin"

/** Tentativas automáticas de correção de manifesto/compilação por implementação. */
export const PLUGIN_COMPILE_ATTEMPTS_MAX = 3
/** Teto técnico dos testes do plugin no host. */
export const PLUGIN_TESTS_TIMEOUT_MS = 15 * 60_000

/** Pasta de trabalho da mesa Plugin no host (ao lado dos worktrees da central). */
export function pluginWorkDirFor(config: CentralConfig, code: string): string {
    const root = config.worktreeRoot || `${config.sessionDirectory}/worktrees`
    return `${root}/${PLUGIN_WORKDIR_SEGMENT}/${code.toLowerCase()}`
}

/** Onde ver a prévia (regra em `plugins/logic.ts`). */
export { pluginPreviewPath } from "@/features/plugins/logic"

export type PluginTestsDecision = "consolidate" | "fix" | "fail"

/** Depois dos testes no host: passou → consolida; falhou → corrige até o limite; senão a mesa falha. */
export function pluginTestsDecision(exitCode: number | null, attempts: number, maxAttempts: number): PluginTestsDecision {
    if (exitCode === 0) return "consolidate"
    return attempts < maxAttempts ? "fix" : "fail"
}

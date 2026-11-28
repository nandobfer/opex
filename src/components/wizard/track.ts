/**
 * Até onde a trilha do stepper fica verde (módulo puro): o índice da última etapa concluída ou pulada,
 * contando em sequência desde a primeira (`-1` = nenhuma).
 */
export function resolvedTrackIndex(statuses: readonly string[]): number {
    let last = -1
    for (const [index, status] of statuses.entries()) {
        if (status !== "done" && status !== "skipped") break
        last = index
    }
    return last
}

/** Posição (0–1) do centro do círculo da etapa `index` na trilha (`-1` = início). */
export const trackPosition = (index: number, total: number) => (total > 0 && index >= 0 ? (index + 0.5) / total : 0)

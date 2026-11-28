/**
 * Tempo mínimo da prévia remota (GitHub Action): o workflow roda testes completos e o build antes de
 * publicar, então o limite nunca pode ser menor que isto. Vale tanto para a espera do turno (`workflow.ts`)
 * quanto para o prazo gravado no estado que o script `scripts/preview-github.ts` usa para desistir.
 */
export const REMOTE_BUILD_MIN_MINUTES = 25

export function remoteBuildTimeoutMinutes(configuredMinutes: number): number {
    return Math.max(REMOTE_BUILD_MIN_MINUTES, configuredMinutes)
}

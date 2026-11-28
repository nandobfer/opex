/**
 * OPE-210: libera as ferramentas de currículo no Candidatador e atualiza as instruções e as memórias de
 * currículo. Só no Opex original em produção; nunca lança (ver `candidatador-patch.ts`).
 */
export async function candidatadorCurriculoTools(): Promise<void> {
    const { applyCandidatadorCurriculoPatch } = await import("@/features/agent-documents/server/candidatador-patch")
    await applyCandidatadorCurriculoPatch()
}

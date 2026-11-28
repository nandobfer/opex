/**
 * OPE-215: índices do bootstrap de projeto, inclusive a trava única de um bootstrap aberto por repositório
 * (models carregados antes da conexão podem não receber autoIndex). Idempotente; roda dentro do
 * `dbConnect()` (não chama `dbConnect` de novo, para não travar o registro).
 */
export async function ensureProjectBootstrapIndexes(): Promise<void> {
    const { ProjectBootstrap } = await import("@/features/project-bootstrap/server/models")
    await ProjectBootstrap.createIndexes()
}

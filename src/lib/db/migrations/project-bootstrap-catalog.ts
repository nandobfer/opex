/**
 * OPE-215: carga inicial do catálogo de tecnologias do Agente de Bootstrap (grupos e tecnologias),
 * gravada uma única vez — depois da marca, o que o dono remover não volta.
 */
export async function seedProjectBootstrapCatalog(): Promise<void> {
    const { seedTechCatalog } = await import("@/features/project-bootstrap/server/catalog")
    await seedTechCatalog()
}

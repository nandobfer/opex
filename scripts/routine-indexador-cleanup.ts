/**
 * Arquiva as memórias de catálogo em prosa (sem chave) do canal próprio de um agente rotineiro
 * (OPE-130, D16). Roda com `npx tsx scripts/routine-indexador-cleanup.ts [--slug indexador] --dry-run`
 * e, conferida a lista, `--apply`. Arquivar é reversível (Restaurar na rede); cada item vai para a
 * auditoria. Também confere que as entradas do canal do catálogo têm chave `catalogo-…`.
 */
// `.env` sem sobrescrever o que veio do shell (ex.: MONGODB_URI com localhost fora do Docker).
{
    const shell = { ...process.env }
    process.loadEnvFile?.(".env")
    Object.assign(process.env, shell)
}

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const slug = args[args.indexOf("--slug") + 1] && args.includes("--slug") ? args[args.indexOf("--slug") + 1]! : "indexador"
const catalogChannel = args.includes("--catalog") ? args[args.indexOf("--catalog") + 1]! : "experiencia/desenvolvimento"

async function main() {
    const { dbConnect } = await import("@/lib/db")
    await dbConnect()
    const { engramindCall } = await import("@/features/engramind/server/client")
    const { recordAudit, AcaoAuditoria } = await import("@/lib/audit/record")
    const { AI_MEMORY_AUDIT_ENTITY } = await import("@/features/ai/constants")
    const { isCatalogProse, catalogRepoOf } = await import("@/features/routine-agents/memory-cleanup")
    const { routineChannelOf } = await import("@/features/routine-agents/constants")
    type Row = { id: string; text: string; title: string | null; key?: string | null; status: string; channel: string; author?: { agent?: string | null } | null; origin?: { source?: string | null } | null }
    const listAll = async (channel: string) => {
        const rows: Row[] = []
        let cursor: string | null = null
        do {
            const page: { memories: Row[]; next_cursor: string | null } = await engramindCall("GET", { path: "/v1/memories", query: { channels: channel, status: "active,permanent", limit: 100, ...(cursor ? { cursor } : {}) } })
            rows.push(...page.memories.filter((row) => row.channel === channel))
            cursor = page.next_cursor
        } while (cursor)
        return rows
    }
    const own = routineChannelOf(slug)
    const rows = await listAll(own)
    const { routineAgentRef } = await import("@/features/routine-agents/server/engramind")
    const agentRef = routineAgentRef(slug)
    // Só o que o próprio agente gravou: entradas do dono (ou de outro autor) ficam, mesmo que o texto case.
    const selected = rows.filter((row) => isCatalogProse(row, agentRef))
    const byRepo = new Map<string, number>()
    for (const row of selected) byRepo.set(catalogRepoOf(row) ?? "?", (byRepo.get(catalogRepoOf(row) ?? "?") ?? 0) + 1)
    console.info(`[cleanup] ${own}: ${rows.length} ativas, ${selected.length} de catálogo em prosa gravadas por ${agentRef} a arquivar, ${rows.length - selected.length} ficam`)
    for (const [repo, count] of [...byRepo].sort()) console.info(`  ${repo}: ${count}`)
    for (const row of selected) console.info(`  - ${row.id} ${(row.title ?? row.text).slice(0, 80).replace(/\s+/g, " ")}`)
    const catalog = await listAll(catalogChannel)
    const noKey = catalog.filter((row) => !row.key?.startsWith("catalogo-"))
    console.info(`[cleanup] ${catalogChannel}: ${catalog.length} entradas; ${noKey.length} sem chave catalogo-…${noKey.length ? ": " + noKey.map((row) => row.id).join(", ") : ""} (não são alteradas)`)
    if (!apply) {
        console.info("[cleanup] --dry-run: nada foi alterado. Rode com --apply para arquivar.")
        return
    }
    for (const row of selected) {
        await engramindCall("POST", { path: `/v1/memories/${encodeURIComponent(row.id)}/archive`, body: {} })
        await recordAudit({ userId: "local", entidade: AI_MEMORY_AUDIT_ENTITY, entidadeId: row.id, acao: AcaoAuditoria.ATUALIZAR, antes: { status: row.status }, depois: { status: "archived", canal: own, rotineiro: slug, origem: "limpeza OPE-130 (catálogo em prosa)" } })
    }
    console.info(`[cleanup] ${selected.length} memórias arquivadas.`)
}

main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
        console.error("[cleanup] falhou:", error instanceof Error ? error.message : error)
        process.exit(1)
    })

import type { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/audit/record"
import { isPreviewInstance } from "@/lib/instance"
import { agentDocsLog } from "./store"

/**
 * Migração de dados do Candidatador (OPE-210, decisão do dono: no deploy). Libera as ferramentas de
 * currículo, acrescenta o bloco do fluxo novo nas instruções e reescreve as memórias
 * `curriculos-armazenamento` e `curriculos-gerados` no canal próprio dele.
 *
 * - Roda só no Opex original em produção: a prévia e o dev usam o mesmo banco e não podem aplicar antes
 *   do merge (as ferramentas ainda não existiriam em produção).
 * - A parte do Mongo é idempotente (`$addToSet` e bloco com marcador). A do Engramind roda em segundo plano
 *   e nunca derruba o `dbConnect`; só depois do sucesso grava o marcador `migrations.ope210CurriculoAt`.
 *   Sem marcador, tenta de novo no próximo início. Cada falha vai para o log e para a auditoria do agente.
 * - `curriculos-gerados` preserva o índice antigo (currículos do workspace do Galaxy) abaixo do texto novo.
 */

export const CANDIDATADOR_SLUG = "candidatador"
export const CANDIDATADOR_TOOLS = ["preparar_curriculo", "obter_curriculo", "get_s3", "upload_s3"] as const
export const CURRICULO_BLOCK_START = "<!-- OPE-210:curriculo -->"
export const CURRICULO_BLOCK_END = "<!-- /OPE-210:curriculo -->"
export const MEMORY_MARKER = "[OPE-210]"
const AUDIT_ENTITY = "AgenteRotineiro"

export const CURRICULO_INSTRUCTIONS_BLOCK = [
    CURRICULO_BLOCK_START,
    "## Currículo de cada candidatura (catálogo do Opex)",
    "1. Antes de gerar, chame `obter_curriculo` (empresa, parte da vaga ou jobId) para reaproveitar um currículo já gerado para a mesma vaga.",
    "2. Para gerar, chame `preparar_curriculo` passando só o conteúdo (nome, subtítulo, contato, perfil, competências por grupo, experiências com tópicos, linha Earlier, trabalhos em destaque, formação, certificações, idiomas, idioma do currículo) mais empresa, vaga e jobId. O modelo aprovado pelo dono é fixo e o ajuste a 1 página é automático; ele devolve a URL do PDF, do HTML e da prévia PNG.",
    "3. Para anexar, use um único `run_code` no Galaxy: `const buf = await (await page.request.get(url)).body()` e depois `setInputFiles({ name, mimeType: 'application/pdf', buffer: buf })`. A URL vale por pouco tempo: se expirou, peça outra com `obter_curriculo`.",
    "4. Nunca monte HTML nem PDF no navegador do Galaxy e não grave currículos no disco do Galaxy. Outros arquivos que precisar guardar vão por `upload_s3` (e são lidos por `get_s3`).",
    CURRICULO_BLOCK_END,
].join("\n")

export const CURRICULOS_ARMAZENAMENTO_TEXT = [
    `${MEMORY_MARKER} Regra do dono: todo currículo de candidatura é gerado e guardado pelo Opex, no catálogo dos arquivos dos agentes. O disco do Galaxy não é mais usado para currículos.`,
    "",
    "1. Reaproveitar: `obter_curriculo` (empresa, parte da vaga, jobId, período ou id) devolve os currículos já gerados com URLs novas (PDF, HTML, PNG) e o conteúdo estruturado usado, para ajustar e gerar de novo sem reescrever tudo.",
    "2. Gerar: `preparar_curriculo` recebe só o conteúdo estruturado e monta o HTML com o modelo aprovado pelo dono (curriculo-fernando-burgos-2026-11-15), fixo. Ele tenta o CSS exato do modelo (com escala até 0,95) e, se não couber, o CSS compacto (body 8,25pt, @page 9mm/12mm, line-height 1,22, margem do h2 6px) com escala até 0,80. Devolve páginas, `coube`, a densidade e as URLs. Se `coube` for false, encurte o conteúdo e gere de novo.",
    "3. Nomes: o Opex nomeia AAAA-MM-DD-<empresa>-<vaga> (.pdf, .html e .png) e grava empresa, vaga, jobId e idioma nos metadados. Não é preciso informar o nome.",
    "4. Anexar: um único `run_code` com `const buf = await (await page.request.get(url)).body()` e `setInputFiles({ name, mimeType: 'application/pdf', buffer: buf })`. A URL é temporária (15 min por padrão).",
    "5. Ordem das seções e conteúdo seguem o modelo aprovado: nome; subtítulo-alvo; contato numa linha; Profile (parágrafo único, com \"7 years of professional experience, programming since 2012\"); Core skills por grupo; Experience (cargo, período, empresa e tópicos; linha Earlier sem nomear empresa); Selected AI work; Education & languages (sem datas).",
    "6. Nunca inventar: empresa do período de trainee, descrição da Quaestum ou datas de formação. A lacuna fica declarada no próprio currículo.",
    "7. Outros arquivos: `upload_s3` guarda texto/base64 (até 5 MB) ou devolve uma URL de envio (PUT) para o navegador do Galaxy mandar o arquivo direto; `get_s3` lê por id ou filtros.",
].join("\n")

const CURRICULOS_GERADOS_HEADER = [
    `${MEMORY_MARKER} O catálogo dos currículos agora é o do Opex: consulte com \`obter_curriculo\` (por empresa, vaga, jobId, período ou id), que devolve URLs novas e o conteúdo usado. Não é preciso manter este índice à mão para os currículos novos.`,
    "",
    "Histórico anterior ao catálogo do Opex (arquivos no workspace do Galaxy, só para consulta):",
].join("\n")

/** Texto novo de `curriculos-gerados`: cabeçalho do catálogo do Opex e o índice antigo preservado. */
export function curriculosGeradosText(current: string | null): string {
    if (current?.includes(MEMORY_MARKER)) return current
    return current?.trim() ? `${CURRICULOS_GERADOS_HEADER}\n\n${current.trim()}` : CURRICULOS_GERADOS_HEADER.split("\n\n")[0]!
}

/** Instruções com o bloco do fluxo novo (sem duplicar). */
export function withCurriculoBlock(instructions: string): string {
    if (instructions.includes(CURRICULO_BLOCK_START)) return instructions
    return `${instructions.trimEnd()}\n\n${CURRICULO_INSTRUCTIONS_BLOCK}`
}

export function shouldRunCandidatadorPatch(env: { nodeEnv?: string; preview: boolean }): boolean {
    return env.nodeEnv === "production" && !env.preview
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 300)

async function auditFailure(agentId: string, reason: string): Promise<void> {
    await recordAudit({ userId: "local", entidade: AUDIT_ENTITY, entidadeId: agentId, acao: AcaoAuditoria.EXECUTAR, depois: { operacao: "migração OPE-210", erro: `falha ao atualizar memórias do Candidatador: ${reason}` } })
}

type MemoryRow = { id: string; text: string; key?: string | null; channel: string; category?: string | null; title?: string | null }

/** Regrava as duas memórias por chave no canal próprio do Candidatador. */
export async function patchCandidatadorMemories(): Promise<void> {
    const [{ engramindCall }, { channelNamespace }, { routineChannelOf }] = await Promise.all([
        import("@/features/engramind/server/client"),
        import("@/features/engramind/server/instance"),
        import("@/features/routine-agents/constants"),
    ])
    const channel = routineChannelOf(CANDIDATADOR_SLUG, await channelNamespace())
    const read = async (key: string) => {
        const page = await engramindCall<{ memories: MemoryRow[] }>("GET", { path: "/v1/memories", query: { channels: channel, key, limit: 5 } })
        return (page.memories ?? []).find((row) => row.channel === channel && row.key === key) ?? null
    }
    const origin = { source: "rotineiro", label: "Opex · migração OPE-210" }
    const write = async (key: string, text: string, title: string, category: string | null | undefined) => {
        await engramindCall("POST", { path: "/v1/memories", body: { channel, key, upsert: true, text, title, origin, ...(category ? { category } : {}) } })
    }
    const storage = await read("curriculos-armazenamento")
    if (!storage?.text.includes(MEMORY_MARKER)) {
        await write("curriculos-armazenamento", CURRICULOS_ARMAZENAMENTO_TEXT, "Currículos: gerar e guardar pelo catálogo do Opex (preparar_curriculo, obter_curriculo); modelo aprovado fixo", storage?.category ?? "PROJECT_RULES")
    }
    const index = await read("curriculos-gerados")
    const next = curriculosGeradosText(index?.text ?? null)
    if (next !== index?.text) await write("curriculos-gerados", next, "Currículos gerados: catálogo do Opex (obter_curriculo) e histórico anterior no Galaxy", index?.category ?? "PROJECT_RULES")
}

/**
 * Migração (registrada em `src/lib/db/migrations/registry.ts`). Nunca lança: falha vai para o log e a
 * auditoria e a próxima inicialização tenta de novo.
 */
export async function applyCandidatadorCurriculoPatch(options: { background?: boolean } = {}): Promise<void> {
    if (!shouldRunCandidatadorPatch({ nodeEnv: process.env.NODE_ENV, preview: isPreviewInstance() })) return
    try {
        await applyPatch(options)
    } catch (error) {
        agentDocsLog.warn({ reason: reasonOf(error) }, "[agent-documents] Candidatador: falha na migração OPE-210 (tenta de novo no próximo início)")
    }
}

async function applyPatch(options: { background?: boolean }): Promise<void> {
    const { RoutineAgent } = await import("@/lib/db/models/RoutineAgent")
    const agent = await RoutineAgent.collection.findOne<{ _id: Types.ObjectId; instructions?: string; opex?: { enabledTools?: string[] }; migrations?: { ope210CurriculoAt?: Date } }>(
        { slug: CANDIDATADOR_SLUG },
        { projection: { instructions: 1, "opex.enabledTools": 1, migrations: 1 } },
    )
    if (!agent || agent.migrations?.ope210CurriculoAt) return
    const agentId = String(agent._id)
    const before = agent.opex?.enabledTools ?? []
    const instructions = agent.instructions ?? ""
    const nextInstructions = withCurriculoBlock(instructions)
    const missing = CANDIDATADOR_TOOLS.filter((tool) => !before.includes(tool))
    if (missing.length || nextInstructions !== instructions) {
        await RoutineAgent.collection.updateOne({ _id: agent._id }, { $addToSet: { "opex.enabledTools": { $each: [...CANDIDATADOR_TOOLS] } }, $set: { instructions: nextInstructions } } as never)
        await recordAudit({
            userId: "local",
            entidade: AUDIT_ENTITY,
            entidadeId: agentId,
            acao: AcaoAuditoria.ATUALIZAR,
            antes: { ferramentas: before, instrucoes: instructions.length },
            depois: { ferramentas: [...before, ...missing], instrucoes: nextInstructions.length, origem: "migração OPE-210" },
        })
        agentDocsLog.info({ agentId, added: missing }, "[agent-documents] Candidatador: ferramentas de currículo liberadas e instruções atualizadas")
    }
    const memories = async () => {
        try {
            await patchCandidatadorMemories()
            await RoutineAgent.collection.updateOne({ _id: agent._id }, { $set: { "migrations.ope210CurriculoAt": new Date() } } as never)
            agentDocsLog.info({ agentId }, "[agent-documents] Candidatador: memórias de currículo atualizadas")
        } catch (error) {
            const reason = reasonOf(error)
            agentDocsLog.warn({ agentId, reason }, "[agent-documents] Candidatador: falha ao atualizar as memórias de currículo (tenta de novo no próximo início)")
            await auditFailure(agentId, reason)
        }
    }
    if (options.background === false) await memories()
    else void memories()
}

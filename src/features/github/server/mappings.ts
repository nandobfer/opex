import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { GithubMapping } from "@/lib/db/models/Github"
import { GITHUB_AUDIT } from "../constants"
import { DEFAULT_PRIORITY_RULES, DEFAULT_TYPE_RULES } from "../logic"
import type { MappingInput } from "../schemas"
import type { GithubMappingDto } from "../types"
import { publishGithubUpdated } from "./events"

const KEY = "default"

/** Regras de tipo e prioridade (sem documento salvo: os valores iniciais do código). */
export async function getMapping(): Promise<GithubMappingDto> {
    await dbConnect()
    const doc = await GithubMapping.findOne({ key: KEY }).lean()
    if (!doc) return { typeRules: DEFAULT_TYPE_RULES, priorityRules: DEFAULT_PRIORITY_RULES, isDefault: true }
    return { typeRules: doc.typeRules as GithubMappingDto["typeRules"], priorityRules: doc.priorityRules as GithubMappingDto["priorityRules"], isDefault: false }
}

export async function saveMapping(input: MappingInput, actorId: string): Promise<GithubMappingDto> {
    const before = await getMapping()
    await GithubMapping.updateOne({ key: KEY }, { $set: { typeRules: input.typeRules, priorityRules: input.priorityRules, updatedAt: new Date() } }, { upsert: true })
    await recordAudit({
        userId: actorId,
        entidade: GITHUB_AUDIT.mapping,
        entidadeId: KEY,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { tipos: before.typeRules, prioridades: before.priorityRules },
        depois: { tipos: input.typeRules, prioridades: input.priorityRules },
    })
    await publishGithubUpdated("mappings")
    // Rascunhos pendentes reaplicam o mapeamento nos campos não editados.
    const { remapPendingDrafts } = await import("./drafts")
    await remapPendingDrafts()
    return { ...input, isDefault: false }
}

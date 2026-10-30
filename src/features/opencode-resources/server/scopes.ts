import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { AgenticCentral } from "@/lib/db/models/Agentic"
import { GLOBAL_SCOPE } from "../constants"
import type { OpencodeScopeDto } from "../types"

/** Escopos dos recursos: global (usuário) e o diretório das sessões de cada central (projeto). */

export const GLOBAL_SCOPE_DTO: OpencodeScopeDto = { id: GLOBAL_SCOPE, label: "Global (usuário)", directory: null }

export async function listScopes(): Promise<OpencodeScopeDto[]> {
    await dbConnect()
    const centrals = await AgenticCentral.find({}).select({ projectName: 1, config: 1 }).sort({ projectName: 1 }).lean()
    const projects: OpencodeScopeDto[] = []
    for (const central of centrals) {
        const directory = typeof central.config?.sessionDirectory === "string" ? central.config.sessionDirectory.trim() : ""
        if (directory && directory !== "/") projects.push({ id: `central:${String(central._id)}`, label: central.projectName, directory })
    }
    return [GLOBAL_SCOPE_DTO, ...projects]
}

export async function resolveScope(scopeId: string): Promise<OpencodeScopeDto> {
    if (scopeId === GLOBAL_SCOPE) return GLOBAL_SCOPE_DTO
    const scope = (await listScopes()).find((item) => item.id === scopeId)
    if (!scope) throw new DomainError(404, "Projeto não encontrado: o escopo precisa ser uma central com diretório das sessões", "OPENCODE_SCOPE_NOT_FOUND")
    return scope
}

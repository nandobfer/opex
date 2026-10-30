import { listAiModels } from "@/lib/ai/catalog"
import type { AiModelDto } from "@/lib/ai/providers"
import { AiProviderError } from "@/lib/ai/errors"
import { DomainError } from "@/lib/api/route"

/** Catálogo de modelos do OpenCode para o seletor do chat do Maddox (sem dados de conta ou custo). */
export async function listMaddoxModels(): Promise<AiModelDto[]> {
    try {
        return await listAiModels("opencode")
    } catch (error) {
        if (error instanceof AiProviderError) throw new DomainError(502, error.message, "MADDOX_UNAVAILABLE")
        throw error
    }
}

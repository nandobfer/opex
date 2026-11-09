import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AiModelFavorite } from "@/lib/db/models/AiModelFavorite"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { AI_MODEL_FAVORITES_AUDIT_ENTITY, AI_MODEL_FAVORITES_UPDATED_EVENT } from "../constants"
import type { ModelFavoriteDto, ModelFavoritesDto } from "../schemas"

/** Modelos de IA favoritos por usuário. Somente servidor. Favoritar e desfavoritar são idempotentes. */

const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000

export async function listModelFavorites(userId: string): Promise<ModelFavoritesDto> {
    await dbConnect()
    const docs = await AiModelFavorite.find({ userId }).sort({ createdAt: 1 }).lean()
    return { favorites: docs.map((doc) => ({ provider: doc.provider, model: doc.model })) }
}

async function changed(favorite: ModelFavoriteDto, userId: string, action: "added" | "removed"): Promise<void> {
    await recordAudit({
        userId,
        entidade: AI_MODEL_FAVORITES_AUDIT_ENTITY,
        entidadeId: `${favorite.provider}:${favorite.model}`,
        acao: action === "added" ? AcaoAuditoria.CRIAR : AcaoAuditoria.EXCLUIR,
        antes: action === "removed" ? { ...favorite } : undefined,
        depois: action === "added" ? { ...favorite } : undefined,
    })
    loggerFor({ userId }).info({ ...favorite, action }, "Modelos favoritos atualizados")
    await publishAppEvent(AI_MODEL_FAVORITES_UPDATED_EVENT, { ...favorite, action })
}

/** Favorita o modelo; se já é favorito, nada muda (sem auditoria nem evento) e devolve a lista. */
export async function addModelFavorite(favorite: ModelFavoriteDto, userId: string): Promise<ModelFavoritesDto> {
    await dbConnect()
    const filter = { userId, provider: favorite.provider, model: favorite.model }
    if (!(await AiModelFavorite.findOne(filter).lean())) {
        try {
            await AiModelFavorite.create({ ...filter, createdAt: new Date() })
            await changed(favorite, userId, "added")
        } catch (error) {
            // Duas estrelas ao mesmo tempo (outra aba): o índice único segura e o resultado é o mesmo.
            if (!isDuplicateKey(error)) throw error
        }
    }
    return listModelFavorites(userId)
}

/** Remove o favorito; se não era favorito, nada muda (sem auditoria nem evento) e devolve a lista. */
export async function removeModelFavorite(favorite: ModelFavoriteDto, userId: string): Promise<ModelFavoritesDto> {
    await dbConnect()
    const result = await AiModelFavorite.deleteOne({ userId, provider: favorite.provider, model: favorite.model })
    if (result.deletedCount > 0) await changed(favorite, userId, "removed")
    return listModelFavorites(userId)
}

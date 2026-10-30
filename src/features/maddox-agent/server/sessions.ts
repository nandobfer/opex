import { clientOpexScope, OWNER_SCOPE, withAgent, type OpexServerScope } from "@/features/opex-agent/server/scope"
import { createSession, loadSession, publishSessionUpdated, toSessionDto, updateSession } from "@/features/opex-agent/server/sessions"
import type { OpexMessageDto, OpexSessionDto } from "@/features/opex-agent/types"
import type { ClientActor } from "@/features/auth/server/context"
import { listAiModels } from "@/lib/ai/catalog"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { OpexSession, type IOpexSession } from "@/lib/db/models/Opex"
import { MADDOX_AUDIT_ENTITY } from "@/features/opex-agent/constants"
import type { CreateMaddoxSessionInput, UpdateMaddoxSessionInput } from "../schemas"
import { sendMaddoxMessage } from "./runner"

/**
 * Sessões do Agente Maddox (SOMENTE servidor): as mesmas coleções e serviços do Agente Opex com o
 * escopo marcado `agent: "maddox"` (as sessões dos dois agentes nunca se misturam: outra é 404), mais a
 * troca de modelo só da sessão.
 */

export const MADDOX_OWNER_SCOPE: OpexServerScope = withAgent(OWNER_SCOPE, "maddox")

export const clientMaddoxScope = (actor: ClientActor): OpexServerScope => withAgent(clientOpexScope(actor), "maddox")

/** Modelo (e variante) conferidos no catálogo do OpenCode; `null` = volta ao padrão. */
async function validModelOverride(model: string | null | undefined, variant: string | null | undefined): Promise<IOpexSession["modelOverride"]> {
    if (!model) return null
    const catalog = await listAiModels("opencode").catch(() => null)
    if (!catalog) throw new DomainError(502, "Não foi possível ler o catálogo de modelos do OpenCode", "MADDOX_UNAVAILABLE")
    const found = catalog.find((item) => item.id === model)
    if (!found) throw new DomainError(400, `Modelo ${model} não está disponível no OpenCode`, "AI_MODEL_NOT_FOUND")
    if (variant && !found.variants.includes(variant)) throw new DomainError(400, `Variante "${variant}" não existe no modelo ${found.name}`, "AI_VARIANT_NOT_FOUND")
    return { model, variant: variant || null }
}

/** Cria a sessão (com o modelo escolhido na "Nova sessão") e, com `text`, já envia a primeira mensagem. */
export async function createMaddoxSession(input: CreateMaddoxSessionInput, actorId: string, scope: OpexServerScope): Promise<{ session: OpexSessionDto; message: OpexMessageDto | null }> {
    const modelOverride = await validModelOverride(input.model, input.variant)
    const session = await createSession(actorId, scope, { modelOverride })
    const message = input.text ? await sendMaddoxMessage(session.id, { text: input.text }, actorId, scope) : null
    return { session, message }
}

/** Renomeia/arquiva (serviço do Agente Opex) e troca o modelo só desta sessão (vale no próximo turno). */
export async function updateMaddoxSession(id: string, input: UpdateMaddoxSessionInput, actorId: string, scope: OpexServerScope): Promise<OpexSessionDto> {
    let dto: OpexSessionDto | null = null
    if (input.title !== undefined || input.archived !== undefined) dto = await updateSession(id, { title: input.title, archived: input.archived }, actorId, scope)
    if (input.model !== undefined) {
        const before = await loadSession(id, scope)
        const modelOverride = await validModelOverride(input.model, input.variant)
        await OpexSession.updateOne({ _id: before._id }, { $set: { modelOverride } })
        await recordAudit({
            userId: actorId,
            entidade: MADDOX_AUDIT_ENTITY,
            entidadeId: id,
            acao: AcaoAuditoria.ATUALIZAR,
            antes: { modelo: before.modelOverride?.model ?? "padrão", variante: before.modelOverride?.variant ?? null },
            depois: { modelo: modelOverride?.model ?? "padrão", variante: modelOverride?.variant ?? null },
        })
        await publishSessionUpdated(id)
        dto = toSessionDto(await loadSession(id, scope))
    }
    return dto ?? toSessionDto(await loadSession(id, scope))
}

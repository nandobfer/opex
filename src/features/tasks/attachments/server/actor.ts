import type { NextRequest } from "next/server"
import { DomainError } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireClientActor, sessionFromRequest } from "@/features/auth/server/context"

/**
 * Quem está enviando/consultando anexos. O **dono** (sessão `admin`) alcança tudo; o **usuário do
 * portal** (sessão `client`) só o que é do cliente selecionado. A pré-visualização do dono no portal
 * continua sendo o dono (pode tudo).
 */
export interface AttachmentActor {
    kind: "owner" | "client"
    /** Autor para auditoria (dono: `local`; cliente: id do usuário). */
    userId: string
    /** Nome exibido do autor. */
    name: string
    /** Cliente em escopo quando é usuário do portal. */
    clientId: string | null
}

/** Ator do **dono** (app interno, prévia do dono e o cadastro feito por ele). */
export function ownerAttachmentActor(): AttachmentActor {
    const owner = getLocalUser()
    return { kind: "owner", userId: owner.id, name: owner.name, clientId: null }
}

/** Ator de um **usuário do portal**, a partir do cliente em escopo. */
export function clientAttachmentActor(input: { clientId: string; userId: string; name: string }): AttachmentActor {
    return { kind: "client", userId: input.userId, name: input.name, clientId: input.clientId }
}

/** Resolve o ator dos anexos a partir da sessão (dono ou usuário do portal). */
export async function resolveAttachmentActor(req: NextRequest): Promise<AttachmentActor> {
    const session = await sessionFromRequest(req)
    if (!session) throw new DomainError(401, "Sessão ausente ou expirada.", "UNAUTHENTICATED")
    if (session.kind === "admin") return ownerAttachmentActor()
    const actor = await requireClientActor(req)
    return clientAttachmentActor({ clientId: String(actor.client._id), userId: actor.userId, name: actor.displayName })
}

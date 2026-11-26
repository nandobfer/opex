import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { contactKindSchema } from "@/features/evolution-api/schemas"
import { listContacts, syncContacts } from "@/features/evolution-api/server/contacts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/evolution/contacts?kind=contacts|groups|chats — lista com nome e foto (cache do Opex). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const kind = contactKindSchema.safeParse(req.nextUrl.searchParams.get("kind") ?? "chats")
    if (!kind.success) throw new DomainError(400, "Tipo inválido: use contacts, groups ou chats", "VALIDATION_ERROR")
    return ok(await listContacts(kind.data))
})

/** POST /api/evolution/contacts — sincroniza fotos e nomes a partir da Evolution. */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await syncContacts(getLocalUser().id))
})

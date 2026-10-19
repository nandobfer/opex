import { created } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientOpexEnabled } from "@/features/opex-agent/server/client-config"
import { completeOpexFile } from "@/features/opex-agent/server/files"
import { loadOpexSettings } from "@/features/opex-agent/server/settings"
import { clientOpexScope } from "@/features/opex-agent/server/scope"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/opex/files/[id]/complete — confirma o envio (HeadObject + tamanho). Idempotente. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    const { settings } = await loadOpexSettings()
    return created(await completeOpexFile(params.id, settings.files, clientOpexScope(actor)))
})

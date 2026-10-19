import { created } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { completeOpexFile } from "@/features/opex-agent/server/files"
import { loadOpexSettings } from "@/features/opex-agent/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/opex/files/[id]/complete — confirma o envio (HeadObject, confere o tamanho e promove). Idempotente. */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    const { settings } = await loadOpexSettings()
    return created(await completeOpexFile(params.id, settings.files))
})

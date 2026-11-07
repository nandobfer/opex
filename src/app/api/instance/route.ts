import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { isPreviewInstance, PREVIEW_SCHEDULER_MESSAGE } from "@/lib/instance"
import type { InstanceInfoDto } from "@/lib/types/instance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/instance — se esta instância é uma prévia do Opex (agendador automático desligado, OPE-147). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const preview = isPreviewInstance()
    const data: InstanceInfoDto = { preview, schedulerMessage: preview ? PREVIEW_SCHEDULER_MESSAGE : null }
    return ok(data)
})

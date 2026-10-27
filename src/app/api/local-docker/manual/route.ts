import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { localDockerBootstrapQuerySchema } from "@/features/local-docker/schemas"
import { getManualSteps } from "@/features/local-docker/server/settings"
import { assertBuilderMachineActive } from "@/features/local-docker/server/active"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/local-docker/manual?mirrored=1 — passo a passo manual do preparo do PC (mesmo conteúdo do script). */
export const GET = withRoute(async ({ req }) => {
    await assertBuilderMachineActive()
    const query = localDockerBootstrapQuerySchema.safeParse({ mirrored: new URL(req.url).searchParams.get("mirrored") ?? undefined })
    return ok({ steps: await getManualSteps({ mirrored: query.success && query.data.mirrored === "1" }) })
})

import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { localDockerBootstrapQuerySchema } from "@/features/local-docker/schemas"
import { getBootstrapScript } from "@/features/local-docker/server/settings"
import { assertBuilderMachineActive } from "@/features/local-docker/server/active"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/local-docker/bootstrap?mirrored=1 — script de preparo único do PC (WSL). */
export const GET = withRoute(async ({ req }) => {
    await assertBuilderMachineActive()
    const query = localDockerBootstrapQuerySchema.safeParse({ mirrored: new URL(req.url).searchParams.get("mirrored") ?? undefined })
    return ok({ script: await getBootstrapScript({ mirrored: query.success && query.data.mirrored === "1" }) })
})

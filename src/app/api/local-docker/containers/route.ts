import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listPcContainers } from "@/features/local-docker/server/containers"
import { assertBuilderMachineActive } from "@/features/local-docker/server/active"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/local-docker/containers — containers de prévia e de ambiente no PC, com CPU e memória. */
export const GET = withRoute(async () => {
    await assertBuilderMachineActive()
    return ok(await listPcContainers())
})

import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalDockerStatus } from "@/features/local-docker/server/tunnel"
import { assertBuilderMachineActive } from "@/features/local-docker/server/active"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/local-docker/status — confere agora o PC, o túnel e o Docker dele, e lista as prévias no PC. */
export const GET = withRoute(async () => {
    await assertBuilderMachineActive()
    return ok(await getLocalDockerStatus())
})

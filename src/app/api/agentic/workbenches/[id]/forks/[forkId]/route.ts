import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { discardFork, getFork } from "@/features/agentic/server/forks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = withRoute<{ id: string; forkId: string }>(async ({ params }) => ok(await getFork(params.id, params.forkId)))

/** DELETE /api/agentic/workbenches/[id]/forks/[forkId] — Descartar fork (encerrado): apaga o fork, a saída e a sessão. */
export const DELETE = withRoute<{ id: string; forkId: string }>(async ({ params }) => {
    await discardFork(params.id, params.forkId)
    return ok({ deleted: true })
})

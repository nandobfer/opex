import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { completeAgenticFile } from "@/features/agentic/server/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/agentic/files/[id]/complete — confirma o PUT no Storage S3 (confere o objeto e o promove). Idempotente. */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await completeAgenticFile(params.id)))

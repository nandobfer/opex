import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getWorkbenchByTask } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/workbenches/by-task/[taskId] — mesa da tarefa (`null` se ainda não existe). */
export const GET = withRoute<{ taskId: string }>(async ({ params }) => ok(await getWorkbenchByTask(params.taskId)))

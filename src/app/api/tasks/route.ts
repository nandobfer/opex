import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listTasks } from "@/features/tasks/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/tasks?includeArchived=true — quadro do Centro de Desenvolvimento (Go! Sipal). */
export const GET = withRoute(async ({ req }) => ok(await listTasks(req.nextUrl.searchParams.get("includeArchived") === "true")))

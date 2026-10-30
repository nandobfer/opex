import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getServiceStatus } from "@/features/opencode-service/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/providers/opencode/service — status do serviço (versão, porta, tempo no ar, SSH, atualização, operação). */
export const GET = withRoute(async () => ok(await getServiceStatus()))

import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getOpencodeQuota } from "@/features/opencode-quota/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Quota do OpenCode (export do plugin opencode-quota), do último resultado em memória. */
export const GET = withRoute(async () => ok(await getOpencodeQuota()))

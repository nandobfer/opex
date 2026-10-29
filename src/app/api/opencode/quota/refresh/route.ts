import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { refreshOpencodeQuota } from "@/features/opencode-quota/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Relê agora o export do opencode-quota (botão "Atualizar" do painel). */
export const POST = withRoute(async () => ok(await refreshOpencodeQuota()))

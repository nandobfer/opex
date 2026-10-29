import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { DEFAULT_QUOTA_BUTTON_REASON } from "@/features/opencode-quota/constants"
import { refreshOpencodeQuota } from "@/features/opencode-quota/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Pede a quota ao plugin agora (botão "Atualizar" do painel), com o motivo configurado na integração OpenCode. */
export const POST = withRoute(async () => {
    const { quotaRefreshReason } = await getIntegrationConfig("ai_opencode")
    const reason = quotaRefreshReason === "poll" || quotaRefreshReason === "manual" ? quotaRefreshReason : DEFAULT_QUOTA_BUTTON_REASON
    return ok(await refreshOpencodeQuota({ reason }))
})

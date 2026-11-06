import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { refreshHostMetrics } from "@/features/host-metrics/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Lê os recursos do servidor agora (botão "Atualizar" do painel). */
export const POST = withRoute(async () => ok(await refreshHostMetrics()))

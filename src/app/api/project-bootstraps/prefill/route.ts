import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getBootstrapPrefill } from "@/features/project-bootstrap/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/project-bootstraps/prefill — raiz dos repositórios, colunas iniciais do vínculo e o que bloqueia o envio. */
export const GET = withRoute(async () => ok(await getBootstrapPrefill()))

import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getTechCatalog } from "@/features/project-bootstrap/server/catalog"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/project-bootstraps/catalog — grupos e tecnologias reconhecidas no contexto do projeto. */
export const GET = withRoute(async () => ok(await getTechCatalog()))

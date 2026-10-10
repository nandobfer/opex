import { created } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { regenerateClientToken } from "@/features/orcamentos/server/clients"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** POST /api/integrations/orcamentos/clients/[id]/token — gera um novo token (invalida o anterior). */
export const POST = withRoute<Params>(async ({ params }) => created(await regenerateClientToken(params.id, getLocalUser().id)))

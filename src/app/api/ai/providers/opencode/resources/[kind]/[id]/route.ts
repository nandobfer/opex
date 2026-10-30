import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { resourceUpdateSchema } from "@/features/opencode-resources/schemas"
import { idParam, uiActor } from "@/features/opencode-resources/server/route-params"
import { deleteResource, getResource, updateResource } from "@/features/opencode-resources/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { kind: string; id: string }

/** GET — conteúdo do item (MCP: só os nomes das variáveis/cabeçalhos). */
export const GET = withRoute<Params>(async ({ params }) => ok(await getResource(idParam(params.kind, params.id))))

/** PATCH — edita (validação de frontmatter/JSON antes; backup antes de gravar). */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    const id = idParam(params.kind, params.id)
    const body = await parseBody(req, resourceUpdateSchema)
    if (!body.ok) return body.response
    return ok(await updateResource(id, body.data, uiActor()))
})

/** DELETE — exclui/desinstala/remove (backup antes). */
export const DELETE = withRoute<Params>(async ({ params }) => ok(await deleteResource(idParam(params.kind, params.id), uiActor())))

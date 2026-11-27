import { okResponse, parseBody, route } from "@nandobfer/integracoes/server"
import { githubServer } from "@nandobfer/integracoes/github/server"
import { repoLinkInputSchema, mappingInputSchema } from "@/features/github/schemas"

/** GitHub da biblioteca + extensão do Opex: vínculos, mapeamento, sincronização e consultas (`/api/integrations/github/*`). */
export const githubAdapter = githubServer({
    userAgent: "opex",
    routes: [
        /** Issue Types das organizações vinculadas. */
        route("GET", "github/issue-types", async () => okResponse(await (await import("@/features/github/server/lookups")).listGithubIssueTypes())),
        /** Labels dos repositórios vinculados. */
        route("GET", "github/labels", async () => okResponse(await (await import("@/features/github/server/lookups")).listGithubLabels())),
        /** Repositórios acessíveis pelo token (`?refresh=1` ignora o cache de 5 min). */
        route("GET", "github/repos", async ({ request }) => okResponse(await (await import("@/features/github/server/lookups")).listGithubRepos(new URL(request.url).searchParams.get("refresh") === "1"))),
        /** Rotina e resultado por vínculo ("Sincronizar agora" usa a rota dos Crons). */
        route("GET", "github/sync", async () => okResponse(await (await import("@/features/github/server/status")).getSyncStatus())),
        /** Vínculos repositório ↔ Opex. */
        route("GET", "github/links", async () => okResponse(await (await import("@/features/github/server/links")).listLinks())),
        /** Novo vínculo (409 se o repositório já estiver vinculado). */
        route("POST", "github/links", async ({ request, actor }) => {
            const body = await parseBody(request, repoLinkInputSchema)
            if (!body.ok) return body.response
            return okResponse(await (await import("@/features/github/server/links")).createLink(body.data, actor.id), { status: 201 })
        }),
        route("PATCH", "github/links/:linkId", async ({ request, params, actor }) => {
            const body = await parseBody(request, repoLinkInputSchema)
            if (!body.ok) return body.response
            return okResponse(await (await import("@/features/github/server/links")).updateLink(params.linkId!, body.data, actor.id))
        }),
        route("DELETE", "github/links/:linkId", async ({ params, actor }) => {
            await (await import("@/features/github/server/links")).deleteLink(params.linkId!, actor.id)
            return okResponse({ id: params.linkId })
        }),
        /** Regras de tipo e prioridade. */
        route("GET", "github/mappings", async () => okResponse(await (await import("@/features/github/server/mappings")).getMapping())),
        route("PUT", "github/mappings", async ({ request, actor }) => {
            const body = await parseBody(request, mappingInputSchema)
            if (!body.ok) return body.response
            return okResponse(await (await import("@/features/github/server/mappings")).saveMapping(body.data, actor.id))
        }),
    ],
})


import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { readOpexSkillFile } from "@/features/opex-agent/server/skills/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/skills/[id]/file?path= — conteúdo de um arquivo de apoio. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const path = new URL(req.url).searchParams.get("path")
    if (!path) throw new DomainError(400, "Informe o caminho do arquivo", "OPEX_SKILL_FILE_PATH_REQUIRED")
    return ok(await readOpexSkillFile(params.id, path))
})

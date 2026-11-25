import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { criteriaTestSchema } from "@/features/secretary-agent/schemas"
import { testCriteria } from "@/features/secretary-agent/server/classify"

export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const input = await parseBody(req, criteriaTestSchema)
    if (!input.ok) return input.response
    return ok(await testCriteria(input.data))
})

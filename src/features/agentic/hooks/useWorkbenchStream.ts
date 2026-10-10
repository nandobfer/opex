"use client"

import { withBasePath } from "@/lib/base-path"
import type { TimelineState } from "../timeline"
import { useEventStream } from "./useEventStream"

/**
 * Saída da mesa ao vivo (`GET /api/agentic/workbenches/[id]/events`): a cada conexão o servidor
 * manda `reset` + tudo o que foi gravado + o que chegar depois. Cai a conexão → reconecta sozinho.
 */
export function useWorkbenchStream(workbenchId: string | null): { timeline: TimelineState; connected: boolean } {
    return useEventStream(workbenchId, workbenchId ? withBasePath(`/api/agentic/workbenches/${workbenchId}/events`) : null)
}

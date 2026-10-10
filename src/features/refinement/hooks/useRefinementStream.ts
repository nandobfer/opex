"use client"

import { withBasePath } from "@/lib/base-path"
import { useEventStream } from "@/features/agentic/hooks/useEventStream"
import type { TimelineState } from "@/features/agentic/timeline"

/**
 * Saída do refinamento ao vivo (`GET /api/tasks/[id]/refinement/events`): a cada conexão o servidor
 * manda `reset` + tudo o que foi gravado + o que chegar depois. Cai a conexão → reconecta sozinho.
 */
export function useRefinementStream(taskId: string | null): { timeline: TimelineState; connected: boolean } {
    return useEventStream(taskId, taskId ? withBasePath(`/api/tasks/${taskId}/refinement/events`) : null)
}

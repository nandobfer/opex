import { openEventStream } from "@/features/agentic/server/stream"
import { getPrReview } from "./service"

/** Stream NDJSON da revisão (mesmo formato das mesas). `404` quando a revisão não existe. */
export function openPrReviewStream(id: string, signal: AbortSignal): Promise<Response> {
    return openEventStream(id, signal, getPrReview)
}

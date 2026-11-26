import { format } from "date-fns"
import { Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import { SECRETARY_DECISION_LABELS, SECRETARY_DECISION_TONES } from "../../constants"
import type { TimelineDecisionDto } from "../../types"

const TONES = {
    positive: "text-[var(--chart-positive-1)]",
    neutral: "text-muted-foreground",
    warning: "text-[var(--chart-negative-3)]",
    negative: "text-destructive",
} as const

/** Decisão do Secretário como pílula centralizada entre as mensagens (decisão do dono D3, 26/11/2026), nunca como balão. */
export function DecisionPill({ decision }: { decision: TimelineDecisionDto }) {
    const label = `Secretário · ${SECRETARY_DECISION_LABELS[decision.decision]}: ${decision.reason}`
    return (
        <div className="my-1.5 flex justify-center" data-decision={decision.decision}>
            <span title={label} className={cn("inline-flex max-w-[85%] items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[11px] shadow-sm", TONES[SECRETARY_DECISION_TONES[decision.decision]])}>
                <Bot className="h-3 w-3 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{label}</span>
                <span className="ml-1 tabular-nums opacity-60">{format(new Date(decision.at), "HH:mm")}</span>
            </span>
        </div>
    )
}

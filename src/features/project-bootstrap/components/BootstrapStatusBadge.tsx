import { cn } from "@/lib/utils"
import { PROJECT_BOOTSTRAP_STATUS_LABELS, type ProjectBootstrapStatus } from "../constants"

const TONE: Record<ProjectBootstrapStatus, string> = {
    running: "border-primary/40 bg-primary/10 text-primary",
    waiting: "border-warning/40 bg-warning/10 text-warning",
    failed: "border-destructive/40 bg-destructive/10 text-destructive",
    done: "border-success/40 bg-success/10 text-success",
    cancelled: "border-border bg-muted text-muted-foreground",
}

/** Selo do estado do bootstrap (executando, aguardando você, falhou, concluído, cancelado). */
export function BootstrapStatusBadge({ status, className }: { status: ProjectBootstrapStatus; className?: string }) {
    return <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", TONE[status], className)}>{PROJECT_BOOTSTRAP_STATUS_LABELS[status]}</span>
}

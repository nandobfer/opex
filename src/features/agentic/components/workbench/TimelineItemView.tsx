"use client"

import { format } from "date-fns"
import { AlertTriangle, Bot, CheckCircle2, CircleSlash, Info, ShieldQuestion, User, XCircle } from "lucide-react"
import { Markdown } from "@/components/ui/markdown"
import { cn } from "@/lib/utils"
import { DECISION_LABELS, type TimelineItem } from "../../timeline"
import { PrWatchItem } from "./PrWatchItem"
import { ToolItem } from "./ToolItem"
import { AdversarialVerdictItem } from "@/features/adversarial-agent/components/workbench/AdversarialVerdictItem"

const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 3 })

function duration(ms: number): string {
    const seconds = Math.round(ms / 1000)
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}min ${seconds % 60}s`
}

const NOTICE_STYLE = {
    info: { icon: Info, className: "text-sky-300" },
    success: { icon: CheckCircle2, className: "text-emerald-400" },
    warn: { icon: AlertTriangle, className: "text-amber-300" },
    error: { icon: XCircle, className: "text-destructive" },
} as const

/** Um item da saída da mesa (turno, texto do agente, ferramenta, aviso, pedido…). */
export function TimelineItemView({ item, latestPrWatch = false }: { item: TimelineItem; latestPrWatch?: boolean }) {
    switch (item.kind) {
        case "turn":
            return (
                <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground first:border-t-0 first:pt-0">
                    <Bot className="h-3.5 w-3.5 text-primary" aria-hidden />
                    <span className="font-semibold text-foreground">{item.title}</span>
                    <span>{format(new Date(item.ts), "HH:mm")}</span>
                    {(item.agent || item.model) && <span className="font-mono">{[item.agent, item.model].filter(Boolean).join(" · ")}</span>}
                    {item.end && (
                        <span className={cn("ml-auto flex items-center gap-1", item.end.outcome === "succeeded" ? "text-emerald-400" : item.end.outcome === "failed" ? "text-destructive" : "text-muted-foreground")}>
                            {item.end.outcome === "succeeded" ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : item.end.outcome === "failed" ? <XCircle className="h-3 w-3" aria-hidden /> : <CircleSlash className="h-3 w-3" aria-hidden />}
                            {item.end.outcome === "succeeded" ? "concluído" : (item.end.message ?? item.end.outcome)} · {duration(item.end.durationMs)}
                            {item.end.costUsd > 0 && ` · ${usd.format(item.end.costUsd)}`}
                        </span>
                    )}
                </div>
            )
        case "user":
            return (
                <div className="ml-auto flex max-w-[85%] items-start gap-2 rounded-lg bg-primary/15 px-3 py-2 text-sm">
                    <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <p className="whitespace-pre-wrap">{item.text}</p>
                </div>
            )
        case "text":
            return <Markdown className="text-sm">{item.text}</Markdown>
        case "tool":
            return <ToolItem item={item} />
        case "notice": {
            const style = NOTICE_STYLE[item.level]
            const Icon = style.icon
            return (
                <p className={cn("flex items-start gap-2 text-xs", style.className)}>
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="whitespace-pre-wrap">{item.message}</span>
                </p>
            )
        }
        case "permission":
            return (
                <p className="flex items-start gap-2 text-xs text-amber-300">
                    <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                        Permissão pedida: <span className="font-mono">{item.permission.action}</span>
                        {item.permission.resources.length > 0 && <span className="font-mono text-muted-foreground"> {item.permission.resources.join(", ")}</span>}
                        {" — "}
                        {item.decision ? DECISION_LABELS[item.decision] ?? item.decision : "aguardando resposta"}
                    </span>
                </p>
            )
        case "form":
            return (
                <p className="flex items-start gap-2 text-xs text-amber-300">
                    <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                        Pergunta do agente: {item.form.title} — {item.closed ? "respondida" : "aguardando resposta"}
                    </span>
                </p>
            )
        case "pr-watch":
            return <PrWatchItem item={item} latest={latestPrWatch} />
        case "adversarial-verdict":
            return <AdversarialVerdictItem reviewId={item.reviewId} round={item.round} level={item.level} summary={item.summary} outcome={item.outcome} findings={item.findings} />
    }
}

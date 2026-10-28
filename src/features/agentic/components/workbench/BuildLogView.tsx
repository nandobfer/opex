"use client"

import { AnimatePresence, motion } from "framer-motion"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AlertTriangle, CheckCircle2, CircleSlash, Github, Loader2, Monitor, XCircle, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { BUILD_STATUS_LABELS, type BuildStatus, type WorkbenchBuildDto } from "../../build-log"
import { useWorkbenchBuilds } from "../../hooks/useBuilds"
import { BuildLogPanel } from "./BuildLogPanel"

export const BUILD_STATUS_STYLE: Record<BuildStatus, { icon: LucideIcon; className: string; spin?: boolean }> = {
    running: { icon: Loader2, className: "text-primary", spin: true },
    succeeded: { icon: CheckCircle2, className: "text-success" },
    unhealthy: { icon: AlertTriangle, className: "text-warning" },
    failed: { icon: XCircle, className: "text-destructive" },
    interrupted: { icon: CircleSlash, className: "text-muted-foreground" },
}

export function BuildStatusIcon({ status }: { status: BuildStatus }) {
    const style = BUILD_STATUS_STYLE[status]
    const Icon = style.icon
    return <Icon className={cn("h-3.5 w-3.5 shrink-0", style.className, style.spin && "animate-spin")} aria-hidden />
}

const when = (iso: string) => format(new Date(iso), "dd/MM HH:mm", { locale: ptBR })

/**
 * Aba "Build (N)" da mesa: os builds da prévia (etapa "Subindo a prévia"), do mais recente ao mais
 * antigo, e o log do comando do selecionado (`docker compose` ou o script do GitHub Action) — ao vivo
 * enquanto o build roda.
 * `selectedId: null` = o build mais recente.
 */
export function BuildLogView({ workbenchId, selectedId, onSelect }: { workbenchId: string; selectedId: string | null; onSelect: (id: string) => void }) {
    const query = useWorkbenchBuilds(workbenchId)
    if (query.isPending) {
        return (
            <div className="flex flex-1 flex-col gap-3 p-4" aria-busy="true">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="min-h-40 flex-1" />
            </div>
        )
    }
    if (query.isError) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
                <XCircle className="h-6 w-6 text-destructive" aria-hidden />
                <p>Não foi possível carregar os builds da prévia.</p>
                <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
                    Tentar novamente
                </Button>
            </div>
        )
    }
    const builds = [...query.data].reverse()
    const latest = builds[0]
    const selected = builds.find((build) => build.id === selectedId) ?? latest
    if (!selected || !latest) return null
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <BuildSummary build={selected} />
                {builds.length > 1 && (
                    <Select value={selected.id} onValueChange={(value) => value && onSelect(value)}>
                        <SelectTrigger className="w-52" aria-label="Build da prévia">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {builds.map((build) => (
                                <SelectItem key={build.id} value={build.id}>
                                    Build #{build.number} · {when(build.startedAt)}
                                    {build.id === latest.id ? " (atual)" : ""}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={selected.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="flex min-h-0 flex-1 flex-col">
                    <BuildLogPanel workbenchId={workbenchId} build={selected} />
                </motion.div>
            </AnimatePresence>
        </div>
    )
}

function BuildSummary({ build }: { build: WorkbenchBuildDto }) {
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className={cn("flex items-center gap-1.5 font-medium", BUILD_STATUS_STYLE[build.status].className)}>
                <BuildStatusIcon status={build.status} />
                {BUILD_STATUS_LABELS[build.status]}
            </span>
            {build.port !== null && <span>Porta {build.port}</span>}
            {build.method === "github" && (
                <span className="flex items-center gap-1">
                    <Github className="h-3 w-3" aria-hidden /> GitHub Action
                </span>
            )}
            {build.local && (
                <span className="flex items-center gap-1">
                    <Monitor className="h-3 w-3" aria-hidden /> Máquina local
                </span>
            )}
            {build.endedAt && <span>Terminou {when(build.endedAt)}</span>}
            {build.message && (
                <span className="min-w-0 truncate text-destructive/90" title={build.message}>
                    {build.message}
                </span>
            )}
        </div>
    )
}

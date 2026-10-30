"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Activity, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RefreshButton } from "@/components/ui/refresh-button"
import { OPENCODE_SERVICE_ACTION_LABELS } from "../constants"
import { formatUptime, SERVICE_STATE_LABELS } from "../format"
import type { OpencodeServiceStatusDto } from "../types"
import { ServiceActionsBar } from "./ServiceActionsBar"

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <AnimatePresence mode="wait" initial={false}>
                <motion.p key={value} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }} className="font-mono text-sm text-foreground">
                    {value}
                </motion.p>
            </AnimatePresence>
        </div>
    )
}

/** Status do serviço (estado, versão, porta, tempo no ar), atualização disponível, operação e ações. */
export function ServiceStatusCard({ status, fetching, onRefresh }: { status: OpencodeServiceStatusDto; fetching: boolean; onRefresh: () => void }) {
    const state = SERVICE_STATE_LABELS[status.state]
    const op = status.operation
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Activity className="h-4 w-4 text-primary" aria-hidden /> Serviço do OpenCode
                        <Badge variant={state.variant}>{state.label}</Badge>
                    </CardTitle>
                    <CardDescription>{status.reason && status.state !== "running" ? status.reason : `Servidor ${status.baseUrl ?? "não configurado"}`}</CardDescription>
                </div>
                <RefreshButton onClick={onRefresh} fetching={fetching} />
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-4">
                    <Fact label="Versão" value={status.version ?? "—"} />
                    <Fact label="Porta" value={status.port ? String(status.port) : "—"} />
                    <Fact label="Tempo no ar" value={formatUptime(status.uptimeSeconds)} />
                    <Fact label="PID" value={status.pid ? String(status.pid) : "—"} />
                </div>
                {status.update ? (
                    <p className="text-sm text-muted-foreground">
                        Disponível: <span className="font-mono text-foreground">{status.update.latestSupported ?? "—"}</span> (última 2.x)
                        {status.update.latestMajor ? (
                            <>
                                {" · "}major nova <span className="font-mono text-warning">{status.update.latestMajor}</span>
                            </>
                        ) : null}
                    </p>
                ) : null}
                <AnimatePresence initial={false}>
                    {op ? (
                        <motion.div key={op.id + op.status} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="rounded-md border bg-muted/40 p-3 text-sm">
                            <p className="flex items-center gap-2">
                                {op.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                                <span className="font-medium">{OPENCODE_SERVICE_ACTION_LABELS[op.action].verb}</span>
                                <Badge variant={op.status === "succeeded" ? "success" : op.status === "running" ? "warning" : "destructive"}>
                                    {{ running: "Em andamento", succeeded: "Concluída", failed: "Falhou", interrupted: "Interrompida" }[op.status]}
                                </Badge>
                                {op.toVersion ? <span className="font-mono text-xs text-muted-foreground">{op.fromVersion ?? "?"} → {op.toVersion}</span> : null}
                            </p>
                            {op.error ? <p className="mt-1 text-xs text-destructive">{op.error}</p> : null}
                        </motion.div>
                    ) : null}
                </AnimatePresence>
                {status.ssh.trusted ? <ServiceActionsBar status={status} /> : <p className="text-sm text-muted-foreground">Para iniciar, parar, reiniciar e atualizar, configure e confie no acesso SSH abaixo.</p>}
            </CardContent>
        </Card>
    )
}

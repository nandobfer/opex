"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ExternalLink } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { OperationDto } from "../types"
import { EnvironmentStatusBadge, type EnvironmentTone } from "./EnvironmentStatusBadge"

const KIND_LABELS: Record<string, string> = { publish: "Publicação", restore: "Restauração", inspect: "Inspeção" }

const STATE_TONES: Record<string, EnvironmentTone> = {
    queued: "sky",
    running: "primary",
    reconciling: "amber",
    succeeded: "emerald",
    degraded: "amber",
    failed: "destructive",
    interrupted: "muted",
}

/** Histórico das operações do ambiente (publicações, inspeções e restaurações) com as evidências. */
export function OperationsHistory({ operations }: { operations: readonly OperationDto[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Histórico de operações</CardTitle>
                <CardDescription>Registro das publicações, inspeções e restaurações deste ambiente.</CardDescription>
            </CardHeader>
            <CardContent>
                {!operations.length ? (
                    <p className="text-sm text-muted-foreground">Nenhuma operação registrada.</p>
                ) : (
                    <ul className="divide-y">
                        {operations.map((operation) => (
                            <li key={operation.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <EnvironmentStatusBadge label={KIND_LABELS[operation.kind] ?? operation.kind} tone="muted" />
                                    <EnvironmentStatusBadge
                                        label={operation.stage}
                                        tone={STATE_TONES[operation.state] ?? "muted"}
                                        running={operation.state === "running"}
                                    />
                                    <span className="ml-auto text-xs text-muted-foreground">
                                        {format(new Date(operation.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                    </span>
                                </div>
                                {operation.error && (
                                    <p role="alert" className="text-sm text-destructive">
                                        {operation.error}
                                    </p>
                                )}
                                {operation.runUrl && (
                                    <a
                                        href={operation.runUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                    >
                                        Ver execução no GitHub <ExternalLink className="h-3 w-3" aria-hidden />
                                    </a>
                                )}
                                {operation.migrations.length > 0 && (
                                    <p className="text-sm">
                                        Migrações comprovadas: <span className="font-mono text-xs">{operation.migrations.join(", ")}</span>
                                    </p>
                                )}
                                {operation.steps.length > 0 && (
                                    <ol className="space-y-1 text-xs text-muted-foreground" aria-label="Etapas da operação">
                                        {operation.steps.map((step, index) => (
                                            <li key={index}>
                                                {format(new Date(step.at), "HH:mm:ss", { locale: ptBR })} · {step.name}
                                            </li>
                                        ))}
                                    </ol>
                                )}
                                {operation.evidence.length > 0 && (
                                    <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                                        {operation.evidence.map((item, index) => (
                                            <li key={index}>{item}</li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}

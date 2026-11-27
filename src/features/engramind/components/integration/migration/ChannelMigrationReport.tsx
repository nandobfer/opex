"use client"

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { ChannelMigrationDto } from "../../../channel-migration/types"

const when = (iso: string | null) => (iso ? format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—")
const totals = (byStatus: Record<string, number>) =>
    Object.entries(byStatus)
        .map(([status, count]) => `${status}: ${count}`)
        .join(" · ")

/** Relatório da migração dos canais (OPE-206): backup, conferência, canais, conflitos, assinaturas e o registro dos passos. */
export function ChannelMigrationReport({ migration }: { migration: ChannelMigrationDto }) {
    const foreign = migration.subscriptions.filter((item) => item.foreign)
    return (
        <div className="space-y-3 text-sm" data-testid="channel-migration-report">
            <p className="text-xs text-muted-foreground">
                {migration.direction === "forward" ? "Migração" : "Volta atrás"} iniciada em {when(migration.startedAt)}
                {migration.finishedAt ? ` · concluída em ${when(migration.finishedAt)}` : ""} · app {migration.app}
            </p>
            {migration.backup && (
                <p className="rounded-md border px-3 py-2">
                    Backup: {migration.backup.memories} memória(s) ({totals(migration.backup.byStatus)}) · <span className="font-mono text-xs">{migration.backup.file}</span>
                </p>
            )}
            {migration.verify && (
                <div className={`rounded-md border px-3 py-2 ${migration.verify.ok ? "" : "border-destructive/40 bg-destructive/10"}`} role={migration.verify.ok ? undefined : "alert"}>
                    <p className="flex items-center gap-2">
                        {migration.verify.ok ? <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden /> : <XCircle className="h-4 w-4 text-destructive" aria-hidden />}
                        Conferência: {migration.verify.memories} memória(s) ({totals(migration.verify.byStatus)}) · <span className="font-mono text-xs">{migration.verify.file}</span>
                    </p>
                    {!migration.verify.ok && (
                        <ul className="mt-1 list-disc pl-5 text-xs">
                            {migration.verify.problems.map((problem) => (
                                <li key={problem}>{problem}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {migration.error && migration.status !== "done" && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">{migration.error}</p>}
            {migration.channels.length > 0 && (
                <details className="rounded-md border px-3 py-2">
                    <summary className="cursor-pointer">
                        {migration.channels.length} canal(is) · {migration.movedCount} memória(s) movida(s) · {migration.archived.length} arquivado(s)
                    </summary>
                    <ul className="mt-2 space-y-0.5 font-mono text-xs">
                        {migration.channels.map((item) => (
                            <li key={item.from}>
                                {item.from} → {item.to} {item.moved ? "✓" : "…"}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            {migration.tooLong.length > 0 && <p className="text-xs text-warning">Nome novo longo demais (ficam na origem): {migration.tooLong.join(", ")}</p>}
            {migration.conflicts.length > 0 && (
                <div className="rounded-md border border-warning/40 px-3 py-2" data-testid="channel-migration-conflicts">
                    <p className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> {migration.conflicts.length} memória(s) ficaram na origem (já existe uma igual no destino): resolva na rede e rode a conferência de novo.
                    </p>
                    <ul className="mt-1 space-y-0.5 font-mono text-xs">
                        {migration.conflicts.map((item) => (
                            <li key={item.id}>
                                {item.id} em {item.channel} ({item.code}{item.existingId ? `, igual a ${item.existingId}` : ""})
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {migration.subscriptions.length > 0 && (
                <details className="rounded-md border px-3 py-2">
                    <summary className="cursor-pointer">
                        {migration.subscriptions.length} assinatura(s) alterada(s){foreign.length ? ` · ${foreign.length} de outros apps` : ""}
                    </summary>
                    <ul className="mt-2 space-y-0.5 font-mono text-xs">
                        {migration.subscriptions.map((item) => (
                            <li key={`${item.agent}-${item.fromTarget}`}>
                                {item.agent}: {item.fromTarget} → {item.toTarget} ({item.mode}){item.foreign ? " · outro app" : ""}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            {migration.log.length > 0 && (
                <details className="rounded-md border px-3 py-2">
                    <summary className="cursor-pointer">Registro dos passos</summary>
                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                        {migration.log.map((item) => (
                            <li key={`${item.at}-${item.message}`}>
                                {when(item.at)} · {item.message}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    )
}

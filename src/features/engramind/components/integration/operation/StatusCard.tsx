"use client"

import type { ReactNode } from "react"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { STATUS_HELP } from "../../../help/operation"
import type { EngramindStatus } from "../../../types"
import { HelpBadge, toneOf } from "../../shared/Badges"
import { formatBytes, formatDateTime, formatDuration } from "../../shared/format"
import { Section } from "../../shared/Section"
import { LocalModelStatusLine } from "../../shared/LocalModelStatusLine"

/** `get_status`: versão, banco, backup (Litestream), contagens, fila, Redator, embeddings, webhooks e retenção. */
export function StatusCard({ status }: { status: EngramindStatus }) {
    return (
        <Section title="Status" info="Resumo do get_status, atualizado a cada 10 s.">
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Block label="Versão" help={STATUS_HELP.version}>
                    {status.version} · no ar há {formatDuration(status.uptime_seconds)}
                </Block>
                <Block label="Banco" help={STATUS_HELP.database}>
                    <HelpBadge value={status.database.status} tone={status.database.status === "ok" ? "success" : "warning"} /> {formatBytes(status.database.size_bytes)}
                </Block>
                <Block label="Backup" help={STATUS_HELP.backup}>
                    <HelpBadge value={status.backup.status} tone={toneOf(status.backup.status)} help={status.backup.detail ?? undefined} />
                    {status.backup.last_replica_at && <span className="text-xs text-muted-foreground">réplica {formatDateTime(status.backup.last_replica_at)}</span>}
                </Block>
                <Block label="Identidades" help={STATUS_HELP.counts}>
                    {Object.entries(status.counts)
                        .map(([key, value]) => `${value} ${key}`)
                        .join(" · ")}
                </Block>
                <Block label="Fila" help={STATUS_HELP.queue}>
                    {status.queue.pending} pendente(s) · <span className={status.queue.failed ? "text-destructive" : undefined}>{status.queue.failed} falho(s)</span>
                </Block>
                <Block label="Redator" help={STATUS_HELP.redator}>
                    <HelpBadge value={status.redator.enabled ? (status.redator.configured ? "ligado" : "sem configuração") : "desligado"} tone={status.redator.enabled && status.redator.configured ? "success" : "outline"} help={status.redator.missing.length ? `Faltam: ${status.redator.missing.join(", ")}` : undefined} />
                    {status.redator.model && <span className="font-mono text-xs">{status.redator.model}</span>}
                    {status.redator.last_24h && <span className="text-xs text-muted-foreground">24 h: {status.redator.last_24h.calls} chamada(s), {status.redator.last_24h.failures} falha(s)</span>}
                </Block>
                <Block label="Embeddings" help={STATUS_HELP.embedding}>
                    <HelpBadge value={status.embedding.state} tone={toneOf(status.embedding.state)} /> <span className="font-mono text-xs">{status.embedding.model_id ?? "—"}</span>
                    {status.embedding.local && <LocalModelStatusLine status={status.embedding.local} />}
                </Block>
                <Block label="Webhooks" help={STATUS_HELP.webhooks}>
                    {status.webhooks.enabled ? `${status.webhooks.apps} app(s) · ${status.webhooks.pending} pendente(s) · 24 h: ${status.webhooks.delivered_24h} entregue(s), ${status.webhooks.failed_24h} falha(s)` : "Desligados"}
                </Block>
                <Block label="Retenção" help={STATUS_HELP.retention}>
                    {status.retention ? `Última limpeza ${formatDateTime(status.retention.last_run_at)}` : "Ainda não rodou"}
                </Block>
            </dl>
        </Section>
    )
}

function Block({ label, help, children }: { label: string; help: string; children: ReactNode }) {
    return (
        <div className="rounded-lg border p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                {label} <InfoTooltip text={help} label={label} />
            </dt>
            <dd className="mt-1 flex flex-wrap items-center gap-1.5">{children}</dd>
        </div>
    )
}

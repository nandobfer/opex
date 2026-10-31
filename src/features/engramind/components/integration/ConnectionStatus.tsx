"use client"

import type { ReactNode } from "react"
import { CheckCircle2, AlertTriangle } from "lucide-react"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { SCOPE_HELP, TOKEN_KIND_HELP } from "../../help/identities"
import type { EngramindConnectionDto } from "../../types"
import { HelpBadge } from "../shared/Badges"
import { formatDateTime } from "../shared/format"
import { Section } from "../shared/Section"

/** Resultado do `whoami` (app, tipo, escopos, operações) e o estado do webhook do Opex. */
export function ConnectionStatus({ connection, actions }: { connection: EngramindConnectionDto; actions?: ReactNode }) {
    const whoami = connection.whoami
    return (
        <Section title="Estado da conexão" info="Lido agora do Engramind (whoami e o app do token)." actions={actions}>
            {!connection.configured ? (
                <p className="text-sm text-muted-foreground">Informe a URL base e o token para conectar.</p>
            ) : connection.error ? (
                <p className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {connection.error}
                </p>
            ) : whoami ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <Item label="Token">
                        <span className="font-mono text-xs">eng.{whoami.token_id}</span>
                    </Item>
                    <Item label="App">
                        {whoami.app.slug}
                        {connection.bootstrapPending && <HelpBadge value="bootstrap" tone="warning" help="Ainda é o token de bootstrap: salve a conexão ou repita a configuração automática para trocar pelo token do Opex." />}
                    </Item>
                    <Item label="Tipo">
                        <HelpBadge value={whoami.kind} help={TOKEN_KIND_HELP[whoami.kind]} tone={connection.tokenSufficient ? "success" : "destructive"} />
                    </Item>
                    <Item label="Escopos">
                        {whoami.scopes.map((scope) => (
                            <HelpBadge key={scope} value={scope} help={SCOPE_HELP[scope]} />
                        ))}
                    </Item>
                    <Item label="Webhook" className="sm:col-span-2">
                        {connection.webhook?.url ? (
                            <span className="flex flex-wrap items-center gap-2">
                                {connection.webhook.matches ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> : <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />}
                                <span className="break-all font-mono text-xs">{connection.webhook.url}</span>
                                <span className="text-xs text-muted-foreground">segredo {connection.webhook.secretConfigured ? `configurado em ${formatDateTime(connection.webhook.updatedAt)}` : "não configurado"}</span>
                            </span>
                        ) : (
                            <span className="text-warning">Não registrado</span>
                        )}
                    </Item>
                    <Item label={`Operações permitidas (${whoami.operations.length})`} className="sm:col-span-2">
                        <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer select-none">Ver a lista</summary>
                            <p className="mt-2 font-mono leading-relaxed">{whoami.operations.join(", ")}</p>
                        </details>
                    </Item>
                </dl>
            ) : null}
        </Section>
    )
}

function Item({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className={className}>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                {label}
                {label === "Token" && <InfoTooltip text="Prefixo público do token que o Opex usa (o segredo nunca aparece)." label="Token" />}
            </dt>
            <dd className="mt-1 flex flex-wrap items-center gap-1.5">{children}</dd>
        </div>
    )
}

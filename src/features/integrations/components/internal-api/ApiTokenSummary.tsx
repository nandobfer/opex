"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { describeScopes } from "../../api-tokens/scopes"
import type { ApiTokenScopeCatalogDto } from "../../api-tokens/types"
import { ApiTokenDestructiveNotice } from "./ApiTokenDestructiveNotice"
import { ApiTokenScopeBadges } from "./ApiTokenScopeBadges"

interface ApiTokenSummaryProps {
    nome: string
    scopes: readonly string[]
    expiraEm: string | null | undefined
    catalog: ApiTokenScopeCatalogDto
}

/** Resumo legível do token antes de confirmar (geração ou edição). */
export function ApiTokenSummary({ nome, scopes, expiraEm, catalog }: ApiTokenSummaryProps) {
    const summary = describeScopes(scopes, catalog)
    return (
        <div className="space-y-3 rounded-md border p-3" data-testid="api-token-summary">
            <p className="text-sm font-medium">{nome}</p>
            <ApiTokenScopeBadges badges={summary.badges} />
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {summary.lines.map((line) => (
                    <li key={line}>{line}</li>
                ))}
                <li>GET /api/v1/whoami: sempre liberado.</li>
                <li>{expiraEm ? `Expira em ${format(new Date(expiraEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.` : "Não expira."}</li>
            </ul>
            <ApiTokenDestructiveNotice scopes={scopes} tools={catalog.tools} />
        </div>
    )
}

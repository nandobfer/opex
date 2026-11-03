"use client"

import { useState } from "react"
import { KeyRound, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IDENTITY_HELP, SCOPE_HELP } from "../../../help/identities"
import type { EngramindAgent, EngramindApp, EngramindToken } from "../../../types"
import { HelpBadge } from "../../shared/Badges"
import { formatDateTime, formatRelative } from "../../shared/format"
import { RotateTokenDialog } from "./RotateTokenDialog"
import { TokenHealthBadges } from "./TokenHealthBadges"

/** Token em uso do app, fixo no topo do detalhe (OPE-117): escopos, último uso, expiração e "Rotacionar". */
export function InUseTokenCard({ token, own, apps, agents }: { token: EngramindToken | null; own: boolean; apps: readonly EngramindApp[]; agents: readonly EngramindAgent[] }) {
    const [rotating, setRotating] = useState(false)
    if (!token)
        return (
            <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground" data-testid="in-use-token">
                <KeyRound className="h-4 w-4" aria-hidden /> Nenhum token de app em uso. Emita um na aba Tokens.
            </div>
        )
    return (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3" data-testid="in-use-token">
            <KeyRound className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    Token em uso <span className="font-mono text-xs">{token.prefix}</span>
                    {own && <HelpBadge value="Este Opex" tone="secondary" help={IDENTITY_HELP.ownToken} />}
                    {token.scopes.map((scope) => (
                        <HelpBadge key={scope} value={scope} help={SCOPE_HELP[scope]} />
                    ))}
                    <TokenHealthBadges token={token} apps={apps} agents={agents} />
                </p>
                <p className="text-xs text-muted-foreground">
                    {token.label ?? "Sem rótulo"} · último uso {formatRelative(token.last_used_at)} · expira {token.expires_at ? formatDateTime(token.expires_at) : "nunca"}
                </p>
            </div>
            <Button type="button" variant="outline" size="sm" className="bg-transparent" onClick={() => setRotating(true)}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Rotacionar
            </Button>
            {rotating && <RotateTokenDialog token={token} own={own} open onOpenChange={setRotating} />}
        </div>
    )
}

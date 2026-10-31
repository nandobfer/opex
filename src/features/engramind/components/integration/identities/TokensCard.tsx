"use client"

import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Ban, KeyRound, Pencil, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { EmptyState } from "@/components/feedback/EmptyState"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { IDENTITY_HELP, SCOPE_HELP, TOKEN_KIND_HELP, TOKEN_STATUS_HELP } from "../../../help/identities"
import type { EngramindAgent, EngramindApp, EngramindToken } from "../../../types"
import { engramindSend, route, useEngramindMutation } from "../../../hooks/useEngramind"
import { HelpBadge, toneOf } from "../../shared/Badges"
import { formatDateTime, formatRelative } from "../../shared/format"
import { Section } from "../../shared/Section"
import { EditTokenDialog } from "./EditTokenDialog"
import { IssueTokenDialog } from "./IssueTokenDialog"

interface TokensCardProps {
    tokens: EngramindToken[]
    apps: EngramindApp[]
    agents: EngramindAgent[]
    ownTokenId: string | null
}

/** Tokens: prefixo, dono, tipo, escopos, rótulo, status, expiração e último uso; emitir, editar e revogar. */
export function TokensCard({ tokens, apps, agents, ownTokenId }: TokensCardProps) {
    const [issuing, setIssuing] = useState(false)
    const [editing, setEditing] = useState<EngramindToken | null>(null)
    const [revoking, setRevoking] = useState<EngramindToken | null>(null)
    const revoke = useEngramindMutation((id: string) => engramindSend("post", route("tokens", id, "revoke"), {}), { invalidate: ["tokens"], success: "Token revogado" })
    return (
        <Section
            title="Tokens"
            info={`${IDENTITY_HELP.token} ${IDENTITY_HELP.lastAdmin}`}
            actions={
                <Button type="button" size="sm" onClick={() => setIssuing(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Emitir token
                </Button>
            }
        >
            {tokens.length === 0 ? (
                <EmptyState icon={KeyRound} title="Nenhum token" description="Emita um token para um app ou agente." actionLabel="Emitir token" onAction={() => setIssuing(true)} />
            ) : (
                <div className="max-h-[32rem] overflow-auto rounded-lg border">
                    <VirtualizedRows
                        rows={tokens}
                        rowKey={(token) => token.id}
                        estimateSize={72}
                        rowClassName="border-b last:border-b-0"
                        renderRow={(token) => {
                            const own = token.id === ownTokenId
                            const inactive = token.status !== "active"
                            return (
                                <div className="flex flex-wrap items-center gap-2 p-3 text-sm">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="font-mono text-xs">{token.prefix}</span>
                                            {own && <HelpBadge value="Este Opex" tone="secondary" help={IDENTITY_HELP.ownToken} />}
                                            <HelpBadge value={token.kind} help={TOKEN_KIND_HELP[token.kind]} />
                                            <HelpBadge value={token.status} tone={toneOf(token.status)} help={TOKEN_STATUS_HELP[token.status]} />
                                            {token.scopes.map((scope) => (
                                                <HelpBadge key={scope} value={scope} help={SCOPE_HELP[scope]} />
                                            ))}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {token.label ?? "Sem rótulo"} · {token.agent ? `${token.app.slug}/${token.agent.slug}` : token.app.slug} · expira {token.expires_at ? formatDateTime(token.expires_at) : "nunca"} · último uso {formatRelative(token.last_used_at)}
                                        </p>
                                    </div>
                                    <TooltipIconButton label="Editar token" onClick={() => setEditing(token)} disabledReason={inactive ? "Token inativo" : null}>
                                        <Pencil aria-hidden />
                                    </TooltipIconButton>
                                    <TooltipIconButton label="Revogar token" onClick={() => setRevoking(token)} disabledReason={own ? "É o token que o Opex usa: troque na aba Conexão antes" : inactive ? "Token já inativo" : null}>
                                        <Ban aria-hidden />
                                    </TooltipIconButton>
                                </div>
                            )
                        }}
                    />
                </div>
            )}
            <AnimatePresence>{issuing && <IssueTokenDialog key="issue" apps={apps} agents={agents} open onOpenChange={setIssuing} />}</AnimatePresence>
            {editing && <EditTokenDialog key={editing.id} token={editing} own={editing.id === ownTokenId} open onOpenChange={(open) => !open && setEditing(null)} />}
            <ConfirmDialog
                open={revoking !== null}
                onOpenChange={(open) => !open && setRevoking(null)}
                title={`Revogar o token ${revoking?.prefix ?? ""}?`}
                description="A próxima requisição com ele recebe 401 na hora. Não dá para desfazer."
                confirmLabel="Revogar"
                variant="destructive"
                pending={revoke.isPending}
                onConfirm={() => revoking && revoke.mutate(revoking.id, { onSettled: () => setRevoking(null) })}
            />
        </Section>
    )
}

"use client"

import { useState } from "react"
import { AppWindow, Pencil, Plus, Power, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { EmptyState } from "@/components/feedback/EmptyState"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { IDENTITY_HELP } from "../../../help/identities"
import type { EngramindApp } from "../../../types"
import { engramindSend, route, useEngramindMutation } from "../../../hooks/useEngramind"
import { HelpBadge } from "../../shared/Badges"
import { formatDateTime } from "../../shared/format"
import { Section } from "../../shared/Section"
import { AppDialog } from "./AppDialog"

/** Apps: criar, editar (inclusive webhook), desativar/reativar e excluir com confirmação. */
export function AppsCard({ apps, ownAppSlug }: { apps: EngramindApp[]; ownAppSlug: string | null }) {
    const [editing, setEditing] = useState<EngramindApp | null | "new">(null)
    const [deleting, setDeleting] = useState<EngramindApp | null>(null)
    const toggle = useEngramindMutation((app: EngramindApp) => engramindSend("patch", route("apps", app.slug), { disabled: !app.disabled_at }), { invalidate: ["apps"], success: (app) => (app.disabled_at ? "App reativado" : "App desativado") })
    const remove = useEngramindMutation((slug: string) => engramindSend("delete", route("apps", slug)), { invalidate: ["apps", "agents", "tokens", "subscriptions"], success: "App excluído" })
    return (
        <Section
            title="Apps"
            info={IDENTITY_HELP.app}
            actions={
                <Button type="button" size="sm" onClick={() => setEditing("new")}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Novo app
                </Button>
            }
        >
            {apps.length === 0 ? (
                <EmptyState icon={AppWindow} title="Nenhum app" actionLabel="Novo app" onAction={() => setEditing("new")} />
            ) : (
                <div className="max-h-[28rem] overflow-auto rounded-lg border">
                    <VirtualizedRows
                        rows={apps}
                        rowKey={(app) => app.id}
                        estimateSize={64}
                        rowClassName="border-b last:border-b-0"
                        renderRow={(app) => {
                            const own = app.slug === ownAppSlug
                            return (
                                <div className="flex flex-wrap items-center gap-2 p-3 text-sm">
                                    <div className="min-w-0 flex-1">
                                        <p className="flex flex-wrap items-center gap-1.5 font-medium">
                                            {app.name} <span className="font-mono text-xs text-muted-foreground">{app.slug}</span>
                                            {own && <HelpBadge value="Este Opex" tone="secondary" help="App do próprio Opex na rede." />}
                                            {app.disabled_at && <HelpBadge value="desativado" tone="warning" help={IDENTITY_HELP.disabled} />}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            Webhook: {app.webhook?.url ?? "não configurado"}
                                            {app.webhook ? ` · segredo ${app.webhook.secret.configured ? `em ${formatDateTime(app.webhook.secret.updated_at)}` : "ausente"}` : ""}
                                        </p>
                                    </div>
                                    <TooltipIconButton label="Editar app" onClick={() => setEditing(app)}>
                                        <Pencil aria-hidden />
                                    </TooltipIconButton>
                                    <TooltipIconButton label={app.disabled_at ? "Reativar app" : "Desativar app"} tooltip={IDENTITY_HELP.disabled} onClick={() => toggle.mutate(app)} disabledReason={own ? "É o app do Opex" : null}>
                                        <Power aria-hidden />
                                    </TooltipIconButton>
                                    <TooltipIconButton label="Excluir app" onClick={() => setDeleting(app)} disabledReason={own ? "É o app do Opex" : null}>
                                        <Trash2 aria-hidden />
                                    </TooltipIconButton>
                                </div>
                            )
                        }}
                    />
                </div>
            )}
            {editing !== null && <AppDialog key={editing === "new" ? "new" : editing.id} app={editing === "new" ? null : editing} open onOpenChange={(open) => !open && setEditing(null)} />}
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title={`Excluir o app ${deleting?.slug ?? ""}?`}
                description="Saem junto os agentes, os tokens e as assinaturas dele. A autoria das memórias e a auditoria ficam."
                confirmLabel="Excluir"
                variant="destructive"
                pending={remove.isPending}
                onConfirm={() => deleting && remove.mutate(deleting.slug, { onSettled: () => setDeleting(null) })}
            />
        </Section>
    )
}

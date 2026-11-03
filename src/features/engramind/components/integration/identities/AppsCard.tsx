"use client"

import { useMemo, useState } from "react"
import { AppWindow, ChevronRight, Pencil, Plus, Power, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Switch } from "@/components/ui/switch"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { EmptyState } from "@/components/feedback/EmptyState"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { IDENTITY_HELP } from "../../../help/identities"
import { appSummaries, filterAppSummaries, type AppStatusFilter } from "../../../identities"
import type { EngramindAgent, EngramindApp, EngramindToken } from "../../../types"
import { engramindSend, route, useEngramindMutation } from "../../../hooks/useEngramind"
import { HelpBadge } from "../../shared/Badges"
import { formatDateTime, formatRelative } from "../../shared/format"
import { Section } from "../../shared/Section"
import { AppDialog } from "./AppDialog"

const STATUS_OPTIONS: { value: AppStatusFilter; label: string }[] = [
    { value: "all", label: "Todos" },
    { value: "active", label: "Ativos" },
    { value: "inactive", label: "Inativos" },
]

/**
 * Apps (OPE-117: primeiro nível da gestão): contagem de agentes, tokens ativos, última atividade e alertas,
 * com busca e filtros; abrir leva ao detalhe do app. Criar, editar, desativar/reativar e excluir continuam aqui.
 */
export function AppsCard({ apps, ownAppSlug, agents = [], tokens = [], onOpen }: { apps: EngramindApp[]; ownAppSlug: string | null; agents?: EngramindAgent[]; tokens?: EngramindToken[]; onOpen?: (slug: string) => void }) {
    const [term, setTerm] = useState("")
    const [status, setStatus] = useState<AppStatusFilter>("all")
    const [alertsOnly, setAlertsOnly] = useState(false)
    const summaries = useMemo(() => appSummaries(apps, agents, tokens), [apps, agents, tokens])
    const rows = useMemo(() => filterAppSummaries(summaries, { term, status, alertsOnly }), [summaries, term, status, alertsOnly])
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center" data-testid="apps-filters">
                <div className="relative w-full sm:flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input aria-label="Buscar app" className="bg-transparent pl-8" value={term} placeholder="Buscar por nome ou slug" onChange={(event) => setTerm(event.target.value)} />
                </div>
                <OptionTabs aria-label="Status do app" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
                <div className="flex items-center gap-2">
                    <Switch id="apps-alerts-only" checked={alertsOnly} onCheckedChange={setAlertsOnly} />
                    <Label htmlFor="apps-alerts-only" className="text-sm">
                        Com alertas
                    </Label>
                </div>
            </div>
            {rows.length === 0 ? (
                <EmptyState icon={AppWindow} title={apps.length ? "Nenhum app com esses filtros" : "Nenhum app"} actionLabel={apps.length ? undefined : "Novo app"} onAction={() => setEditing("new")} />
            ) : (
                <div className="max-h-[28rem] overflow-auto rounded-lg border">
                    <VirtualizedRows
                        rows={rows}
                        rowKey={(row) => row.app.id}
                        estimateSize={72}
                        rowClassName="border-b last:border-b-0"
                        renderRow={(row) => {
                            const app = row.app
                            const own = app.slug === ownAppSlug
                            return (
                                <div className="flex flex-wrap items-center gap-2 p-3 text-sm">
                                    <div className="min-w-0 flex-1">
                                        <p className="flex flex-wrap items-center gap-1.5 font-medium">
                                            {app.name} <span className="font-mono text-xs text-muted-foreground">{app.slug}</span>
                                            {own && <HelpBadge value="Este Opex" tone="secondary" help="App do próprio Opex na rede." />}
                                            {app.disabled_at && <HelpBadge value="desativado" tone="warning" help={IDENTITY_HELP.disabled} />}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground" data-testid={`app-summary-${app.slug}`}>
                                            {row.agents} agente(s) · {row.activeTokens} token(s) ativo(s) · última atividade {formatRelative(row.lastActivity)}
                                            {row.alerts > 0 && <span className="text-warning"> · {row.alerts} alerta(s)</span>}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            Webhook: {app.webhook?.url ?? "não configurado"}
                                            {app.webhook ? ` · segredo ${app.webhook.secret.configured ? `em ${formatDateTime(app.webhook.secret.updated_at)}` : "ausente"}` : ""}
                                        </p>
                                    </div>
                                    {onOpen && (
                                        <TooltipIconButton label={`Abrir o app ${app.slug}`} onClick={() => onOpen(app.slug)}>
                                            <ChevronRight aria-hidden />
                                        </TooltipIconButton>
                                    )}
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

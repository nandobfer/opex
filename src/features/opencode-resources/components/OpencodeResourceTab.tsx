"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowUpCircle, Download, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { apiErrorMessage } from "@/lib/api"
import { GLOBAL_SCOPE, OPENCODE_RESOURCE_KIND_LABELS, type OpencodeResourceKind } from "../constants"
import { outdatedCount } from "../logic"
import { refreshOpencodeResources, resourcesKey, useDeleteOpencodeResource, useOpencodeResources, useOpencodeResourcesRealtime, useToggleOpencodeResource, useUpdateOpencodeResources } from "../hooks/useOpencodeResources"
import type { OpencodeResourceDto } from "../types"
import { InstallResourceDialog } from "./InstallResourceDialog"
import { KIND_UI } from "./kind-ui"
import { McpFormDialog } from "./McpFormDialog"
import { McpTestDialog } from "./McpTestDialog"
import { OpencodeResourceCard } from "./OpencodeResourceCard"
import { ResourceEditorDialog } from "./ResourceEditorDialog"

type Confirm = { type: "remove"; item: OpencodeResourceDto } | { type: "update"; item: OpencodeResourceDto | null }

/** Uma aba de recursos (Skills, Agentes, Comandos, Plugins ou MCPs) com seus diálogos e confirmações. */
export function OpencodeResourceTab({ kind, dirty }: { kind: OpencodeResourceKind; dirty: boolean }) {
    const ui = KIND_UI[kind]
    const label = OPENCODE_RESOURCE_KIND_LABELS[kind]
    const queryClient = useQueryClient()
    const [scope, setScope] = useState(GLOBAL_SCOPE)
    const [refreshing, setRefreshing] = useState(false)
    const [editing, setEditing] = useState<OpencodeResourceDto | "new" | null>(null)
    const [installing, setInstalling] = useState(false)
    const [testing, setTesting] = useState<OpencodeResourceDto | null>(null)
    const [confirm, setConfirm] = useState<Confirm | null>(null)
    const list = useOpencodeResources(kind, scope, !dirty)
    const toggle = useToggleOpencodeResource(kind, scope)
    const remove = useDeleteOpencodeResource(kind)
    const updateMany = useUpdateOpencodeResources(kind, scope)
    useOpencodeResourcesRealtime()

    const refresh = async () => {
        setRefreshing(true)
        try {
            queryClient.setQueryData(resourcesKey(kind, scope), await refreshOpencodeResources(kind, scope))
        } catch (error) {
            toast.error(apiErrorMessage(error, "Não foi possível atualizar a lista"))
        } finally {
            setRefreshing(false)
        }
    }

    if (dirty) return <p className="text-sm text-muted-foreground">Salve as alterações da configuração para gerenciar {ui.title.toLowerCase()}.</p>

    const pendingUpdates = outdatedCount(list.data ?? [])
    const busyIds = new Set(toggle.isPending && toggle.variables ? [toggle.variables.id] : [])
    const confirming = remove.isPending || updateMany.isPending

    return (
        <>
            <OpencodeResourceCard
                kind={kind}
                scope={scope}
                onScopeChange={setScope}
                items={list.data}
                loading={list.isLoading}
                error={list.isError ? list.error : null}
                fetching={list.isFetching || refreshing}
                onRefresh={() => void refresh()}
                busyIds={busyIds}
                headerActions={
                    <>
                        {ui.hasVersions && pendingUpdates > 0 ? (
                            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirm({ type: "update", item: null })}>
                                <ArrowUpCircle className="h-4 w-4" aria-hidden /> Atualizar todos ({pendingUpdates})
                            </Button>
                        ) : null}
                        {ui.canInstall ? (
                            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setInstalling(true)}>
                                <Download className="h-4 w-4" aria-hidden /> {ui.installLabel}
                            </Button>
                        ) : null}
                        {ui.canCreate ? (
                            <Button type="button" size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
                                <Plus className="h-4 w-4" aria-hidden /> {ui.createLabel}
                            </Button>
                        ) : null}
                    </>
                }
                actions={{
                    onToggle: (item, enabled) => toggle.mutate({ id: item.id, enabled }),
                    onEdit: setEditing,
                    onRemove: (item) => setConfirm({ type: "remove", item }),
                    onUpdate: (item) => setConfirm({ type: "update", item }),
                    onTest: setTesting,
                }}
            />
            {kind === "mcp" ? <McpFormDialog scope={scope} target={editing} onClose={() => setEditing(null)} /> : null}
            {kind === "skill" || kind === "agent" || kind === "command" ? <ResourceEditorDialog kind={kind} scope={scope} target={editing} onClose={() => setEditing(null)} /> : null}
            {kind === "skill" || kind === "plugin" || kind === "mcp" ? <InstallResourceDialog kind={kind} scope={scope} open={installing} onClose={() => setInstalling(false)} /> : null}
            {kind === "mcp" ? <McpTestDialog target={testing} onClose={() => setTesting(null)} /> : null}
            <ConfirmDialog
                open={confirm !== null}
                onOpenChange={(open) => !open && setConfirm(null)}
                variant={confirm?.type === "remove" ? "destructive" : "default"}
                pending={confirming}
                title={
                    confirm?.type === "remove"
                        ? `${ui.removeVerb} ${label.article === "a" ? "a" : "o"} ${label.one} "${confirm.item.name}"?`
                        : confirm?.item
                          ? `Atualizar "${confirm.item.name}"?`
                          : `Atualizar ${pendingUpdates} ${ui.title.toLowerCase()}?`
                }
                description={
                    confirm?.type === "remove"
                        ? `Um backup da configuração é feito antes; dá para restaurar na aba Controles.${kind === "plugin" ? " Vale depois de reiniciar o serviço." : ""}`
                        : `Atualiza para a versão disponível (backup antes).${kind === "plugin" ? " Plugins só mudam depois de reiniciar o serviço." : ""}${kind === "skill" ? " Edições locais da skill são sobrescritas." : ""}`
                }
                items={confirm?.type === "update" && !confirm.item ? (list.data ?? []).filter((item) => item.enabled && item.version?.outdated).map((item) => `${item.name}: ${item.version?.installed ?? "?"} → ${item.version?.available ?? "?"}`) : undefined}
                confirmLabel={confirm?.type === "remove" ? ui.removeVerb : "Atualizar"}
                onConfirm={() => {
                    if (!confirm) return
                    const done = { onSettled: () => setConfirm(null) }
                    if (confirm.type === "remove") remove.mutate(confirm.item.id, done)
                    else updateMany.mutate(confirm.item ? { ids: [confirm.item.id] } : { all: true }, done)
                }}
            />
        </>
    )
}

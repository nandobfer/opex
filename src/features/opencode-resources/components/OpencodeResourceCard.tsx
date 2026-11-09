"use client"

import type { ReactNode } from "react"
import { ResourceListCard } from "@/components/resources/ResourceListCard"
import type { OpencodeResourceKind } from "../constants"
import { matchesStatus, RESOURCE_STATUS_FILTER_LABELS, RESOURCE_STATUS_FILTERS } from "../logic"
import type { OpencodeResourceDto } from "../types"
import { KIND_UI } from "./kind-ui"
import { ResourceRow, type ResourceRowActions } from "./ResourceRow"
import { ScopeSelect } from "./ScopeSelect"

interface OpencodeResourceCardProps {
    kind: OpencodeResourceKind
    scope: string
    onScopeChange: (scope: string) => void
    items: readonly OpencodeResourceDto[] | undefined
    loading: boolean
    error: unknown
    fetching: boolean
    onRefresh: () => void
    actions: ResourceRowActions
    /** Botões do cabeçalho (Novo, Instalar, Atualizar todos). */
    headerActions?: ReactNode
    busyIds?: ReadonlySet<string>
}

const SEARCH_KEYS = ["name", "description", "source"]

/**
 * Esqueleto compartilhado das abas Skills, Agentes, Comandos, Plugins e MCPs: escopo, busca por nome
 * (fuse.js), filtro de situação, lista (virtualizada acima de 50) e os estados carregando/vazio/erro —
 * sobre a `ResourceListCard` compartilhada (a mesma das Skills do Agente Opex).
 */
export function OpencodeResourceCard({ kind, scope, onScopeChange, items, loading, error, fetching, onRefresh, actions, headerActions, busyIds }: OpencodeResourceCardProps) {
    const ui = KIND_UI[kind]
    const filters = RESOURCE_STATUS_FILTERS.filter((value) => value !== "outdated" || ui.hasVersions).map((value) => ({ value, label: RESOURCE_STATUS_FILTER_LABELS[value] }))
    return (
        <ResourceListCard
            title={ui.title}
            description={ui.description}
            icon={ui.icon}
            items={items}
            loading={loading}
            error={error}
            errorHint="Confira se o OpenCode está no ar (aba Controles)."
            fetching={fetching}
            onRefresh={onRefresh}
            rowKey={(item) => item.id}
            renderRow={(item) => <ResourceRow item={item} actions={actions} busy={busyIds?.has(item.id)} />}
            searchKeys={SEARCH_KEYS}
            filters={filters}
            matches={matchesStatus}
            emptyTitle={ui.emptyTitle}
            emptyDescription={ui.emptyDescription}
            headerActions={headerActions}
            toolbar={<ScopeSelect value={scope} onChange={onScopeChange} className="w-full" />}
        />
    )
}

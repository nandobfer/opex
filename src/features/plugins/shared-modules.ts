/**
 * Tabela de módulos compartilhados entre o shell e os plugins (OPE-172). Módulo PURO.
 *
 * O bundle do cliente de um plugin trata estes especificadores como EXTERNOS (o Rolldown troca cada
 * um por `opex-shared:<id>`); o carregador do navegador resolve o marcador para a instância ÚNICA do
 * shell (duas cópias do React quebram os hooks). Especificador fora da lista falha na compilação.
 * Os carregadores reais ficam em `client/shared-registry.ts` (teste garante que as listas batem).
 */

export const SHARED_MARKER_PREFIX = "opex-shared:"

/** Bibliotecas do shell (React, animação, dados, toasts, ícones, datas). */
export const SHARED_LIBRARIES = [
    "react",
    "react/jsx-runtime",
    "react-dom",
    "framer-motion",
    "@tanstack/react-query",
    "sonner",
    "lucide-react",
    "date-fns",
    "date-fns/locale",
] as const

/** Módulos do app expostos aos plugins. `@opex/api` é o axios do contexto (dono ou portal do cliente). */
export const SHARED_APP_MODULES = ["@opex/api", "@opex/theme", "@opex/plugin-sdk/client"] as const

/** `src/components/ui/<nome>` → `@opex/ui/<nome>`. */
export const SHARED_UI_COMPONENTS = [
    "accordion",
    "alert",
    "alert-dialog",
    "autocomplete-list",
    "avatar",
    "badge",
    "button",
    "calendar",
    "card",
    "chart",
    "checkbox",
    "chip-input",
    "combobox",
    "confirm-dialog",
    "context-menu",
    "data-table",
    "date-picker",
    "date-range-calendar",
    "dialog",
    "dropdown-menu",
    "field",
    "field-trigger",
    "form",
    "form-footer",
    "form-grid",
    "icon-action",
    "info-tooltip",
    "input",
    "label",
    "leveled-slider",
    "markdown",
    "markdown-field",
    "markdown-line",
    "markdown-line-action",
    "markdown-media",
    "markdown-selection",
    "money-input",
    "multi-autocomplete",
    "option-tabs",
    "popover",
    "portal-container",
    "preset-date-range-filter",
    "progress",
    "radio-group",
    "reason-button",
    "refresh-button",
    "removable-chip",
    "run-now-button",
    "search-picker",
    "secret-reveal",
    "secret-value-input",
    "select",
    "selection-checkbox",
    "separator",
    "sheet",
    "skeleton",
    "slider",
    "switch",
    "table",
    "tabs",
    "textarea",
    "time-picker",
    "time-slot-list",
    "toast",
    "toggle-card",
    "tooltip",
    "tooltip-icon-button",
    "visually-hidden",
    "color-picker",
    "check-list/SearchableCheckList",
    "check-tree/CheckTree",
] as const

/** `src/components/list/<Nome>` → `@opex/list/<Nome>`. */
export const SHARED_LIST_COMPONENTS = [
    "ActiveFilterChips",
    "ActiveItemRow",
    "AgentPageFrame",
    "AgentPageHeader",
    "CadastroFilterCard",
    "CadastroHeader",
    "CadastroMultiSelect",
    "CadastroTableCard",
    "CadastroTableSkeleton",
    "ChipOverflowList",
    "CollapsibleFilters",
    "FilterGroup",
    "FilterSwitch",
    "InfiniteListView",
    "InlineRenameField",
    "ListFilters",
    "SearchInput",
    "StatusFilterMultiSelect",
    "StatusPill",
    "TabFooter",
    "TableAction",
    "VirtualStack",
    "VirtualizedRows",
] as const

/** `src/components/metrics/<nome>` → `@opex/metrics/<nome>`. */
export const SHARED_METRICS_COMPONENTS = [
    "DataSinceNotice",
    "KpiCard",
    "LastUsedKpi",
    "LineChartTooltip",
    "LineSwatch",
    "MetricsFiltersBar",
    "MetricsOverviewSkeleton",
    "MetricsPeriodFilter",
    "MultiLineChart",
    "PanelMessage",
    "RefreshIconButton",
    "SampleAxisTick",
    "SelectableLegend",
    "StaleBadge",
    "UsageBar",
    "UsageByDateChart",
    "format",
    "layout",
    "line-chart-model",
    "line-dots",
    "usage-level",
    "charts/BarsChart",
    "charts/ChartCard",
    "charts/ChartDataTable",
    "charts/DonutChart",
    "charts/EmptyChart",
    "charts/RankedBarsCard",
    "charts/TrendLineChart",
    "charts/palette",
    "charts/types",
    "charts/use-chart-animation",
] as const

/** `src/components/feedback/<Nome>` → `@opex/feedback/<Nome>` (estados vazio e de erro). */
export const SHARED_FEEDBACK_COMPONENTS = [
    "AvailabilityNotice",
    "EmptyState",
    "ErrorState",
    "InDevelopment",
    "PreviewSchedulerNotice",
] as const

export const SHARED_MODULE_IDS: readonly string[] = [
    ...SHARED_LIBRARIES,
    ...SHARED_APP_MODULES,
    ...SHARED_UI_COMPONENTS.map((name) => `@opex/ui/${name}`),
    ...SHARED_LIST_COMPONENTS.map((name) => `@opex/list/${name}`),
    ...SHARED_METRICS_COMPONENTS.map((name) => `@opex/metrics/${name}`),
    ...SHARED_FEEDBACK_COMPONENTS.map((name) => `@opex/feedback/${name}`),
]

const SHARED_SET = new Set(SHARED_MODULE_IDS)

export const isSharedModule = (id: string) => SHARED_SET.has(id)

/** O especificador parece do shell (`@opex/...` ou biblioteca compartilhada) mas não existe na tabela. */
export const isUnknownSharedModule = (id: string) => id.startsWith("@opex/") && !SHARED_SET.has(id)

export const sharedMarker = (id: string) => `${SHARED_MARKER_PREFIX}${id}`

/** Especificadores que o código de SERVIDOR de um plugin pode importar (o resto é empacotado). */
export const SERVER_ALLOWED_EXTERNALS = ["@opex/plugin-sdk/server"] as const
export const isNodeBuiltin = (id: string) => id.startsWith("node:")

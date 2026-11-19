/**
 * Módulos do Opex expostos aos plugins (instância única do app), gerado de `shared-exports.json`.
 * Especificador fora desta lista falha na compilação. Tipos frouxos de propósito (`any`): confira
 * as props no guia e nos exemplos.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "@opex/feedback/AvailabilityNotice" {
    export const AvailabilityNotice: any
}
declare module "@opex/feedback/EmptyState" {
    export const EmptyState: any
}
declare module "@opex/feedback/ErrorState" {
    export const ErrorState: any
}
declare module "@opex/feedback/InDevelopment" {
    export const InDevelopment: any
}
declare module "@opex/feedback/PreviewSchedulerNotice" {
    export const PreviewSchedulerNotice: any
}
declare module "@opex/list/ActiveFilterChips" {
    export const ActiveFilterChips: any
}
declare module "@opex/list/ActiveItemRow" {
    export const ACTIVE_ITEM_ROW_SKELETON_CLASS: any
    export const ActiveItemRow: any
}
declare module "@opex/list/AgentPageFrame" {
    export const AgentPageFrame: any
}
declare module "@opex/list/AgentPageHeader" {
    export const AgentPageHeader: any
}
declare module "@opex/list/CadastroFilterCard" {
    export const CadastroFilterCard: any
}
declare module "@opex/list/CadastroHeader" {
    export const CadastroHeader: any
}
declare module "@opex/list/CadastroMultiSelect" {
    export const CadastroMultiSelect: any
}
declare module "@opex/list/CadastroTableCard" {
    export const CadastroTableCard: any
}
declare module "@opex/list/CadastroTableSkeleton" {
    export const CadastroTableSkeleton: any
}
declare module "@opex/list/ChipOverflowList" {
    export const ChipOverflowList: any
}
declare module "@opex/list/CollapsibleFilters" {
    export const CollapseToggle: any
    export const CollapsedChips: any
    export const CollapsibleBody: any
    export const useFiltersCollapse: any
}
declare module "@opex/list/FilterGroup" {
    export const FilterGroup: any
}
declare module "@opex/list/FilterSwitch" {
    export const FilterSwitch: any
}
declare module "@opex/list/InfiniteListView" {
    export const InfiniteListView: any
}
declare module "@opex/list/InlineRenameField" {
    export const InlineRenameField: any
}
declare module "@opex/list/ListFilters" {
    export const ListFilters: any
    export const SEARCH_DEBOUNCE_MS: any
}
declare module "@opex/list/SearchInput" {
    export const SearchInput: any
}
declare module "@opex/list/StatusFilterMultiSelect" {
    export const StatusFilterMultiSelect: any
}
declare module "@opex/list/StatusPill" {
    export const StatusPill: any
}
declare module "@opex/list/TabFooter" {
    export const TabFooter: any
    export const TabWrapper: any
}
declare module "@opex/list/TableAction" {
    export const TableAction: any
}
declare module "@opex/list/VirtualStack" {
    export const VIRTUALIZE_AFTER: any
    export const VirtualStack: any
}
declare module "@opex/list/VirtualizedRows" {
    export const VIRTUALIZE_ABOVE: any
    export const VirtualizedRows: any
}
declare module "@opex/metrics/DataSinceNotice" {
    export const DataSinceNotice: any
    export const formatDataSince: any
}
declare module "@opex/metrics/KpiCard" {
    export const KpiCard: any
    export const KpiGrid: any
}
declare module "@opex/metrics/LastUsedKpi" {
    export const LastUsedKpi: any
}
declare module "@opex/metrics/LineChartTooltip" {
    export const LineChartTooltip: any
    export const emptyMessage: any
    export const formatBucketTitle: any
}
declare module "@opex/metrics/LineSwatch" {
    export const LineSwatch: any
}
declare module "@opex/metrics/MetricsFiltersBar" {
    export const MetricsFiltersBar: any
}
declare module "@opex/metrics/MetricsOverviewSkeleton" {
    export const MetricsOverviewSkeleton: any
}
declare module "@opex/metrics/MetricsPeriodFilter" {
    export const MetricsPeriodFilter: any
}
declare module "@opex/metrics/MultiLineChart" {
    export const MultiLineChart: any
    export const lineSelectionKey: any
}
declare module "@opex/metrics/PanelMessage" {
    export const PanelMessage: any
}
declare module "@opex/metrics/RefreshIconButton" {
    export const RefreshIconButton: any
}
declare module "@opex/metrics/SampleAxisTick" {
    export const SAMPLE_AXIS_HEIGHT: any
    export const SampleAxisTick: any
}
declare module "@opex/metrics/SelectableLegend" {
    export const SelectableLegend: any
}
declare module "@opex/metrics/StaleBadge" {
    export const StaleBadge: any
}
declare module "@opex/metrics/UsageBar" {
    export const UsageBar: any
}
declare module "@opex/metrics/UsageByDateChart" {
    export const UsageByDateChart: any
}
declare module "@opex/metrics/charts/BarsChart" {
    export const BarsChart: any
}
declare module "@opex/metrics/charts/ChartCard" {
    export const ChartCard: any
}
declare module "@opex/metrics/charts/ChartDataTable" {
    export const ChartDataTable: any
}
declare module "@opex/metrics/charts/DonutChart" {
    export const DonutChart: any
}
declare module "@opex/metrics/charts/EmptyChart" {
    export const EmptyChart: any
}
declare module "@opex/metrics/charts/RankedBarsCard" {
    export const RankedBarsCard: any
}
declare module "@opex/metrics/charts/TrendLineChart" {
    export const TrendLineChart: any
}
declare module "@opex/metrics/charts/palette" {
    export const CHART_COLORS: any
    export const LINE_SERIES_COLORS: any
    export const LINE_SERIES_DASHES: any
    export const SEMANTIC_COLORS: any
    export const SINGLE_MEASURE_COLOR: any
    export const colorAt: any
    export const dashPattern: any
    export const lineStyleAt: any
}
declare module "@opex/metrics/charts/types" {
    export {}
}
declare module "@opex/metrics/charts/use-chart-animation" {
    export const useChartAnimation: any
}
declare module "@opex/metrics/format" {
    export const EMPTY_METRIC: any
    export const formatBucketLabel: any
    export const formatMetricValue: any
}
declare module "@opex/metrics/layout" {
    export const CHART_CARD_CHROME: any
    export const CHART_GRID: any
    export const CHART_HEIGHT: any
    export const KPI_CARD_HEIGHT: any
    export const KPI_GRID: any
    export const LINE_CHART_CARD_CHROME: any
}
declare module "@opex/metrics/line-chart-model" {
    export const isSmallSample: any
    export const lineSeriesItems: any
    export const sampleOf: any
    export const valueAxis: any
}
declare module "@opex/metrics/line-dots" {
    export const makeSampleDot: any
}
declare module "@opex/metrics/usage-level" {
    export const USAGE_CRITICAL_PERCENT: any
    export const USAGE_LEVEL_CLASSES: any
    export const USAGE_PULSE_PERCENT: any
    export const USAGE_UNKNOWN_DOT_CLASS: any
    export const USAGE_WARNING_PERCENT: any
    export const usageLevel: any
    export const worstUsageLevel: any
}
declare module "@opex/ui/accordion" {
    export const Accordion: any
    export const AccordionContent: any
    export const AccordionItem: any
    export const AccordionTrigger: any
}
declare module "@opex/ui/alert" {
    export const Alert: any
    export const AlertDescription: any
    export const AlertTitle: any
}
declare module "@opex/ui/alert-dialog" {
    export const AlertDialog: any
    export const AlertDialogAction: any
    export const AlertDialogCancel: any
    export const AlertDialogContent: any
    export const AlertDialogDescription: any
    export const AlertDialogFooter: any
    export const AlertDialogHeader: any
    export const AlertDialogOverlay: any
    export const AlertDialogPortal: any
    export const AlertDialogTitle: any
    export const AlertDialogTrigger: any
}
declare module "@opex/ui/autocomplete-list" {
    export const AutocompleteList: any
    export const optionId: any
    export const useListNavigation: any
}
declare module "@opex/ui/avatar" {
    export const Avatar: any
    export const AvatarFallback: any
    export const AvatarImage: any
}
declare module "@opex/ui/badge" {
    export const Badge: any
    export const badgeVariants: any
}
declare module "@opex/ui/button" {
    export const Button: any
    export const buttonVariants: any
}
declare module "@opex/ui/calendar" {
    export const Calendar: any
}
declare module "@opex/ui/card" {
    export const Card: any
    export const CardContent: any
    export const CardDescription: any
    export const CardFooter: any
    export const CardHeader: any
    export const CardTitle: any
}
declare module "@opex/ui/chart" {
    export const ChartContainer: any
    export const ChartLegend: any
    export const ChartLegendContent: any
    export const ChartStyle: any
    export const ChartTooltip: any
    export const ChartTooltipContent: any
    export const ChartTooltipFooter: any
    export const ChartTooltipFrame: any
}
declare module "@opex/ui/check-list/SearchableCheckList" {
    export const SearchableCheckList: any
}
declare module "@opex/ui/check-tree/CheckTree" {
    export const CheckTree: any
}
declare module "@opex/ui/checkbox" {
    export const Checkbox: any
}
declare module "@opex/ui/chip-input" {
    export const ChipInput: any
    export const splitValues: any
}
declare module "@opex/ui/color-picker" {
    export const ColorPicker: any
    export const ColorPickerPanel: any
    export const ColorSwatch: any
    export const LowContrastWarning: any
    export const favoriteLabel: any
}
declare module "@opex/ui/combobox" {
    export const Combobox: any
}
declare module "@opex/ui/confirm-dialog" {
    export const ConfirmDialog: any
}
declare module "@opex/ui/context-menu" {
    export const ContextMenu: any
    export const ContextMenuCheckboxItem: any
    export const ContextMenuContent: any
    export const ContextMenuGroup: any
    export const ContextMenuItem: any
    export const ContextMenuLabel: any
    export const ContextMenuPortal: any
    export const ContextMenuRadioGroup: any
    export const ContextMenuRadioItem: any
    export const ContextMenuSeparator: any
    export const ContextMenuShortcut: any
    export const ContextMenuSub: any
    export const ContextMenuSubContent: any
    export const ContextMenuSubTrigger: any
    export const ContextMenuTrigger: any
}
declare module "@opex/ui/data-table" {
    export const DataTable: any
}
declare module "@opex/ui/date-picker" {
    export const DatePicker: any
}
declare module "@opex/ui/date-range-calendar" {
    export const DateRangeCalendar: any
    export const formatRangeLabel: any
    export const parseIsoDate: any
    export const toIsoDate: any
}
declare module "@opex/ui/dialog" {
    export const Dialog: any
    export const DialogClose: any
    export const DialogContent: any
    export const DialogDescription: any
    export const DialogFooter: any
    export const DialogHeader: any
    export const DialogOverlay: any
    export const DialogPortal: any
    export const DialogTitle: any
    export const DialogTrigger: any
}
declare module "@opex/ui/dropdown-menu" {
    export const DropdownMenu: any
    export const DropdownMenuCheckboxItem: any
    export const DropdownMenuContent: any
    export const DropdownMenuGroup: any
    export const DropdownMenuItem: any
    export const DropdownMenuLabel: any
    export const DropdownMenuPortal: any
    export const DropdownMenuRadioGroup: any
    export const DropdownMenuRadioItem: any
    export const DropdownMenuSeparator: any
    export const DropdownMenuShortcut: any
    export const DropdownMenuSub: any
    export const DropdownMenuSubContent: any
    export const DropdownMenuSubTrigger: any
    export const DropdownMenuTrigger: any
}
declare module "@opex/ui/field" {
    export const Field: any
}
declare module "@opex/ui/field-trigger" {
    export const FieldTrigger: any
}
declare module "@opex/ui/form" {
    export const Form: any
    export const FormControl: any
    export const FormDescription: any
    export const FormField: any
    export const FormItem: any
    export const FormLabel: any
    export const FormMessage: any
    export const useFormField: any
}
declare module "@opex/ui/form-footer" {
    export const FormFooter: any
}
declare module "@opex/ui/form-grid" {
    export const FORM_GRID: any
    export const FORM_GRID_3: any
    export const FORM_GRID_COMPACT: any
    export const FORM_GRID_WIDE: any
}
declare module "@opex/ui/icon-action" {
    export const IconAction: any
}
declare module "@opex/ui/info-tooltip" {
    export const InfoTooltip: any
    export const LabelWithInfo: any
}
declare module "@opex/ui/input" {
    export const Input: any
}
declare module "@opex/ui/label" {
    export const Label: any
}
declare module "@opex/ui/leveled-slider" {
    export const LeveledSlider: any
}
declare module "@opex/ui/markdown" {
    export const Markdown: any
}
declare module "@opex/ui/markdown-field" {
    export const MarkdownField: any
}
declare module "@opex/ui/markdown-line" {
    export const LineRenderContext: any
    export const MarkdownLine: any
}
declare module "@opex/ui/markdown-line-action" {
    export const MarkdownLineActionContext: any
    export const MarkdownLineActionProvider: any
    export const useInheritedLineAction: any
}
declare module "@opex/ui/markdown-media" {
    export const MarkdownMedia: any
}
declare module "@opex/ui/markdown-selection" {
    export const MarkdownSelectionLayer: any
}
declare module "@opex/ui/money-input" {
    export const MoneyInput: any
}
declare module "@opex/ui/multi-autocomplete" {
    export const MultiAutocomplete: any
}
declare module "@opex/ui/option-tabs" {
    export const OptionTabs: any
}
declare module "@opex/ui/popover" {
    export const Popover: any
    export const PopoverAnchor: any
    export const PopoverContent: any
    export const PopoverTrigger: any
}
declare module "@opex/ui/portal-container" {
    export const PortalContainerProvider: any
    export const usePortalContainer: any
}
declare module "@opex/ui/preset-date-range-filter" {
    export const DATE_PRESET: any
    export const DEFAULT_DATE_PRESETS: any
    export const PresetDateRangeFilter: any
    export const lastDaysPreset: any
}
declare module "@opex/ui/progress" {
    export const Progress: any
}
declare module "@opex/ui/radio-group" {
    export const RadioGroup: any
    export const RadioGroupItem: any
}
declare module "@opex/ui/reason-button" {
    export const ReasonButton: any
}
declare module "@opex/ui/refresh-button" {
    export const RefreshButton: any
}
declare module "@opex/ui/removable-chip" {
    export const ChipList: any
}
declare module "@opex/ui/run-now-button" {
    export const RunNowButton: any
    export const RunNowDialog: any
}
declare module "@opex/ui/search-picker" {
    export const SearchPicker: any
    export const pinItemsFirst: any
}
declare module "@opex/ui/secret-reveal" {
    export const SecretReveal: any
}
declare module "@opex/ui/secret-value-input" {
    export const SecretValueInput: any
}
declare module "@opex/ui/select" {
    export const Select: any
    export const SelectContent: any
    export const SelectGroup: any
    export const SelectItem: any
    export const SelectLabel: any
    export const SelectScrollDownButton: any
    export const SelectScrollUpButton: any
    export const SelectSeparator: any
    export const SelectTrigger: any
    export const SelectValue: any
}
declare module "@opex/ui/selection-checkbox" {
    export const SelectionCheckbox: any
}
declare module "@opex/ui/separator" {
    export const Separator: any
}
declare module "@opex/ui/sheet" {
    export const Sheet: any
    export const SheetClose: any
    export const SheetContent: any
    export const SheetDescription: any
    export const SheetFooter: any
    export const SheetHeader: any
    export const SheetOverlay: any
    export const SheetPortal: any
    export const SheetTitle: any
    export const SheetTrigger: any
}
declare module "@opex/ui/skeleton" {
    export const Skeleton: any
}
declare module "@opex/ui/slider" {
    export const Slider: any
}
declare module "@opex/ui/switch" {
    export const Switch: any
}
declare module "@opex/ui/table" {
    export const Table: any
    export const TableBody: any
    export const TableCaption: any
    export const TableCell: any
    export const TableFooter: any
    export const TableHead: any
    export const TableHeader: any
    export const TableRow: any
}
declare module "@opex/ui/tabs" {
    export const Tabs: any
    export const TabsContent: any
    export const TabsList: any
    export const TabsTrigger: any
}
declare module "@opex/ui/textarea" {
    export const Textarea: any
}
declare module "@opex/ui/time-picker" {
    export const TimePicker: any
}
declare module "@opex/ui/time-slot-list" {
    export const TimeSlotList: any
    export const buildTimeSlots: any
    export const minutesToTime: any
    export const timeToMinutes: any
}
declare module "@opex/ui/toast" {
    export const Toaster: any
}
declare module "@opex/ui/toggle-card" {
    export const FormToggleCard: any
    export const ToggleCard: any
    export const ToggleRow: any
}
declare module "@opex/ui/tooltip" {
    export const Tooltip: any
    export const TooltipContent: any
    export const TooltipProvider: any
    export const TooltipTrigger: any
}
declare module "@opex/ui/tooltip-icon-button" {
    export const TooltipIconButton: any
}
declare module "@opex/ui/visually-hidden" {
    export const VisuallyHidden: any
}
declare module "@opex/theme" {
    export function cn(...values: unknown[]): string
    export const FORM_GRID: string
    export const FORM_GRID_COMPACT: string
    export const FORM_GRID_WIDE: string
    export const FORM_GRID_3: string
    export const PRIMARY_HEX: string
}
declare module "axios" {
    export interface AxiosInstance {
        get<T = any>(url: string, config?: any): Promise<{ data: T }>
        post<T = any>(url: string, body?: unknown, config?: any): Promise<{ data: T }>
        put<T = any>(url: string, body?: unknown, config?: any): Promise<{ data: T }>
        patch<T = any>(url: string, body?: unknown, config?: any): Promise<{ data: T }>
        delete<T = any>(url: string, config?: any): Promise<{ data: T }>
    }
}

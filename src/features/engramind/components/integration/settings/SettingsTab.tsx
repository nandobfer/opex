"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, Loader2, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Skeleton } from "@/components/ui/skeleton"
import { REINDEX_SETTING_KEYS, SETTING_GROUP_LABELS, SETTING_GROUPS } from "../../../constants"
import { IMPLICIT_URL_SETTING_KEYS, PROVIDER_MANAGED_SETTING_KEYS } from "../../../ai-source"
import { buildSettingsSchema, changedSettings, settingGroupOf } from "../../../schemas/settings"
import type { SettingMeta } from "../../../types"
import { engramindSend, useEngramindMutation, useEngramindQuery } from "../../../hooks/useEngramind"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { Section } from "../../shared/Section"
import { StaleFormNotice } from "../../shared/StaleFormNotice"
import { useFormSnapshot } from "../../shared/useFormSnapshot"
import { SettingField } from "./SettingField"
import { SettingsFilters, filterSettingMetas } from "./SettingsFilters"
import { ConsolidationActions, INITIAL_CONSOLIDATION_UI, ReindexAction, RetentionInfo, type ConsolidationUiState, type SaveDraftResult, type SectionRunProps } from "./SectionActions"
import { isCategoryList } from "../../../schemas/settings"
import type { EngramindStatus } from "../../../types"
import { useEngramindQuery as useStatusQuery } from "../../../hooks/useEngramind"

const GROUP_HELP: Record<string, string> = {
    limits: "Limites por token e por lote.",
    categories: "Categorias das memórias e a ordem delas no contexto.",
    memory: "Regras de escrita das memórias.",
    context: "Bloco de contexto entregue aos agentes (orçamento e formato).",
    redator: "LLM que dá título e revisa o texto das memórias. Provedor, modelo e reservas são escolhidos na aba Provedores (IA do Opex).",
    embedding: "Vetores da busca por sentido. Provedor, modelo e dimensão são escolhidos na aba Provedores (IA do Opex); trocar o prefixo valida o provedor e reindexa.",
    search: "Fusão da busca por sentido e por texto e as dicas.",
    consolidation: "Fusão de duplicatas, nota de importância e memórias desatualizadas, no agendamento (horário de Brasília convertido para UTC) ou agora.",
    webhooks: "Entrega dos eventos aos apps (inclusive ao Opex).",
    retention: "Limpeza horária dos registros antigos (automática; sem execução manual no Engramind).",
}

/** Chaves que só a aba Provedores edita (a URL é definida pelo provedor escolhido). */
export function readOnlyNoteOf(key: string): string | undefined {
    if (IMPLICIT_URL_SETTING_KEYS.includes(key)) return "Definida pelo provedor escolhido na aba Provedores."
    if (PROVIDER_MANAGED_SETTING_KEYS.includes(key)) return "Edite na aba Provedores (IA do Opex)."
    return undefined
}

const visibleMetas = (data: { settings: SettingMeta[] } | undefined) => data?.settings.filter((meta) => !meta.secret)

/** Valor inicial do rascunho: o salvo quando foi alterado; `null` quando vale o padrão. */
const initialOf = (meta: SettingMeta) => (meta.updated_at ? meta.value : null)

/** Aba Configurações: todas as chaves de `GET /v1/settings`, agrupadas, gravadas só as alteradas (tudo ou nada). */
export function SettingsTab({ onDirtyChange, onConfigure }: { onDirtyChange: (dirty: boolean) => void; onConfigure: () => void }) {
    const query = useEngramindQuery<{ settings: SettingMeta[] }>("settings")
    const [dirty, setDirty] = useState(false)
    const metas = useMemo(() => visibleMetas(query.data), [query.data])
    // Refazer a consulta (tempo real, reconexão) não descarta o rascunho: só remonta quando o conteúdo muda sem alterações pendentes.
    const snapshot = useFormSnapshot(metas, dirty)
    // Sobrevivem ao remonte do formulário depois de salvar (inclusive no "Salvar e executar").
    const [filters, setFilters] = useState<SettingsFilterState>({ term: "", onlyChanged: false })
    const [consolidationUi, setConsolidationUi] = useState<ConsolidationUiState>(INITIAL_CONSOLIDATION_UI)
    const [reindexPending, setReindexPending] = useState(false)
    const changeDirty = useCallback(
        (next: boolean) => {
            setDirty(next)
            onDirtyChange(next)
        },
        [onDirtyChange],
    )
    return (
        <QueryBoundary isLoading={query.isLoading} error={query.error} onRetry={() => void query.refetch()} skeleton={<SettingsSkeleton />} onConfigure={onConfigure}>
            <div className="flex flex-col gap-4">
                <StaleFormNotice stale={snapshot.stale} onReload={() => snapshot.adopt()} />
                {snapshot.data && (
                    <SettingsForm
                        key={snapshot.key}
                        metas={snapshot.data}
                        onDirtyChange={changeDirty}
                        onSaved={async () => snapshot.adopt(visibleMetas((await query.refetch()).data))}
                        filters={filters}
                        onFilters={setFilters}
                        consolidationUi={consolidationUi}
                        onConsolidationUi={setConsolidationUi}
                        reindexPending={reindexPending}
                        onReindexPending={setReindexPending}
                    />
                )}
            </div>
        </QueryBoundary>
    )
}

interface SettingsFilterState {
    term: string
    onlyChanged: boolean
}

interface SettingsFormProps {
    metas: SettingMeta[]
    onDirtyChange: (dirty: boolean) => void
    onSaved: () => Promise<void>
    filters: SettingsFilterState
    onFilters: Dispatch<SetStateAction<SettingsFilterState>>
    consolidationUi: ConsolidationUiState
    onConsolidationUi: Dispatch<SetStateAction<ConsolidationUiState>>
    reindexPending: boolean
    onReindexPending: (pending: boolean) => void
}

function SettingsForm({ metas, onDirtyChange, onSaved, filters, onFilters, consolidationUi, onConsolidationUi, reindexPending, onReindexPending }: SettingsFormProps) {
    const saved = useMemo(() => Object.fromEntries(metas.map((meta) => [meta.key, initialOf(meta)])), [metas])
    const [draft, setDraft] = useState<Record<string, unknown>>(saved)
    const [confirmReindex, setConfirmReindex] = useState(false)
    const changes = useMemo(() => Object.fromEntries(Object.entries(changedSettings(saved, draft)).filter(([key]) => !PROVIDER_MANAGED_SETTING_KEYS.includes(key))), [saved, draft])
    const dirty = Object.keys(changes).length > 0
    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
    const validation = useMemo(() => buildSettingsSchema(metas).safeParse(changes), [metas, changes])
    const reindex = Object.keys(changes).some((key) => REINDEX_SETTING_KEYS.includes(key))
    const save = useEngramindMutation((settings: Record<string, unknown>) => engramindSend("put", "settings", { settings }), { invalidate: ["settings", "status"], success: "Configurações do Engramind salvas" })
    const status = useStatusQuery<EngramindStatus>("status")
    const { term, onlyChanged } = filters
    const setTerm = (next: string) => onFilters((prev) => ({ ...prev, term: next }))
    const setOnlyChanged = (next: boolean) => onFilters((prev) => ({ ...prev, onlyChanged: next }))
    const shown = useMemo(() => filterSettingMetas(metas, { term, onlyChanged, draft }), [metas, term, onlyChanged, draft])
    const categories = useMemo(() => {
        const current = draft["categories.list"] ?? metas.find((meta) => meta.key === "categories.list")?.default
        return isCategoryList(current) ? current.map((item) => ({ key: item.key, label: item.label })) : []
    }, [draft, metas])

    const groups = SETTING_GROUPS.map((group) => ({ group, items: shown.filter((meta) => settingGroupOf(meta.key) === group) })).filter((entry) => entry.items.length > 0)
    const others = shown.filter((meta) => !(SETTING_GROUPS as readonly string[]).includes(settingGroupOf(meta.key)))
    // Gravação aguardando a confirmação "Trocar o embedding?" (do Salvar ou de um "Salvar e executar").
    const pendingRun = useRef<((result: SaveDraftResult) => void) | null>(null)
    const settleRun = (result: SaveDraftResult) => {
        pendingRun.current?.(result)
        pendingRun.current = null
    }
    const submit = () => (reindex ? setConfirmReindex(true) : save.mutate(changes, { onSuccess: () => void onSaved() }))
    // "Salvar e executar": grava as pendentes (tudo ou nada) e só então a ação roda; falha → nada executa.
    // Com chave de embedding, pede a mesma confirmação do Salvar (o PUT valida o provedor e reindexa).
    const saveDraft = useCallback(async (): Promise<SaveDraftResult> => {
        if (!dirty) return true
        if (!validation.success) return false
        if (reindex) {
            return new Promise<SaveDraftResult>((resolve) => {
                pendingRun.current?.(false)
                pendingRun.current = resolve
                setConfirmReindex(true)
            })
        }
        try {
            await save.mutateAsync(changes)
            await onSaved()
            return true
        } catch {
            return false
        }
    }, [dirty, validation.success, reindex, save, changes, onSaved])
    const confirmReindexSave = () =>
        save.mutate(changes, {
            onSuccess: () => {
                setConfirmReindex(false)
                settleRun({ reindexed: true })
                void onSaved()
            },
            onError: () => {
                setConfirmReindex(false)
                settleRun(false)
            },
        })
    const run: SectionRunProps = { dirty, saveDraft }
    const sectionExtra: Record<string, ReactNode> = { consolidation: <ConsolidationActions {...run} ui={consolidationUi} onUi={onConsolidationUi} />, retention: <RetentionInfo /> }
    const sectionActions: Record<string, ReactNode> = { embedding: <ReindexAction {...run} pending={reindexPending} onPending={onReindexPending} /> }

    return (
        <div className="flex flex-col gap-6">
            <SettingsFilters term={term} onTerm={setTerm} onlyChanged={onlyChanged} onOnlyChanged={setOnlyChanged} shown={shown.length} total={metas.length} />
            <AnimatePresence initial={false}>
                {shown.length === 0 && (
                    <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="settings-empty">
                        {onlyChanged ? "Nenhuma configuração alterada" : "Nenhuma configuração encontrada"}
                        {term ? ` para "${term}"` : ""}.
                    </motion.p>
                )}
            </AnimatePresence>
            {[...groups, ...(others.length ? [{ group: "outras", items: others }] : [])].map(({ group, items }) => (
                <Section key={group} title={SETTING_GROUP_LABELS[group as keyof typeof SETTING_GROUP_LABELS] ?? "Outras"} info={GROUP_HELP[group]} actions={sectionActions[group]}>
                    <div className={FORM_GRID}>
                        {items.map((meta) => (
                            <SettingField
                                key={meta.key}
                                meta={meta}
                                value={draft[meta.key] ?? null}
                                dirty={meta.key in changes}
                                readOnlyNote={readOnlyNoteOf(meta.key)}
                                categories={categories}
                                nextRunAt={meta.type === "cron" ? (status.data?.consolidation?.next_run_at ?? null) : undefined}
                                onChange={(value) => setDraft((prev) => ({ ...prev, [meta.key]: value }))}
                            />
                        ))}
                    </div>
                    {sectionExtra[group]}
                </Section>
            ))}
            <AnimatePresence initial={false}>
                {dirty && (
                    <motion.div key="bar" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.2 }} className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
                        <span className="text-sm">{Object.keys(changes).length} alteração(ões)</span>
                        {reindex && (
                            <span className="flex items-center gap-1.5 text-xs text-warning">
                                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> O provedor de embedding é validado e as memórias são reindexadas.
                            </span>
                        )}
                        {!validation.success && <span className="text-xs text-destructive">{validation.error.issues[0]?.message}</span>}
                        <div className="ml-auto flex gap-2">
                            <Button type="button" variant="outline" onClick={() => setDraft(saved)} disabled={save.isPending}>
                                <Undo2 className="mr-2 h-4 w-4" aria-hidden /> Desfazer
                            </Button>
                            <Button type="button" onClick={submit} disabled={!validation.success || save.isPending}>
                                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />} Salvar
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <ConfirmDialog
                open={confirmReindex}
                onOpenChange={(open) => {
                    setConfirmReindex(open)
                    // Cancelou a troca do embedding: a ação que esperava a gravação não roda.
                    if (!open) settleRun(false)
                }}
                title="Trocar o embedding?"
                description="O Engramind valida o provedor na mesma requisição (com ele fora do ar, nada é gravado) e reindexa todas as memórias. Enquanto isso, a busca por sentido usa os vetores antigos."
                items={Object.keys(changes).filter((key) => REINDEX_SETTING_KEYS.includes(key))}
                confirmLabel="Salvar e reindexar"
                pending={save.isPending}
                onConfirm={confirmReindexSave}
            />
        </div>
    )
}

export function SettingsSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center" data-testid="settings-filters-skeleton">
                <Skeleton className="h-9 w-full sm:flex-1" />
                <Skeleton className="h-9 w-full sm:w-40" />
            </div>
            {Array.from({ length: 3 }, (_, group) => (
                <div key={group} className="space-y-4 rounded-xl border p-6">
                    <Skeleton className="h-5 w-28" />
                    <div className={FORM_GRID}>
                        {Array.from({ length: 4 }, (_, index) => (
                            <Skeleton key={index} className="h-24 w-full rounded-lg" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

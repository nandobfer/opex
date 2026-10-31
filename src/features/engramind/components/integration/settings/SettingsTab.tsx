"use client"

import { useEffect, useMemo, useState } from "react"
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
import { SettingField } from "./SettingField"

const GROUP_HELP: Record<string, string> = {
    limits: "Limites por token e por lote.",
    categories: "Categorias das memórias e a ordem delas no contexto.",
    memory: "Regras de escrita das memórias.",
    context: "Bloco de contexto entregue aos agentes (orçamento e formato).",
    redator: "LLM que dá título e revisa o texto das memórias. Provedor, modelo e reservas são escolhidos na aba Provedores (IA do Opex).",
    embedding: "Vetores da busca por sentido. Provedor, modelo e dimensão são escolhidos na aba Provedores (IA do Opex); trocar o prefixo valida o provedor e reindexa.",
    search: "Fusão da busca por sentido e por texto e as dicas.",
    webhooks: "Entrega dos eventos aos apps (inclusive ao Opex).",
    retention: "Limpeza horária dos registros antigos.",
}

/** Chaves que só a aba Provedores edita (a URL é definida pelo provedor escolhido). */
export function readOnlyNoteOf(key: string): string | undefined {
    if (IMPLICIT_URL_SETTING_KEYS.includes(key)) return "Definida pelo provedor escolhido na aba Provedores."
    if (PROVIDER_MANAGED_SETTING_KEYS.includes(key)) return "Edite na aba Provedores (IA do Opex)."
    return undefined
}

/** Valor inicial do rascunho: o salvo quando foi alterado; `null` quando vale o padrão. */
const initialOf = (meta: SettingMeta) => (meta.updated_at ? meta.value : null)

/** Aba Configurações: todas as chaves de `GET /v1/settings`, agrupadas, gravadas só as alteradas (tudo ou nada). */
export function SettingsTab({ onDirtyChange, onConfigure }: { onDirtyChange: (dirty: boolean) => void; onConfigure: () => void }) {
    const query = useEngramindQuery<{ settings: SettingMeta[] }>("settings")
    return (
        <QueryBoundary isLoading={query.isLoading} error={query.error} onRetry={() => void query.refetch()} skeleton={<SettingsSkeleton />} onConfigure={onConfigure}>
            {query.data && <SettingsForm key={query.dataUpdatedAt} metas={query.data.settings.filter((meta) => !meta.secret)} onDirtyChange={onDirtyChange} />}
        </QueryBoundary>
    )
}

function SettingsForm({ metas, onDirtyChange }: { metas: SettingMeta[]; onDirtyChange: (dirty: boolean) => void }) {
    const saved = useMemo(() => Object.fromEntries(metas.map((meta) => [meta.key, initialOf(meta)])), [metas])
    const [draft, setDraft] = useState<Record<string, unknown>>(saved)
    const [confirmReindex, setConfirmReindex] = useState(false)
    const changes = useMemo(() => Object.fromEntries(Object.entries(changedSettings(saved, draft)).filter(([key]) => !PROVIDER_MANAGED_SETTING_KEYS.includes(key))), [saved, draft])
    const dirty = Object.keys(changes).length > 0
    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
    const validation = useMemo(() => buildSettingsSchema(metas).safeParse(changes), [metas, changes])
    const reindex = Object.keys(changes).some((key) => REINDEX_SETTING_KEYS.includes(key))
    const save = useEngramindMutation((settings: Record<string, unknown>) => engramindSend("put", "settings", { settings }), { invalidate: ["settings", "status"], success: "Configurações do Engramind salvas" })

    const groups = SETTING_GROUPS.map((group) => ({ group, items: metas.filter((meta) => settingGroupOf(meta.key) === group) })).filter((entry) => entry.items.length > 0)
    const others = metas.filter((meta) => !(SETTING_GROUPS as readonly string[]).includes(settingGroupOf(meta.key)))
    const submit = () => (reindex ? setConfirmReindex(true) : save.mutate(changes))

    return (
        <div className="flex flex-col gap-6">
            {[...groups, ...(others.length ? [{ group: "outras", items: others }] : [])].map(({ group, items }) => (
                <Section key={group} title={SETTING_GROUP_LABELS[group as keyof typeof SETTING_GROUP_LABELS] ?? "Outras"} info={GROUP_HELP[group]}>
                    <div className={FORM_GRID}>
                        {items.map((meta) => (
                            <SettingField key={meta.key} meta={meta} value={draft[meta.key] ?? null} dirty={meta.key in changes} readOnlyNote={readOnlyNoteOf(meta.key)} onChange={(value) => setDraft((prev) => ({ ...prev, [meta.key]: value }))} />
                        ))}
                    </div>
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
                onOpenChange={setConfirmReindex}
                title="Trocar o embedding?"
                description="O Engramind valida o provedor na mesma requisição (com ele fora do ar, nada é gravado) e reindexa todas as memórias. Enquanto isso, a busca por sentido usa os vetores antigos."
                items={Object.keys(changes).filter((key) => REINDEX_SETTING_KEYS.includes(key))}
                confirmLabel="Salvar e reindexar"
                pending={save.isPending}
                onConfirm={() => save.mutate(changes, { onSettled: () => setConfirmReindex(false) })}
            />
        </div>
    )
}

export function SettingsSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true">
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

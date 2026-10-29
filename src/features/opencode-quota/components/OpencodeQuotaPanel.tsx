"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, Clock, Gauge, RefreshCw } from "lucide-react"
import { useNow } from "@/hooks/useNow"
import { usePersistentState } from "@/hooks/usePersistentState"
import { apiErrorMessage } from "@/lib/api"
import { OPENCODE_QUOTA_PANEL_KEY } from "../constants"
import { useOpencodeQuota, useOpencodeQuotaRealtime, useRefreshOpencodeQuota } from "../hooks/useOpencodeQuota"
import { isQuotaStale } from "../logic"
import { quotaPanelPrefsSchema, type QuotaPanelPrefs } from "../schemas"
import { QuotaCompactList } from "./QuotaCompactList"
import { QuotaPanelBody } from "./QuotaPanelBody"

const DEFAULT_PREFS: QuotaPanelPrefs = { collapsed: false, collapsedProviders: [] }

/**
 * Quota do OpenCode (plugin opencode-quota) na coluna Tarefas de /desenvolvimento. Expandido, todos
 * os provedores (cada um recolhível); recolhido, a primeira janela de cada provedor expandido.
 * Atualiza pelo tempo real.
 */
export function OpencodeQuotaPanel() {
    const query = useOpencodeQuota()
    useOpencodeQuotaRealtime()
    const refresh = useRefreshOpencodeQuota()
    const { value: prefs, setValue: setPrefs } = usePersistentState(OPENCODE_QUOTA_PANEL_KEY, quotaPanelPrefsSchema, DEFAULT_PREFS)
    const now = useNow(30_000)
    const reduceMotion = useReducedMotion()
    const data = query.data
    const collapsed = prefs.collapsed
    const compact = collapsed && data?.state === "ok" && data.providers.some((provider) => !prefs.collapsedProviders.includes(provider.id))
    const toggleProvider = (id: string) =>
        setPrefs((current) => ({
            ...current,
            collapsedProviders: current.collapsedProviders.includes(id) ? current.collapsedProviders.filter((item) => item !== id) : [...current.collapsedProviders, id],
        }))
    const stale = data?.state === "ok" && isQuotaStale(data.exportedAt, now)
    const busy = refresh.isPending || query.isFetching
    const bodyId = "opencode-quota-body"
    const toggleCollapsed = () => setPrefs((current) => ({ ...current, collapsed: !current.collapsed }))

    return (
        <section aria-label="Quota do OpenCode" className="rounded-md border bg-muted/20 px-2.5 py-2">
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={toggleCollapsed}
                    aria-expanded={!collapsed}
                    aria-controls={bodyId}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Gauge className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="shrink-0">Quota do OpenCode</span>
                </button>
                {stale && (
                    <span className="flex shrink-0 items-center gap-0.5 rounded-sm bg-warning/15 px-1 text-[10px] text-warning" title="O opencode-quota não consulta nenhum provedor há mais de 30 min. Confira se o OpenCode está rodando com o plugin atualizado.">
                        <Clock className="h-2.5 w-2.5" aria-hidden />
                        Desatualizado
                    </span>
                )}
                <button
                    type="button"
                    onClick={() => refresh.mutate()}
                    disabled={refresh.isPending}
                    aria-label="Atualizar quota do OpenCode"
                    title="Atualizar"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                >
                    <motion.span animate={busy && !reduceMotion ? { rotate: 360 } : { rotate: 0 }} transition={busy ? { duration: 0.8, repeat: Infinity, ease: "linear" } : { duration: 0 }} className="flex">
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    </motion.span>
                </button>
                <button
                    type="button"
                    onClick={toggleCollapsed}
                    aria-expanded={!collapsed}
                    aria-controls={bodyId}
                    aria-label={collapsed ? "Expandir quota" : "Recolher quota"}
                    title={collapsed ? "Expandir quota" : "Recolher quota"}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <motion.span animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className="flex" aria-hidden>
                        <ChevronDown className="h-3.5 w-3.5" />
                    </motion.span>
                </button>
            </div>
            <AnimatePresence initial={false} mode="wait">
                {!collapsed ? (
                    <motion.div
                        id={bodyId}
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <div className="pt-2">
                            <QuotaPanelBody
                                data={data}
                                isLoading={query.isLoading}
                                error={query.isError ? apiErrorMessage(query.error, "Tente novamente.") : null}
                                now={now}
                                onRetry={() => refresh.mutate()}
                                collapsedProviders={prefs.collapsedProviders}
                                onToggleProvider={toggleProvider}
                            />
                        </div>
                    </motion.div>
                ) : (
                    compact && (
                        <motion.div
                            id={bodyId}
                            key="compact"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
                            className="overflow-hidden"
                        >
                            <div className="pt-2">
                                <QuotaCompactList providers={data?.providers ?? []} collapsedProviders={prefs.collapsedProviders} now={now} />
                            </div>
                        </motion.div>
                    )
                )}
            </AnimatePresence>
        </section>
    )
}

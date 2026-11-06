"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, Gauge } from "lucide-react"
import { RefreshIconButton } from "@/components/metrics/RefreshIconButton"
import { StaleBadge } from "@/components/metrics/StaleBadge"
import { useNow } from "@/hooks/useNow"
import { apiErrorMessage } from "@/lib/api"
import { useOpencodeQuota, useOpencodeQuotaRealtime, useRefreshOpencodeQuota } from "../hooks/useOpencodeQuota"
import { isQuotaStale } from "../logic"
import { useQuotaPanelPrefs } from "../hooks/useQuotaPanelPrefs"
import { QuotaCompactList } from "./QuotaCompactList"
import { QuotaPanelBody } from "./QuotaPanelBody"

/**
 * Quota do OpenCode (plugin opencode-quota) na coluna Tarefas de /desenvolvimento e no painel
 * "Servidor e quota" da barra lateral (mesma query, preferência e evento). Expandido, todos
 * os provedores (cada um recolhível); recolhido, a primeira janela de cada provedor expandido.
 * Atualiza pelo tempo real.
 */
export function OpencodeQuotaPanel() {
    const query = useOpencodeQuota()
    useOpencodeQuotaRealtime()
    const refresh = useRefreshOpencodeQuota()
    const { value: prefs, setValue: setPrefs } = useQuotaPanelPrefs()
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
                {stale && <StaleBadge title="O opencode-quota não consulta nenhum provedor há mais de 30 min. Confira se o OpenCode está rodando com o plugin atualizado." />}
                <RefreshIconButton onClick={() => refresh.mutate()} disabled={refresh.isPending} busy={busy} ariaLabel="Atualizar quota do OpenCode" />
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

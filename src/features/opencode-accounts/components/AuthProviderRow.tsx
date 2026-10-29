"use client"

import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, ChevronRight, Plus, Terminal } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { OpencodeAuthProviderDto } from "../types"
import { AccountItem } from "./AccountItem"

interface AuthProviderRowProps {
    row: OpencodeAuthProviderDto
    expanded: boolean
    onToggle: () => void
    onAdd: () => void
}

/** Linha de um provider: conta em uso no resumo; expandida, as contas e o botão Adicionar conta. */
export function AuthProviderRow({ row, expanded, onToggle, onAdd }: AuthProviderRowProps) {
    const active = row.accounts.find((account) => account.active)
    const attention = row.accounts.some((account) => account.needsAuth) || row.envConnections.some((connection) => connection.needsAuth)
    const panelId = `opencode-provider-${row.id}`

    return (
        <div role="listitem">
            <button type="button" className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/40" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
                <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.18 }} className="inline-flex shrink-0 text-muted-foreground">
                    <ChevronRight className="h-4 w-4" aria-hidden />
                </motion.span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{row.name}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{row.id}</span>
                </span>
                {attention && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label="Precisa autenticar de novo" />}
                {active ? (
                    <Badge variant="secondary" className="max-w-[45%] truncate font-normal" title={`Conta em uso: ${active.label}`}>
                        {active.label}
                    </Badge>
                ) : row.envConnections.length > 0 ? (
                    <Badge variant="outline" className="font-normal">
                        Variável de ambiente
                    </Badge>
                ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">{row.connected ? "Nenhuma conta selecionada" : "Não conectado"}</span>
                )}
            </button>
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div id={panelId} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="overflow-hidden">
                        <div className="space-y-3 border-t bg-muted/20 px-3 py-3">
                            {row.providers.length > 0 && <p className="text-xs text-muted-foreground">Usado por: {row.providers.join(", ")}</p>}
                            {row.accounts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Nenhuma conta salva neste provider.</p>
                            ) : (
                                <ul className="space-y-2" aria-label={`Contas de ${row.name}`}>
                                    <AnimatePresence initial={false}>
                                        {row.accounts.map((account) => (
                                            <AccountItem key={account.id} integrationId={row.id} account={account} />
                                        ))}
                                    </AnimatePresence>
                                </ul>
                            )}
                            {row.envConnections.map((connection) => (
                                <p key={connection.name} className={cn("flex items-center gap-2 text-xs", connection.needsAuth ? "text-destructive" : "text-muted-foreground")}>
                                    <Terminal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    Via variável de ambiente <code className="font-mono">{connection.name}</code> na máquina do OpenCode
                                    {connection.needsAuth ? ` — ${connection.needsAuth}` : ""}
                                </p>
                            ))}
                            {row.methods.length > 0 ? (
                                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onAdd}>
                                    <Plus className="h-4 w-4" aria-hidden />
                                    Adicionar conta
                                </Button>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {row.envNames.length > 0 ? `Este provider só se conecta por variável de ambiente (${row.envNames.join(", ")}).` : "O OpenCode não oferece login para este provider."}
                                </p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

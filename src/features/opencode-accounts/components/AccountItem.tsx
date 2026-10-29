"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, Check, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OPENCODE_METHOD_KIND_LABELS } from "../constants"
import { useActivateOpencodeAccount } from "../hooks/useOpencodeAccounts"
import type { OpencodeAccountDto } from "../types"
import { RemoveAccountDialog } from "./RemoveAccountDialog"
import { RenameAccountForm } from "./RenameAccountForm"

/** Uma conta do provider: em uso, selecionar, renomear (inline) e remover (com confirmação). */
export function AccountItem({ integrationId, account }: { integrationId: string; account: OpencodeAccountDto }) {
    const activate = useActivateOpencodeAccount()
    const [renaming, setRenaming] = useState(false)
    const [removing, setRemoving] = useState(false)

    return (
        <motion.li layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="rounded-md border bg-background px-3 py-2">
            {renaming ? (
                <RenameAccountForm account={account} onDone={() => setRenaming(false)} />
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{account.label}</span>
                        <span className="block text-[11px] text-muted-foreground">{OPENCODE_METHOD_KIND_LABELS[account.method]}</span>
                    </span>
                    {account.active ? (
                        <motion.span key="active" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.18 }}>
                            <Badge className="gap-1">
                                <Check className="h-3 w-3" aria-hidden />
                                Em uso
                            </Badge>
                        </motion.span>
                    ) : (
                        <Button type="button" size="sm" variant="secondary" disabled={activate.isPending} onClick={() => activate.mutate({ integrationId, accountId: account.id })}>
                            Usar esta conta
                        </Button>
                    )}
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Renomear ${account.label}`} title="Renomear" onClick={() => setRenaming(true)}>
                        <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Remover ${account.label}`} title="Remover" onClick={() => setRemoving(true)}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                </div>
            )}
            {account.needsAuth && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {account.needsAuth}
                </p>
            )}
            <RemoveAccountDialog account={account} open={removing} onOpenChange={setRemoving} />
        </motion.li>
    )
}

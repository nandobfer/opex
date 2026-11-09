"use client"

import { useState } from "react"
import { AlertTriangle } from "lucide-react"
import { ActiveItemRow } from "@/components/list/ActiveItemRow"
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
        <ActiveItemRow
            label={account.label}
            sublabel={OPENCODE_METHOD_KIND_LABELS[account.method]}
            active={account.active}
            activateLabel="Usar esta conta"
            activateDisabled={activate.isPending}
            onActivate={() => activate.mutate({ integrationId, accountId: account.id })}
            onRename={() => setRenaming(true)}
            onRemove={() => setRemoving(true)}
            editing={renaming ? <RenameAccountForm account={account} onDone={() => setRenaming(false)} /> : null}
        >
            {account.needsAuth && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {account.needsAuth}
                </p>
            )}
            <RemoveAccountDialog account={account} open={removing} onOpenChange={setRemoving} />
        </ActiveItemRow>
    )
}

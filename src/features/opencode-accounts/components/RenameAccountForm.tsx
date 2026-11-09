"use client"

import { InlineRenameField } from "@/components/list/InlineRenameField"
import { useRenameOpencodeAccount } from "../hooks/useOpencodeAccounts"
import { renameAccountSchema, type OpencodeAccountDto } from "../types"

/** Renomear a conta em linha (Enter salva, Esc cancela). */
export function RenameAccountForm({ account, onDone }: { account: OpencodeAccountDto; onDone: () => void }) {
    const rename = useRenameOpencodeAccount()
    return (
        <InlineRenameField
            defaultValue={account.label}
            label="Nome da conta"
            schema={renameAccountSchema.shape.label}
            pending={rename.isPending}
            onSave={(label) => rename.mutateAsync({ accountId: account.id, label }).then(() => true, () => false)}
            onCancel={onDone}
        />
    )
}

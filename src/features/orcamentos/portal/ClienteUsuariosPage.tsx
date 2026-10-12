"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import type { ClienteUserInput } from "../schemas"
import type { ClienteUserDto } from "../types"
import { ClienteUserDialog } from "../components/users/ClienteUserDialog"
import { ClienteUserList } from "../components/users/ClienteUserList"
import { ClientTokenDialog } from "../components/clients/ClientTokenDialog"
import { useClienteUsers, useCreateClienteUser, useDeleteClienteUser, useRegenerateClienteUserToken, useUpdateClienteUser } from "./hooks"

/** Aba Usuários do portal (admin do cliente): CRUD dos usuários deste cliente. */
export function ClienteUsuariosPage() {
    const query = useClienteUsers()
    const create = useCreateClienteUser()
    const update = useUpdateClienteUser()
    const remove = useDeleteClienteUser()
    const regenerate = useRegenerateClienteUserToken()
    const [editing, setEditing] = useState<{ user: ClienteUserDto | null } | null>(null)
    const [removing, setRemoving] = useState<ClienteUserDto | null>(null)
    const [confirmRegen, setConfirmRegen] = useState<ClienteUserDto | null>(null)
    const [token, setToken] = useState<{ value: string; name: string } | null>(null)

    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-5">
            <header>
                <h1 className="text-lg font-semibold md:text-2xl">Usuários</h1>
                <p className="text-sm text-muted-foreground">Gerencie quem acessa o portal deste cliente.</p>
            </header>

            <ClienteUserList
                users={query.data ?? []}
                isOwner={false}
                loading={query.isLoading}
                error={query.error}
                onRetry={() => void query.refetch()}
                pending={remove.isPending || regenerate.isPending}
                onNew={() => setEditing({ user: null })}
                onEdit={(user) => setEditing({ user })}
                onDelete={setRemoving}
                onRegenerate={setConfirmRegen}
            />

            <ClienteUserDialog
                open={editing !== null}
                user={editing?.user ?? null}
                isDefault={editing?.user?.isDefault ?? false}
                submitting={create.isPending || update.isPending}
                onClose={() => setEditing(null)}
                onSubmit={async (values: ClienteUserInput) => {
                    try {
                        if (editing?.user) {
                            await update.mutateAsync({ id: editing.user.id, input: values })
                        } else {
                            const created = await create.mutateAsync(values)
                            if (created.token) setToken({ value: created.token, name: created.item.username })
                        }
                        return true
                    } catch {
                        return false
                    }
                }}
            />

            <ClientTokenDialog token={token?.value ?? null} clientName={token?.name ?? ""} onClose={() => setToken(null)} />

            <AlertDialog open={confirmRegen !== null} onOpenChange={(next) => !next && setConfirmRegen(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Gerar um novo token para {confirmRegen?.username}?</AlertDialogTitle>
                        <AlertDialogDescription>O token atual deixa de funcionar imediatamente. A URL anterior deixa de autenticar.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                const target = confirmRegen
                                setConfirmRegen(null)
                                if (!target) return
                                const created = await regenerate.mutateAsync(target.id).catch(() => null)
                                if (created?.token) setToken({ value: created.token, name: created.item.username })
                            }}
                        >
                            Gerar novo token
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover {removing?.username} do cliente?</AlertDialogTitle>
                        <AlertDialogDescription>O usuário perde o acesso a este cliente. Se ele não estiver em nenhum outro cliente, a conta é excluída.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={async () => {
                                const target = removing
                                setRemoving(null)
                                if (target) await remove.mutateAsync(target).catch(() => null)
                            }}
                        >
                            Remover
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.section>
    )
}

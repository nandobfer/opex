"use client"

import { AnimatePresence, motion } from "framer-motion"
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { CopyPortalUrlButton } from "../clients/CopyPortalUrlButton"
import type { ClienteUserDto } from "../../types"

interface ClienteUserListProps {
    users: readonly ClienteUserDto[]
    /** `true` na gestão do **dono** (gerencia até usuários compartilhados). */
    isOwner: boolean
    loading?: boolean
    error?: unknown
    onRetry?: () => void
    pending?: boolean
    onNew: () => void
    onEdit: (user: ClienteUserDto) => void
    onDelete: (user: ClienteUserDto) => void
    onRegenerate: (user: ClienteUserDto) => void
    title?: string
    description?: string
}

/** Gestão (`null` = sem restrição). */
function canManage(user: ClienteUserDto, isOwner: boolean): boolean {
    return isOwner || user.memberships.length <= 1
}

/**
 * Lista de usuários do cliente (compartilhada pela gestão do dono e pela aba Usuários do portal):
 * cada card tem **Copiar URL**, editar, token e excluir, respeitando as regras de permissão
 * (usuário padrão não é excluído e o compartilhado só o dono altera).
 */
export function ClienteUserList({ users, isOwner, loading = false, error, onRetry, pending = false, onNew, onEdit, onDelete, onRegenerate, title = "Usuários", description }: ClienteUserListProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription>{description ?? "Cada usuário entra com username/email e senha, ou pela própria URL."}</CardDescription>
                </div>
                <Button type="button" size="sm" className="gap-1.5" onClick={onNew}>
                    <Plus className="h-4 w-4" aria-hidden /> Novo usuário
                </Button>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                ) : error ? (
                    <ErrorState title="Não foi possível carregar os usuários" description={apiErrorMessage(error, "Tente novamente.")} onRetry={onRetry} />
                ) : users.length === 0 ? (
                    <EmptyState icon={UserRound} title="Nenhum usuário" description="Crie um usuário para dar acesso ao portal." actionLabel="Novo usuário" onAction={onNew} />
                ) : (
                    <ul className="space-y-2">
                        <AnimatePresence initial={false}>
                            {users.map((user) => (
                                <motion.li key={user.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                                    <ClienteUserRow user={user} isOwner={isOwner} pending={pending} onEdit={onEdit} onDelete={onDelete} onRegenerate={onRegenerate} />
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}

function ClienteUserRow({ user, isOwner, pending, onEdit, onDelete, onRegenerate }: { user: ClienteUserDto; isOwner: boolean; pending: boolean; onEdit: (user: ClienteUserDto) => void; onDelete: (user: ClienteUserDto) => void; onRegenerate: (user: ClienteUserDto) => void }) {
    const manage = canManage(user, isOwner)
    const canDelete = manage && !user.isDefault
    const canRegenerate = manage && !user.isDefault
    const shared = user.memberships.length > 1
    const reason = !manage ? "Usuário compartilhado com outros clientes: só o dono do Opex pode alterá-lo." : user.isDefault ? "Usuário padrão do cliente: o link é o do cliente." : undefined

    return (
        <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{user.username}</span>
                    {user.isDefault && <span className="rounded-full border px-1.5 text-[10px] uppercase text-muted-foreground">padrão</span>}
                    {user.admin && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase text-primary">
                            <ShieldCheck className="h-3 w-3" aria-hidden /> admin
                        </span>
                    )}
                    {!user.active && <span className="rounded-full border px-1.5 text-[10px] uppercase text-muted-foreground">inativo</span>}
                </div>
                <p className="text-xs text-muted-foreground">{user.email ?? "Sem email (entra só por URL)"}</p>
                {shared && <p className="text-xs text-muted-foreground">Clientes: {user.memberships.map((membership) => membership.clientName ?? membership.clientId).join(", ")}</p>}
                {reason && <p className="text-xs text-warning">{reason}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1">
                {user.portalPath && <CopyPortalUrlButton portalPath={user.portalPath} portalName={user.username} />}
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => onEdit(user)} disabled={!manage || pending}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => onRegenerate(user)} disabled={!canRegenerate || pending} title={reason}>
                    <KeyRound className="h-3.5 w-3.5" aria-hidden /> Token
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => onDelete(user)} disabled={!canDelete || pending} title={reason}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Excluir
                </Button>
            </div>
        </div>
    )
}

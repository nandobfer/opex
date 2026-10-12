"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { clienteUserSchema, type ClienteUserInput } from "../../schemas"
import type { ClienteUserDto } from "../../types"

interface ClienteUserDialogProps {
    open: boolean
    /** Usuário em edição; `null` = novo. */
    user: ClienteUserDto | null
    submitting: boolean
    /** `true` quando o usuário é o **padrão** do cliente (usa o token do cliente). */
    isDefault?: boolean
    onSubmit: (values: ClienteUserInput) => Promise<boolean>
    onClose: () => void
}

const EMPTY: ClienteUserInput = { username: "", email: "", password: "", admin: false }

/**
 * Cadastro de um usuário de cliente: **username**, **email** (opcional), **senha** (opcional) e a
 * flag **administrador** (por vínculo). Sem regra mínima de senha e sem "esqueci a senha" — o
 * admin/dono redefine. Na edição, senha vazia = manter a atual.
 */
export function ClienteUserDialog({ open, user, submitting, isDefault = false, onSubmit, onClose }: ClienteUserDialogProps) {
    const form = useForm<ClienteUserInput>({ resolver: zodResolver(clienteUserSchema), mode: "onChange", defaultValues: EMPTY })
    const errors = form.formState.errors

    useEffect(() => {
        if (!open) return
        form.reset(user ? { username: user.username, email: user.email ?? "", password: "", admin: user.admin } : EMPTY)
    }, [open, user, form])

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !submitting && onClose()}>
            <DialogContent className="sm:max-w-xl">
                <form
                    className="space-y-5"
                    onSubmit={(event) => {
                        event.stopPropagation()
                        void form.handleSubmit(async (values) => {
                            if (await onSubmit(values)) onClose()
                        })(event)
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{user ? "Editar usuário" : "Novo usuário"}</DialogTitle>
                        <DialogDescription>
                            {isDefault
                                ? "Usuário padrão do cliente: entra pelo link do cliente. Defina email e senha para permitir também o login por usuário/email."
                                : "O usuário entra com username ou email e senha, ou pela URL copiada."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className={FORM_GRID}>
                        <Field id="user-username" label="Nome de usuário" error={errors.username?.message}>
                            <Input id="user-username" autoComplete="off" disabled={submitting} {...form.register("username")} />
                        </Field>
                        <Field id="user-email" label="Email (opcional)" error={errors.email?.message}>
                            <Input id="user-email" type="email" autoComplete="off" disabled={submitting} {...form.register("email")} />
                        </Field>
                        <Field id="user-password" label={user ? "Senha (deixe vazio para manter)" : "Senha (opcional)"} error={errors.password?.message}>
                            <Input id="user-password" type="password" autoComplete="new-password" disabled={submitting} {...form.register("password")} />
                        </Field>
                        <FormToggleCard name="admin" control={form.control} label="Administrador" description="Vê Financeiro e Usuários no portal deste cliente." disabled={submitting} />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={submitting || !form.formState.isValid}>
                            {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            Salvar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { apiErrorMessage } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { HOME_HREF } from "@/features/layout/navigation"
import { loginSchema, type LoginInput } from "../schemas"
import { useLogin } from "../hooks/useLogin"

/** Só aceita destino relativo do app (sem esquema nem `//`), evitando open redirect. */
function safeNext(value: string | undefined): string | null {
    if (!value) return null
    if (!value.startsWith("/") || value.startsWith("//")) return null
    return value
}

export function LoginForm({ nextPath }: { nextPath?: string }) {
    const router = useRouter()
    const login = useLogin()
    const [revealed, setRevealed] = useState(false)
    const form = useForm<LoginInput>({
        resolver: zodResolver(loginSchema),
        defaultValues: { password: "" },
        mode: "onTouched",
    })
    const passwordError = form.formState.errors.password?.message

    const onSubmit = form.handleSubmit((values) => {
        login.mutate(values, {
            onSuccess: () => {
                router.replace(safeNext(nextPath) ?? HOME_HREF)
            },
            onError: (error) => {
                const message = apiErrorMessage(error, "Não foi possível entrar. Tente novamente.")
                form.setError("password", { message })
                toast.error(message)
            },
        })
    })

    return (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field id="login-password" label="Senha" error={passwordError}>
                <div className="relative">
                    <Input
                        id="login-password"
                        type={revealed ? "text" : "password"}
                        autoComplete="current-password"
                        autoFocus
                        disabled={login.isPending}
                        aria-invalid={passwordError ? true : undefined}
                        className="pr-10"
                        {...form.register("password")}
                    />
                    <button
                        type="button"
                        onClick={() => setRevealed((value) => !value)}
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
                        title={revealed ? "Ocultar senha" : "Mostrar senha"}
                    >
                        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </Field>
            <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Entrando…
                    </>
                ) : (
                    "Entrar"
                )}
            </Button>
        </form>
    )
}

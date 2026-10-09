"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, MailCheck, RotateCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { shakeOnError } from "@/components/motion/presets"
import { apiErrorMessage } from "@/lib/api"
import { formatCountdown, useNow } from "@/hooks/useNow"
import type { GoSipalPendingLoginDto } from "../session/types"

interface GoSipalCodeFormProps {
    pending: GoSipalPendingLoginDto
    verifying: boolean
    resending: boolean
    cancelling: boolean
    onVerify: (code: string) => Promise<unknown>
    onResend: () => void
    onCancel: () => void
}

/**
 * Etapa "aguardando código": campo de 6 dígitos (aceita colar; confirma sozinho ao completar),
 * contagem dos 15 min do código e da espera para reenviar.
 */
export function GoSipalCodeForm({ pending, verifying, resending, cancelling, onVerify, onResend, onCancel }: GoSipalCodeFormProps) {
    const now = useNow(1000)
    const [code, setCode] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [shake, setShake] = useState(0)

    const expiresIn = new Date(pending.codeExpiresAt).getTime() - now
    const resendIn = new Date(pending.resendAvailableAt).getTime() - now
    const expired = pending.expired || expiresIn <= 0

    const submit = async (value: string) => {
        if (!/^\d{6}$/.test(value) || verifying || expired) return
        setError(null)
        try {
            await onVerify(value)
        } catch (err) {
            setError(apiErrorMessage(err, "Não foi possível confirmar o código"))
            setShake((n) => n + 1)
            setCode("")
        }
    }

    const onChange = (raw: string) => {
        const digits = raw.replace(/\D/g, "").slice(0, 6)
        setCode(digits)
        setError(null)
        if (digits.length === 6) void submit(digits)
    }

    return (
        <form
            className="space-y-4"
            onSubmit={(event) => {
                event.preventDefault()
                void submit(code)
            }}
        >
            <p className="flex items-start gap-2 text-sm">
                <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>
                    Enviamos um código de 6 dígitos para <strong>{pending.email}</strong>.{" "}
                    {expired ? (
                        <span className="text-destructive">O código expirou: peça outro.</span>
                    ) : (
                        <span className="text-muted-foreground">Ele vale por mais {formatCountdown(expiresIn)}.</span>
                    )}
                </span>
            </p>

            <div className="space-y-1.5">
                <Label htmlFor="go-sipal-code" className="text-xs font-semibold">
                    Código de acesso
                </Label>
                <motion.div key={shake} animate={shake ? shakeOnError : undefined}>
                    <Input
                        id="go-sipal-code"
                        value={code}
                        onChange={(event) => onChange(event.target.value)}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        disabled={verifying || expired}
                        placeholder="000000"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? "go-sipal-code-error" : undefined}
                        className="h-12 text-center font-mono text-2xl tracking-[0.6em]"
                    />
                </motion.div>
                <AnimatePresence>
                    {error && (
                        <motion.p
                            id="go-sipal-code-error"
                            role="alert"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-xs text-destructive"
                        >
                            {error}
                        </motion.p>
                    )}
                </AnimatePresence>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={cancelling || verifying}>
                    <X className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Cancelar
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={onResend} disabled={resending || verifying || resendIn > 0}>
                    <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    {resendIn > 0 ? `Reenviar em ${formatCountdown(resendIn)}` : "Reenviar código"}
                </Button>
                <Button type="submit" size="sm" disabled={verifying || expired || code.length !== 6}>
                    {verifying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                    Confirmar
                </Button>
            </div>
        </form>
    )
}

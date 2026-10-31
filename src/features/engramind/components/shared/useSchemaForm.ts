"use client"

import { useMemo, useState } from "react"
import type { ZodType } from "zod"

/**
 * Formulário pequeno validado pelo MESMO schema Zod da rota e do agente (`operations.ts`), em tempo
 * real: `toPayload` monta o corpo a partir dos campos e o schema dá os erros por campo.
 */
export function useSchemaForm<V extends Record<string, unknown>, P>(schema: ZodType<P>, initial: V, toPayload: (values: V) => unknown) {
    const [values, setValues] = useState<V>(initial)
    const [touched, setTouched] = useState(false)
    const parsed = useMemo(() => schema.safeParse(toPayload(values)), [schema, toPayload, values])
    const errors = useMemo(() => {
        const out: Record<string, string> = {}
        if (!parsed.success) for (const issue of parsed.error.issues) out[String(issue.path[0] ?? "_")] ??= issue.message
        return out
    }, [parsed])
    const set = <K extends keyof V>(key: K, value: V[K]) => {
        setTouched(true)
        setValues((prev) => ({ ...prev, [key]: value }))
    }
    return {
        values,
        set,
        reset: (next: V) => {
            setValues(next)
            setTouched(false)
        },
        touched,
        valid: parsed.success,
        payload: parsed.success ? parsed.data : null,
        /** Erro do campo (só depois da primeira edição). */
        error: (key: string) => (touched ? errors[key] : undefined),
    }
}

/** Texto vazio vira `null` (limpa) ou `undefined` (não muda). */
export const emptyTo = <T extends null | undefined>(value: string, empty: T): string | T => (value.trim() === "" ? empty : value.trim())

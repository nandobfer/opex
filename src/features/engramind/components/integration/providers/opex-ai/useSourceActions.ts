"use client"

import { useState } from "react"
import { toast } from "sonner"
import { apiErrorMessage } from "@/lib/api"
import type { AiSourceSection } from "../../../../ai-source"
import { useApplyOpexAiSource, useResendOpexAiKey, useTestOpexAiSource } from "../../../../hooks/useOpexAiSource"
import type { ApplyAiSourceInput, TestAiSourceInput } from "../../../../schemas/ai-source"
import type { TestOutcome } from "./TestResult"

/** Testar, aplicar e reenviar a chave de uma seção, com os toasts e o resultado do teste. */
export function useSourceActions(section: AiSourceSection) {
    const apply = useApplyOpexAiSource()
    const test = useTestOpexAiSource()
    const resend = useResendOpexAiKey()
    const [outcome, setOutcome] = useState<TestOutcome>(null)
    return {
        outcome,
        clearOutcome: () => setOutcome(null),
        testing: test.isPending,
        applying: apply.isPending,
        resending: resend.isPending,
        runTest: async (source: TestAiSourceInput["source"]) => {
            setOutcome(null)
            try {
                const result = await test.mutateAsync({ section, source } as TestAiSourceInput)
                setOutcome({ ok: true, result: result ?? {} })
            } catch (error) {
                setOutcome({ ok: false, message: apiErrorMessage(error, "O teste falhou") })
            }
        },
        runApply: async (source: ApplyAiSourceInput["source"]) => {
            try {
                const result = await apply.mutateAsync({ section, source } as ApplyAiSourceInput)
                if (result.keySynced) toast.success(section === "redator" ? "Redator configurado com a IA do Opex" : "Embedding configurado com a IA do Opex")
                else toast.warning("Configuração gravada, mas a chave não foi copiada: use Reenviar a chave")
                return true
            } catch (error) {
                toast.error(apiErrorMessage(error, "Não foi possível aplicar no Engramind"))
                return false
            }
        },
        resend: () => resend.mutate(section),
    }
}

"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, type FieldErrors } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useReducedMotion } from "framer-motion"
import { scrollToSection } from "@/components/form-page/FormSectionNav"
import { ENVIRONMENTS_PATH } from "../constants"
import { firstErrorSection, sectionAnchor } from "../editor-sections"
import { environmentCreateSchema, environmentInputSchema, type EnvironmentInput } from "../schemas"
import type { EnvironmentDto } from "../types"
import { formValuesOf } from "../view"
import { useEnvironmentEnvValues, useSaveEnvironment } from "./useEnvironments"
import type { EnvValuesStatus } from "../components/EnvVarsField"

const DEFAULTS = { centralId: "", projectName: "" }
const createResolver = zodResolver(environmentCreateSchema)
const editResolver = zodResolver(environmentInputSchema)

/**
 * Estado da página Novo/Editar ambiente (OPE-211): o formulário (montado uma vez por ambiente; o tempo real
 * não reseta o que está sendo editado), os valores das variáveis lidos à parte, o aviso de alteração feita em
 * outro lugar, o salvar (Novo volta para a lista; Editar fica na página com o aviso "Salvo") e o salto até a
 * primeira seção com erro.
 */
export function useEnvironmentEditor(env: EnvironmentDto | null) {
    const router = useRouter()
    const reduced = useReducedMotion()
    const save = useSaveEnvironment(env?.id ?? null)
    const form = useForm<EnvironmentInput>({ resolver: env ? editResolver : createResolver, mode: "onChange", defaultValues: formValuesOf(env, DEFAULTS) })

    // Variáveis extras: lidas à parte enquanto a página está aberta e aplicadas uma vez (sem apagar o que já foi digitado).
    const envValues = useEnvironmentEnvValues(env?.id ?? null, true)
    const applied = useRef(false)
    const fresh = envValues.data && !envValues.isFetching ? envValues.data : null
    useEffect(() => {
        if (!env || !fresh || applied.current) return
        applied.current = true
        if (form.getFieldState("env").isDirty) return
        // Os valores entram como o salvo (sem marcar alteração) e o que já foi digitado em outros campos fica.
        form.reset({ ...(form.formState.defaultValues as EnvironmentInput), env: formValuesOf(env, DEFAULTS, fresh).env }, { keepDirtyValues: true })
    }, [env, fresh, form])
    const envStatus: EnvValuesStatus = !env ? "ready" : envValues.isError && !envValues.isFetching ? "error" : fresh ? "ready" : "loading"

    // Alteração feita em outro lugar (outra aba, o Agente Opex) enquanto a página está aberta.
    const [loadedAt, setLoadedAt] = useState(env?.updatedAt ?? null)
    // Só uma versão MAIS NOVA que a carregada conta (a lista pode chegar atrasada logo depois do próprio salvar).
    const changedElsewhere = Boolean(env && loadedAt && env.updatedAt > loadedAt)
    const reload = () => {
        if (!env) return
        applied.current = false
        setLoadedAt(env.updatedAt)
        form.reset(formValuesOf(env, DEFAULTS))
        void envValues.refetch()
    }
    const keepEditing = () => env && setLoadedAt(env.updatedAt)

    const [savedAt, setSavedAt] = useState<number | null>(null)
    const onInvalid = (errors: FieldErrors<EnvironmentInput>) => {
        const section = firstErrorSection(errors)
        if (section) scrollToSection(sectionAnchor(section), { smooth: !reduced, focusInvalid: true })
    }
    const submit = form.handleSubmit(
        (values) =>
            save.mutate(values, {
                onSuccess: (saved) => {
                    if (!env) {
                        form.reset(values)
                        router.push(ENVIRONMENTS_PATH)
                        return
                    }
                    setLoadedAt(saved.updatedAt)
                    form.reset(values)
                    setSavedAt(Date.now())
                },
            }),
        onInvalid,
    )

    return { form, save, submit, envValues, envStatus, changedElsewhere, reload, keepEditing, savedAt, dismissSaved: () => setSavedAt(null) }
}

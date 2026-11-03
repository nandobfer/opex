"use client"

import { useEffect, useImperativeHandle, type Ref } from "react"
import type { FieldValues, UseFormReturn } from "react-hook-form"

/**
 * Seção de uma feature de IA dentro de uma aba com várias features (ex.: Orçamentista = Orçamentos +
 * Estimar prazos). Cada seção mantém o próprio formulário e a própria configuração; a aba tem **um
 * rodapé único** que chama `save()` só nas seções alteradas e `undo()` em todas.
 */
export interface FeatureSectionHandle {
    /** Valida e grava a configuração da seção. `true` quando gravou (ou não havia o que gravar). */
    save: () => Promise<boolean>
    undo: () => void
}

export interface FeatureSectionState {
    dirty: boolean
    /** Há o que gravar: alterada ou ainda sem configuração salva (valores iniciais do código). */
    savable: boolean
    pending: boolean
}

export interface FeatureSectionProps {
    ref?: Ref<FeatureSectionHandle>
    onStateChange: (state: FeatureSectionState) => void
}

/** Liga o formulário da seção ao rodapé único da aba (estado e ações imperativas). */
export function useFeatureSection<T extends FieldValues>(
    ref: Ref<FeatureSectionHandle> | undefined,
    {
        form,
        data,
        save,
        pending,
        onStateChange,
    }: {
        form: UseFormReturn<T>
        data: { settings: T; isDefault: boolean } | undefined
        save: (values: T) => Promise<{ settings: T } | null>
        pending: boolean
        onStateChange: (state: FeatureSectionState) => void
    },
): void {
    const dirty = form.formState.isDirty
    const savable = Boolean(data) && (dirty || data?.isDefault === true)

    useEffect(() => {
        onStateChange({ dirty, savable, pending })
    }, [dirty, savable, pending, onStateChange])
    useEffect(() => () => onStateChange({ dirty: false, savable: false, pending: false }), [onStateChange])

    useImperativeHandle(
        ref,
        () => ({
            save: async () => {
                if (!savable) return true
                let ok = false
                await form.handleSubmit(async (values) => {
                    const saved = await save(values).catch(() => null)
                    if (saved) {
                        form.reset(saved.settings)
                        ok = true
                    }
                })()
                return ok
            },
            undo: () => {
                if (data) form.reset(data.settings)
            },
        }),
        [data, form, save, savable],
    )
}

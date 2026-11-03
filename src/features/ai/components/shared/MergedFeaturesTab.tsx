"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Loader2, Save, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { SECTION_PARAM } from "@/features/integrations/components/tabs/useIntegrationTab"
import type { FeatureSectionHandle, FeatureSectionProps, FeatureSectionState } from "./feature-section"

export interface MergedFeatureSection {
    /** Id da feature (âncora da seção e destino dos links antigos). */
    id: string
    title: string
    render: (props: FeatureSectionProps) => ReactNode
}

const IDLE: FeatureSectionState = { dirty: false, savable: false, pending: false }

/** Âncora de uma seção (links antigos de abas fundidas rolam até ela). */
export const mergedSectionAnchor = (id: string) => `ai-section-${id}`

/**
 * Aba de um agente que funde várias features de IA (OPE-122): uma seção por feature, cada uma com a
 * própria configuração, e **um rodapé único** — Salvar grava em sequência só as seções alteradas e
 * avisa qual falhou; Desfazer volta todas. A aba fica "suja" se qualquer seção estiver.
 */
export function MergedFeaturesTab({ sections, onDirtyChange }: { sections: readonly MergedFeatureSection[]; onDirtyChange: (dirty: boolean) => void }) {
    const handles = useRef(new Map<string, FeatureSectionHandle>())
    const [states, setStates] = useState<Record<string, FeatureSectionState>>({})
    const [saving, setSaving] = useState(false)

    const list = sections.map((section) => ({ section, state: states[section.id] ?? IDLE }))
    const dirty = list.some((item) => item.state.dirty)
    const savable = list.some((item) => item.state.savable)
    const pending = saving || list.some((item) => item.state.pending)

    useEffect(() => {
        onDirtyChange(dirty)
    }, [dirty, onDirtyChange])
    useEffect(() => () => onDirtyChange(false), [onDirtyChange])

    useEffect(() => {
        const target = new URLSearchParams(window.location.search).get(SECTION_PARAM)
        if (!target || !sections.some((section) => section.id === target)) return
        const timer = window.setTimeout(() => document.getElementById(mergedSectionAnchor(target))?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 120)
        return () => window.clearTimeout(timer)
    }, [sections])

    // Callbacks estáveis por seção (o ref e o estado de cada uma chegam por eles, nunca durante o render).
    const bindings = useMemo(
        () =>
            new Map(
                sections.map((section) => [
                    section.id,
                    {
                        ref: (handle: FeatureSectionHandle | null) => {
                            if (handle) handles.current.set(section.id, handle)
                            else handles.current.delete(section.id)
                        },
                        onStateChange: (state: FeatureSectionState) => setStates((current) => (sameState(current[section.id], state) ? current : { ...current, [section.id]: state })),
                    },
                ]),
            ),
        [sections],
    )

    const saveAll = async () => {
        setSaving(true)
        const failed: string[] = []
        const saved: string[] = []
        for (const { section, state } of list) {
            if (!state.savable) continue
            const ok = (await handles.current.get(section.id)?.save()) ?? false
            ;(ok ? saved : failed).push(section.title)
        }
        setSaving(false)
        if (failed.length) toast.error(`Não foi possível salvar: ${failed.join(", ")}${saved.length ? `. Salva: ${saved.join(", ")}` : ""}`)
    }
    const undoAll = () => handles.current.forEach((handle) => handle.undo())

    return (
        <>
            {sections.map((section) => (
                <section key={section.id} id={mergedSectionAnchor(section.id)} aria-label={section.title} className="flex scroll-mt-6 flex-col gap-6">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</h2>
                    {section.render(bindings.get(section.id)!)}
                </section>
            ))}
            <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || pending} onClick={undoAll}>
                    <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
                </Button>
                <Button type="button" data-ctrl-enter-submit className="gap-1.5" disabled={!savable || pending} onClick={() => void saveAll()}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                    Salvar
                </Button>
            </div>
        </>
    )
}

function sameState(a: FeatureSectionState | undefined, b: FeatureSectionState): boolean {
    return Boolean(a) && a!.dirty === b.dirty && a!.savable === b.savable && a!.pending === b.pending
}

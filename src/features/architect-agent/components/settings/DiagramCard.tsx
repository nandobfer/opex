"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field } from "@/components/ui/field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ARCHITECT_NODE_KIND_LABELS, ARCHITECT_NODE_KINDS, ARCHITECT_VIEW_LABELS, ARCHITECT_VIEWS, type ArchitectView } from "../../constants"
import type { ArchitectSettings } from "../../schemas"
import { asDepth, DepthControl } from "../workbench/DepthControl"

/** Seção "Diagrama": profundidade padrão, tipos de nó exibidos, arquivos, notas e visão padrão. */
export function DiagramCard({ form }: { form: UseFormReturn<ArchitectSettings> }) {
    const errors = form.formState.errors.diagram
    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Profundidade padrão</CardTitle>
                    <CardDescription>Vira a diretiva do prompt e o teto de nós validado no servidor. Na aba da mesa, o slider ajusta só aquele pedido.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Controller control={form.control} name="diagram.depth" render={({ field }) => <DepthControl id="architect-depth" value={asDepth(field.value)} onChange={field.onChange} />} />
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Exibição</CardTitle>
                    <CardDescription>Padrões da aba &quot;Arquitetura&quot; da mesa (o filtro da aba muda só a visualização atual).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <Field id="architect-view" label="Visão padrão">
                        <Controller
                            control={form.control}
                            name="diagram.defaultView"
                            render={({ field }) => <OptionTabs<ArchitectView> id="architect-view" options={ARCHITECT_VIEWS.map((value) => ({ value, label: ARCHITECT_VIEW_LABELS[value] }))} value={field.value} onChange={field.onChange} className="w-full" />}
                        />
                    </Field>
                    <Field id="architect-kinds" label="Tipos de nó exibidos" error={errors?.nodeKinds?.message}>
                        <Controller
                            control={form.control}
                            name="diagram.nodeKinds"
                            render={({ field }) => (
                                <ul className="grid gap-2 sm:grid-cols-3" aria-label="Tipos de nó exibidos">
                                    {ARCHITECT_NODE_KINDS.map((kind) => {
                                        const checkboxId = `architect-kind-${kind}`
                                        return (
                                            <li key={kind} className="flex items-center gap-2 rounded-md border px-3 py-2">
                                                <Checkbox id={checkboxId} checked={field.value.includes(kind)} onCheckedChange={(next) => field.onChange(next ? [...field.value, kind] : field.value.filter((item) => item !== kind))} />
                                                <label htmlFor={checkboxId} className="min-w-0 flex-1 truncate text-sm">
                                                    {ARCHITECT_NODE_KIND_LABELS[kind]}
                                                </label>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        />
                    </Field>
                    <FormToggleCard<ArchitectSettings> control={form.control} name="diagram.showFiles" id="architect-show-files" label="Mostrar arquivos" description="Os caminhos reais do repositório em cada nó e no painel lateral." />
                    <FormToggleCard<ArchitectSettings> control={form.control} name="diagram.showNotes" id="architect-show-notes" label="Mostrar riscos e decisões" description="As notas do plano (decisões, riscos e dúvidas) acima do diagrama." />
                </CardContent>
            </Card>
        </>
    )
}

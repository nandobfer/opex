"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Download, Loader2, RotateCcw, Save, Undo2, Upload } from "lucide-react"
import { useForm, useWatch, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { DEFAULT_UNIVERSE_LAYOUT, sameUniverseLayout, universeLayoutSchema, type UniverseLayoutConfig } from "@engramind/client"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FORM_GRID } from "@/components/ui/form-grid"
import type { OptionTabsOption } from "@/components/ui/option-tabs"
import { useResetUniverseLayout, useSaveUniverseLayout } from "../../../hooks/useUniverseLayout"
import { Section } from "../../shared/Section"
import { ChoiceLayoutField, NumberLayoutField, SwitchLayoutField } from "./UniverseLayoutFields"
import { UniverseLayoutExportDialog, UniverseLayoutImportDialog } from "./UniverseLayoutJsonDialogs"
import { UniverseLayoutPresets } from "./UniverseLayoutPresets"
import { UniverseLayoutPreview } from "./UniverseLayoutPreview"
import { useDebouncedValue } from "./useDebouncedValue"

const LAYOUT_OPTIONS: OptionTabsOption<UniverseLayoutConfig["layout"]>[] = [
    { value: "rings", label: "Anéis" },
    { value: "spiral", label: "Espiral" },
]
const ORDER_BY_OPTIONS: OptionTabsOption<UniverseLayoutConfig["orderBy"]>[] = [
    { value: "created", label: "Criação" },
    { value: "updated", label: "Atualização" },
    { value: "last-use", label: "Último uso" },
    { value: "uses", label: "Uso" },
]
const ORDER_NOUN: Record<UniverseLayoutConfig["orderBy"], string> = { created: "Mais novas", updated: "Mais atualizadas", "last-use": "Usadas há menos tempo", uses: "Mais usadas" }
const GROUPING_OPTIONS: OptionTabsOption<UniverseLayoutConfig["grouping"]>[] = [
    { value: "none", label: "Nenhum" },
    { value: "channel", label: "Por canal" },
]
const BALANCE_OPTIONS: OptionTabsOption<UniverseLayoutConfig["balance"]>[] = [
    { value: "proportional", label: "Proporcional" },
    { value: "fill", label: "Encher cada anel" },
]

interface UniverseLayoutFormProps {
    saved: UniverseLayoutConfig
    isDefault: boolean
    onDirtyChange: (dirty: boolean) => void
    onSaved: () => Promise<void>
}

/**
 * Formulário da aba Visualização (OPE-142): react-hook-form + o MESMO schema Zod que o servidor aplica
 * (`universeLayoutSchema`, da lib), com validação em tempo real. A prévia, as predefinições e a importação
 * trabalham sobre os valores ainda não salvos; só o Salvar grava.
 */
export function UniverseLayoutForm({ saved, isDefault, onDirtyChange, onSaved }: UniverseLayoutFormProps) {
    const form = useForm<UniverseLayoutConfig>({ resolver: zodResolver(universeLayoutSchema) as Resolver<UniverseLayoutConfig>, defaultValues: saved, mode: "onChange" })
    const values = useWatch({ control: form.control }) as UniverseLayoutConfig
    const key = JSON.stringify(values)
    const validation = useMemo(() => universeLayoutSchema.safeParse(JSON.parse(key) as unknown), [key])
    const dirty = !sameUniverseLayout(values, saved)
    // Último conjunto válido (a prévia e o JSON exportado ficam nele enquanto há erro). Ajuste durante a renderização, sem efeito em cascata.
    const [valid, setValid] = useState<{ key: string; config: UniverseLayoutConfig }>({ key: JSON.stringify(saved), config: saved })
    if (validation.success && valid.key !== key) setValid({ key, config: validation.data })
    const lastValid = valid.config
    const previewConfig = useDebouncedValue(lastValid, 150)
    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
    const [exporting, setExporting] = useState(false)
    const [importing, setImporting] = useState(false)
    const [confirmReset, setConfirmReset] = useState(false)
    const save = useSaveUniverseLayout()
    const reset = useResetUniverseLayout()

    const apply = (config: UniverseLayoutConfig) => form.reset(config, { keepDefaultValues: true })
    const resetField = (name: keyof UniverseLayoutConfig) => form.setValue(name, DEFAULT_UNIVERSE_LAYOUT[name] as never, { shouldDirty: true, shouldValidate: true })
    const submit = () => void form.handleSubmit((data) => save.mutate(data, { onSuccess: () => void onSaved() }))()
    const common = { control: form.control, errors: form.formState.errors, saved, values, onReset: resetField }
    const orderOptions: OptionTabsOption<UniverseLayoutConfig["order"]>[] = [
        { value: "newest-inside", label: `${ORDER_NOUN[values.orderBy]} por dentro` },
        { value: "newest-outside", label: `${ORDER_NOUN[values.orderBy]} por fora` },
    ]

    return (
        <div className="flex flex-col gap-6">
            <Section
                title="Visualização dos universos"
                description="Como as memórias se distribuem em volta do agente ou do canal: vale para a rede em /engramind, os universos de Inteligência Artificial e a aba Memórias dos agentes rotineiros."
                actions={
                    <>
                        <Button type="button" variant="outline" onClick={() => setImporting(true)}>
                            <Upload className="mr-2 h-4 w-4" aria-hidden /> Importar
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setExporting(true)}>
                            <Download className="mr-2 h-4 w-4" aria-hidden /> Exportar
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setConfirmReset(true)} disabled={isDefault || reset.isPending}>
                            <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Restaurar padrão
                        </Button>
                    </>
                }
            >
                <UniverseLayoutPresets values={values} onApply={apply} />
            </Section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-6">
                    <Section title="Disposição" info="Forma do desenho e a ordem das memórias a partir do centro.">
                        <div className={FORM_GRID}>
                            <ChoiceLayoutField {...common} name="layout" options={LAYOUT_OPTIONS} />
                            <NumberLayoutField {...common} name="firstRadius" />
                            <ChoiceLayoutField {...common} name="orderBy" options={ORDER_BY_OPTIONS} wide />
                            <ChoiceLayoutField {...common} name="order" options={orderOptions} wide />
                            <ChoiceLayoutField {...common} name="grouping" options={GROUPING_OPTIONS} wide />
                        </div>
                    </Section>
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div key={values.layout} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                            {values.layout === "rings" ? (
                                <Section title="Anéis" info="Distâncias e distribuição dos anéis concêntricos.">
                                    <div className={FORM_GRID}>
                                        <NumberLayoutField {...common} name="ringGap" />
                                        <NumberLayoutField {...common} name="slot" />
                                        <NumberLayoutField {...common} name="minPerRing" />
                                        <NumberLayoutField {...common} name="ringRotationDeg" />
                                        <ChoiceLayoutField {...common} name="balance" options={BALANCE_OPTIONS} wide />
                                    </div>
                                </Section>
                            ) : (
                                <Section title="Espiral" info="Espaçamento e ângulo da espiral de girassol.">
                                    <div className={FORM_GRID}>
                                        <NumberLayoutField {...common} name="spiralSpacing" />
                                        <NumberLayoutField {...common} name="spiralAngleDeg" />
                                    </div>
                                </Section>
                            )}
                        </motion.div>
                    </AnimatePresence>
                    <Section title="Desvio" info="Tira o desenho do alinhamento perfeito. O desvio é estável: a mesma memória cai no mesmo lugar a cada renderização.">
                        <div className={FORM_GRID}>
                            <NumberLayoutField {...common} name="angleJitter" />
                            <NumberLayoutField {...common} name="radiusJitter" />
                            <NumberLayoutField {...common} name="jitterSeed" />
                            <SwitchLayoutField {...common} name="avoidOverlap" />
                            <NumberLayoutField {...common} name="minDistance" />
                        </div>
                    </Section>
                    <Section title="Partículas" info="Faixa de tamanho das partículas; o tamanho de cada uma depende do uso.">
                        <div className={FORM_GRID}>
                            <NumberLayoutField {...common} name="particleMinPx" />
                            <NumberLayoutField {...common} name="particleMaxPx" />
                        </div>
                    </Section>
                </div>
                <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
                    <UniverseLayoutPreview config={previewConfig} />
                </div>
            </div>

            <AnimatePresence initial={false}>
                {dirty && (
                    <motion.div key="bar" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.2 }} className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
                        <span className="text-sm">Alterações não salvas</span>
                        {!validation.success && <span className="text-xs text-destructive">{validation.error.issues[0]?.message}</span>}
                        <div className="ml-auto flex gap-2">
                            <Button type="button" variant="outline" onClick={() => form.reset(saved)} disabled={save.isPending}>
                                <Undo2 className="mr-2 h-4 w-4" aria-hidden /> Desfazer
                            </Button>
                            <Button type="button" onClick={submit} disabled={!validation.success || save.isPending}>
                                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />} Salvar
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <UniverseLayoutExportDialog open={exporting} onOpenChange={setExporting} values={validation.success ? validation.data : lastValid} />
            <UniverseLayoutImportDialog open={importing} onOpenChange={setImporting} onImport={apply} />
            <ConfirmDialog
                open={confirmReset}
                onOpenChange={setConfirmReset}
                title="Restaurar o padrão?"
                description="A visualização volta aos anéis concêntricos originais em todos os universos. As alterações não salvas deste formulário também são descartadas."
                confirmLabel="Restaurar padrão"
                variant="destructive"
                pending={reset.isPending}
                onConfirm={() =>
                    reset.mutate(undefined, {
                        onSuccess: () => {
                            setConfirmReset(false)
                            void onSaved()
                        },
                    })
                }
            />
        </div>
    )
}

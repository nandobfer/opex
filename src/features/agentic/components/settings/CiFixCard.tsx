"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { ToggleCard } from "@/components/ui/toggle-card"
import type { AgenticCi } from "../../schemas"

interface CiFixCardProps {
    idPrefix: string
    value: AgenticCi
    onChange: (next: AgenticCi) => void
    /** Erro de validação do limite (1–20). */
    limitError?: string
    /** Padrão global mostrado no modo herdado (só na central). */
    globalValue?: AgenticCi
    /** Herança (só na central): sem `inherited`, o card edita o padrão global direto. */
    inherited?: { value: boolean; onChange: (inherit: boolean) => void }
}

/** Campo vazio = sem limite; número digitado vira o limite (a validação 1–20 vem do schema). */
export const parseCiLimit = (raw: string): number | null => (raw.trim() === "" ? null : Number(raw))

const limitText = (limit: number | null) => (limit === null ? "Sem limite" : `${limit} por PR`)

/**
 * Card "Corrigir CI falho" (OPE-81), usado nos dois escopos como o card de colunas: o padrão global
 * da aba "Desenvolvimento agêntico" e a aba Git e PR da central, que pode herdar ou personalizar.
 */
export function CiFixCard({ idPrefix, value, onChange, limitError, globalValue, inherited }: CiFixCardProps) {
    const inheriting = inherited?.value === true
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Corrigir CI falho</CardTitle>
                <CardDescription>
                    Quando todas as verificações do PR terminam e alguma falhou, o agente lê os logs, corrige a branch do PR e faz push (falha de infraestrutura é só reexecutada). As mesmas falhas são tratadas uma vez só.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {inherited && (
                    <OptionTabs<"inherit" | "custom">
                        id={`${idPrefix}-mode`}
                        aria-label="Origem da configuração de CI"
                        options={[
                            { value: "inherit", label: "Padrão global" },
                            { value: "custom", label: "Personalizar" },
                        ]}
                        value={inheriting ? "inherit" : "custom"}
                        onChange={(mode) => inherited.onChange(mode === "inherit")}
                        className="w-full"
                    />
                )}
                <AnimatePresence mode="wait" initial={false}>
                    {inheriting ? (
                        <motion.dl key="inherit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-1 text-sm text-muted-foreground">
                            <div className="flex items-center justify-between gap-3">
                                <dt>Correção automática</dt>
                                <dd className="font-medium text-foreground">{globalValue?.fixCi === false ? "Não" : "Sim"}</dd>
                            </div>
                            {globalValue?.fixCi !== false && (
                                <div className="flex items-center justify-between gap-3">
                                    <dt>Máximo de correções seguidas</dt>
                                    <dd className="font-medium text-foreground">{limitText(globalValue?.ciFixLimit ?? null)}</dd>
                                </div>
                            )}
                        </motion.dl>
                    ) : (
                        <motion.div key="custom" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-3">
                            <ToggleCard id={`${idPrefix}-fix`} checked={value.fixCi} onCheckedChange={(fixCi) => onChange({ ...value, fixCi })} label="Corrigir automaticamente" description="Sem aprovação: o PR volta a aguardar o CI depois da correção." onLabel="Sim" offLabel="Não" />
                            <AnimatePresence initial={false}>
                                {value.fixCi && (
                                    <motion.div key="limit" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                        <Field id={`${idPrefix}-limit`} label="Máximo de correções seguidas por PR (vazio = sem limite)" error={limitError}>
                                            <Input
                                                id={`${idPrefix}-limit`}
                                                type="number"
                                                min={1}
                                                max={20}
                                                placeholder="Sem limite"
                                                value={value.ciFixLimit ?? ""}
                                                onChange={(event) => onChange({ ...value, ciFixLimit: parseCiLimit(event.target.value) })}
                                                aria-invalid={limitError ? true : undefined}
                                            />
                                        </Field>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}

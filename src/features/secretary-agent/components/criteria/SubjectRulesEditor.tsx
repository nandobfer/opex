"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { SubjectRule } from "../../schemas"
import { subjectIdOf } from "../../settings-patch"

const item = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Lista de assuntos (bloqueados ou liberados): nome, descrição e exemplos (um por linha). */
export function SubjectRulesEditor({ label, rules, onChange, addLabel, idPrefix, error }: { label: string; rules: SubjectRule[]; onChange: (rules: SubjectRule[]) => void; addLabel: string; idPrefix: string; error?: string }) {
    const patch = (index: number, change: Partial<SubjectRule>) => onChange(rules.map((rule, at) => (at === index ? { ...rule, ...change } : rule)))
    const add = () => {
        const name = `Assunto ${rules.length + 1}`
        onChange([...rules, { id: subjectIdOf(name, rules.map((rule) => rule.id)), name, description: "", examples: [] }])
    }
    return <div className="space-y-3">
        <p className="text-sm font-medium">{label}</p>
        <ul className="space-y-3" aria-label={label}>
            <AnimatePresence initial={false}>
                {rules.map((rule, index) => (
                    <motion.li key={rule.id} {...item} className="overflow-hidden">
                        <div className="space-y-3 rounded-md border p-3">
                            <div className="flex items-end gap-2">
                                <Field id={`${idPrefix}-${rule.id}-name`} label="Nome do assunto" className="flex-1 space-y-1.5"><Input id={`${idPrefix}-${rule.id}-name`} value={rule.name} onChange={(event) => patch(index, { name: event.target.value })} /></Field>
                                <Button type="button" size="icon" variant="ghost" aria-label={`Remover ${rule.name}`} onClick={() => onChange(rules.filter((_, at) => at !== index))}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                            </div>
                            <Field id={`${idPrefix}-${rule.id}-description`} label="Descrição"><Textarea id={`${idPrefix}-${rule.id}-description`} value={rule.description} onChange={(event) => patch(index, { description: event.target.value })} /></Field>
                            <Field id={`${idPrefix}-${rule.id}-examples`} label="Exemplos (um por linha)">
                                <Textarea id={`${idPrefix}-${rule.id}-examples`} value={rule.examples.join("\n")} onChange={(event) => patch(index, { examples: event.target.value.split("\n") })} onBlur={(event) => patch(index, { examples: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })} />
                            </Field>
                        </div>
                    </motion.li>
                ))}
            </AnimatePresence>
        </ul>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="button" variant="outline" onClick={add} disabled={rules.length >= 20}><Plus className="mr-2 h-4 w-4" aria-hidden />{addLabel}</Button>
    </div>
}

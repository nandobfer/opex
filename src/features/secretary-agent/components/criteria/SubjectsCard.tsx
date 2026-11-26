"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OptionTabs } from "@/components/ui/option-tabs"
import type { SecretaryForm } from "../SecretaryAgentTab"
import { SubjectRulesEditor } from "./SubjectRulesEditor"

const reveal = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Etapa 2, "Sobre o quê": assuntos bloqueados (sempre bloqueiam) e responder sobre qualquer assunto ou só os liberados. */
export function SubjectsCard({ form }: { form: SecretaryForm }) {
    const subjects = form.watch("criteria.subjects")
    const options = { shouldDirty: true, shouldValidate: true }
    const allowedError = form.formState.errors.criteria?.subjects?.allowed?.message
    return <Card>
        <CardHeader>
            <CardTitle className="text-base">Etapa 2 · Sobre o quê</CardTitle>
            <CardDescription>Num assunto bloqueado o Secretário fica quieto: não avisa e não marca como lida.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
            <SubjectRulesEditor label="Assuntos bloqueados" addLabel="Adicionar assunto bloqueado" idPrefix="subject-blocked" rules={subjects.blocked} onChange={(rules) => form.setValue("criteria.subjects.blocked", rules, options)} />
            <div className="space-y-2">
                <p className="text-sm font-medium">Responder sobre</p>
                <OptionTabs aria-label="Responder sobre" value={subjects.mode} options={[{ value: "any", label: "Qualquer assunto" }, { value: "only", label: "Só os assuntos liberados" }]} onChange={(value) => form.setValue("criteria.subjects.mode", value, options)} />
                <AnimatePresence initial={false}>
                    {subjects.mode === "only" && (
                        <motion.div key="allowed" {...reveal} className="overflow-hidden pt-2">
                            <SubjectRulesEditor label="Assuntos liberados" addLabel="Adicionar assunto liberado" idPrefix="subject-allowed" rules={subjects.allowed} onChange={(rules) => form.setValue("criteria.subjects.allowed", rules, options)} error={allowedError} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </CardContent>
    </Card>
}

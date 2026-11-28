"use client"

import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { WizardStepper } from "@/components/wizard/WizardStepper"
import { BootstrapPageHeader } from "../BootstrapPageHeader"
import { BOOTSTRAP_WIZARD_STEPS } from "../steps-meta"
import { BootstrapInfoForm } from "./BootstrapInfoForm"

/** `/integracoes/ia/bootstraps/novo?repo=owner/nome`: etapa 1 do bootstrap de um ambiente novo. */
export function NewBootstrapPage() {
    const params = useSearchParams()
    const repo = params.get("repo") ?? ""
    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex min-w-0 flex-col gap-6">
            <BootstrapPageHeader title="Bootstrap de um ambiente novo" subtitle="Cria o repositório, provisiona o projeto com o Agente de Bootstrap, amarra a central e faz o primeiro deploy." />
            <WizardStepper steps={BOOTSTRAP_WIZARD_STEPS} current={0} maxReachable={0} onStepClick={() => undefined} aria-label="Etapas do bootstrap" />
            <BootstrapInfoForm key={repo} initialRepo={repo} />
        </motion.section>
    )
}

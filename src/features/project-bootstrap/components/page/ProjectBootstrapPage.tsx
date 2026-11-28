"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorState } from "@/components/feedback/ErrorState"
import { WizardStepper } from "@/components/wizard/WizardStepper"
import { apiErrorMessage } from "@/lib/api"
import { PROJECT_BOOTSTRAP_STATUS_LABELS, PROJECT_BOOTSTRAP_STEP_LABELS, PROJECT_BOOTSTRAP_STEPS } from "../../constants"
import { useProjectBootstrap, useProjectBootstrapAction, useProjectBootstrapRealtime } from "../../hooks/useProjectBootstrap"
import { defaultStepIndex, stepIndex, stepperState } from "../../steps"
import { createdSummary } from "../../view"
import { BootstrapPageHeader } from "../BootstrapPageHeader"
import { BOOTSTRAP_WIZARD_STEPS } from "../steps-meta"
import { DeployPanel } from "./DeployPanel"
import { DonePanel } from "./DonePanel"
import { InfoPanel } from "./InfoPanel"
import { LinkPanel } from "./LinkPanel"
import { ProjectBootstrapPageSkeleton } from "./ProjectBootstrapPageSkeleton"
import { ProvisionPanel } from "./ProvisionPanel"

/**
 * Página do bootstrap (`/integracoes/ia/bootstraps/[id]`): stepper com o progresso ao vivo, a etapa atual
 * aberta por padrão e as anteriores abertas só para leitura. Retomável pelo link a qualquer momento.
 */
export function ProjectBootstrapPage({ id }: { id: string }) {
    useProjectBootstrapRealtime()
    const query = useProjectBootstrap(id)
    const action = useProjectBootstrapAction(id)
    const reduceMotion = useReducedMotion()
    const bootstrap = query.data
    const active = bootstrap ? defaultStepIndex(bootstrap) : 1
    // Etapa aberta pelo dono, válida enquanto a etapa em andamento não muda (depois, volta a mostrar a atual).
    const [view, setView] = useState<{ index: number; active: number } | null>(null)
    const [confirm, setConfirm] = useState(false)

    if (query.isLoading) return <ProjectBootstrapPageSkeleton />
    if (query.isError || !bootstrap) return <ErrorState title="Não foi possível carregar o bootstrap" description={apiErrorMessage(query.error, "Ele pode ter sido excluído.")} onRetry={() => void query.refetch()} />

    const states = stepperState(bootstrap)
    const current = view && view.active === active ? view.index : active
    const stepId = PROJECT_BOOTSTRAP_STEPS[current] ?? "provision"
    const open = bootstrap.status !== "done" && bootstrap.status !== "cancelled"
    const finished = PROJECT_BOOTSTRAP_STEPS.indexOf("done")
    const maxReachable = bootstrap.status === "cancelled" ? finished : active

    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex min-w-0 flex-col gap-6">
            <BootstrapPageHeader
                title={`Bootstrap ${bootstrap.repo}`}
                subtitle={
                    <span className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground" data-status={bootstrap.status}>
                            {PROJECT_BOOTSTRAP_STATUS_LABELS[bootstrap.status]}
                        </span>
                        <span className="font-mono">{bootstrap.directory}</span>
                    </span>
                }
                actions={
                    open ? (
                        <Button type="button" variant="outline" className="gap-1.5" onClick={() => setConfirm(true)}>
                            <Ban className="h-4 w-4" aria-hidden /> Cancelar bootstrap
                        </Button>
                    ) : null
                }
            />
            <WizardStepper
                steps={BOOTSTRAP_WIZARD_STEPS}
                current={current}
                maxReachable={maxReachable}
                onStepClick={(index) => setView(index === active ? null : { index, active })}
                statuses={states.map((state) => state.status)}
                progress={states.map((state) => state.progress)}
                badges={states.map((state) => state.badge)}
                trackIndex={bootstrap.status === "cancelled" ? stepIndex(bootstrap.step) : active}
                aria-label="Etapas do bootstrap"
            />
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                        {PROJECT_BOOTSTRAP_STEP_LABELS[stepId]}
                        {current !== active && <span className="text-xs font-normal text-muted-foreground">Somente leitura</span>}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div key={stepId} initial={reduceMotion ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
                            {stepId === "info" && <InfoPanel bootstrap={bootstrap} />}
                            {stepId === "provision" && <ProvisionPanel bootstrap={bootstrap} />}
                            {stepId === "link" && <LinkPanel bootstrap={bootstrap} />}
                            {stepId === "deploy" && <DeployPanel bootstrap={bootstrap} />}
                            {stepId === "done" && <DonePanel bootstrap={bootstrap} />}
                        </motion.div>
                    </AnimatePresence>
                </CardContent>
            </Card>
            <ConfirmDialog
                open={confirm}
                onOpenChange={setConfirm}
                title="Cancelar o bootstrap?"
                description="O agente para e o bootstrap fica como Cancelado. Nada do que já foi criado é apagado:"
                items={createdSummary(bootstrap).length ? createdSummary(bootstrap) : ["Nada foi criado ainda"]}
                confirmLabel="Cancelar bootstrap"
                variant="destructive"
                pending={action.isPending}
                onConfirm={() => action.mutate("cancel", { onSuccess: () => setConfirm(false) })}
            />
        </motion.section>
    )
}

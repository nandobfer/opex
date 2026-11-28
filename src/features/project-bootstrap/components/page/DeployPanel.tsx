"use client"

import { AnimatePresence, motion } from "framer-motion"
import { DeployLog } from "@/features/environments/components/DeployLog"
import { useProjectBootstrapAction } from "../../hooks/useProjectBootstrap"
import type { ProjectBootstrapDto } from "../../types"
import { createdRows, stepNoticeView } from "../../view"
import { ProgressRow } from "./ProgressRow"
import { StepNotice } from "./StepNotice"

const DEPLOY_STATUS = { running: "em andamento", success: "concluído", failed: "falhou" } as const

/** Etapa 4: o ambiente criado para a central, o deploy com o log ao vivo e o histórico das tentativas. */
export function DeployPanel({ bootstrap }: { bootstrap: ProjectBootstrapDto }) {
    const action = useProjectBootstrapAction(bootstrap.id)
    const rows = createdRows(bootstrap)
    const notice = stepNoticeView(bootstrap, "deploy")
    const deployId = bootstrap.created.deployId
    return (
        <div className="space-y-4">
            <StepNotice tone={notice.tone} message={notice.message} onRetry={notice.retry ? () => action.mutate("retry") : undefined} retrying={action.isPending} />
            <ul className="space-y-2">
                <ProgressRow
                    label="Ambiente"
                    description={bootstrap.result ? `Build e execução no servidor · porta ${bootstrap.result.port} · ref ${bootstrap.branch}` : "Build e execução no servidor"}
                    state={rows.environment}
                    href={bootstrap.created.environmentId ? `/ambientes/${bootstrap.created.environmentId}/editar` : null}
                />
                <ProgressRow label="Deploy" description={bootstrap.deploys.length > 1 ? `${bootstrap.deploys.length} tentativas` : undefined} state={rows.deploy} href={deployId ? `/ambientes/deploys/${deployId}` : null} />
            </ul>
            <AnimatePresence initial={false}>
                {bootstrap.deploys.length > 1 && (
                    <motion.ol key="attempts" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1 overflow-hidden text-xs text-muted-foreground">
                        {bootstrap.deploys.map((item) => (
                            <li key={item.deployId}>
                                Tentativa {item.attempt}: {DEPLOY_STATUS[item.status]}
                                {item.error ? ` — ${item.error}` : ""}
                            </li>
                        ))}
                    </motion.ol>
                )}
            </AnimatePresence>
            {deployId && <DeployLog key={deployId} deployId={deployId} />}
        </div>
    )
}

"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useRef } from "react"
import { motion } from "framer-motion"
import { Rocket } from "lucide-react"
import { AgentPageHeader } from "@/components/list/AgentPageHeader"
import { useFillViewportHeight } from "@/features/integrations/hooks/useScrollViewportHeight"
import { ENVIRONMENTS_PATH } from "../constants"
import type { DeployKind, EnvironmentDeploySummaryDto } from "../types"
import { placementLabel } from "../view"
import { DeployLog } from "./DeployLog"
import { DEPLOY_LOG_CARD_CLASS, DEPLOY_PAGE_CLASS } from "./deploy-page-layout"

const TITLE_PREFIX: Record<DeployKind, string> = { deploy: "Deploy de", move: "Mudança de máquina de", delete: "Remoção de" }

/** Linha abaixo do título: onde (build → execução), ref @ commit e o início. */
export function deployPageDescription(deploy: EnvironmentDeploySummaryDto): string {
    const ref = deploy.ref || deploy.commit ? `${deploy.ref ?? ""}${deploy.commit ? `${deploy.ref ? " " : ""}@ ${deploy.commit.slice(0, 8)}` : ""}` : null
    const started = `iniciado em ${format(new Date(deploy.startedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
    return [placementLabel(deploy.buildOn, deploy.runOn), ref, started].filter(Boolean).join(" · ")
}

/**
 * Página do log de um deploy (`/ambientes/deploys/[deployId]`, OPE-208, no lugar da gaveta): cabeçalho com o
 * voltar para Ambientes e o terminal ao vivo ocupando o resto da tela. Sair e voltar não perde nada: o deploy
 * segue no servidor e o stream reenvia o log inteiro.
 */
export function DeployLogPage({ deploy, environmentName }: { deploy: EnvironmentDeploySummaryDto; environmentName: string }) {
    const cardRef = useRef<HTMLDivElement>(null)
    // O terminal fica com o resto da tela (mínimo de 320 px); a entrada é só de opacidade para não deslocar a medida.
    const height = useFillViewportHeight(cardRef)
    return (
        <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className={DEPLOY_PAGE_CLASS} aria-label="Log do deploy">
            <AgentPageHeader icon={Rocket} title={`${TITLE_PREFIX[deploy.kind]} ${environmentName}`} description={deployPageDescription(deploy)} backHref={ENVIRONMENTS_PATH} backLabel="Voltar para os ambientes" />
            <div ref={cardRef} className={DEPLOY_LOG_CARD_CLASS} style={height ? { height } : undefined}>
                <DeployLog deployId={deploy.id} className="flex-1" />
            </div>
        </motion.section>
    )
}

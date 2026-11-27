"use client"

import { UsageBar } from "@/components/metrics/UsageBar"
import { useTickingNow } from "@/hooks/useTickingNow"
import { DEPLOY_PROGRESS_ARIA_LABEL, deployProgress } from "../deploy-progress"
import type { DeployMetaEvent } from "../types"

/** Tick menor que o segundo exibido: um disparo atrasado não pula um segundo. */
const DEPLOY_PROGRESS_TICK_MS = 250

/** `meta` recebido com a diferença do relógio local para o do servidor, medida na chegada (`clockSkewMs`). */
export type DeployProgressMeta = DeployMetaEvent & { skewMs: number }

/** Barra da gaveta de deploy: tempo decorrido (do `startedAt` absoluto) sobre a duração estimada. */
export function DeployProgress({ meta }: { meta: DeployProgressMeta }) {
    const clientNow = useTickingNow(DEPLOY_PROGRESS_TICK_MS)
    const now = clientNow === null ? null : clientNow - meta.skewMs
    if (now === null) return <UsageBar label="Deploy" percent={null} ariaLabel={DEPLOY_PROGRESS_ARIA_LABEL} tone="primary" />
    const view = deployProgress({ startedAt: meta.startedAt, estimateMs: meta.estimateMs, initial: meta.initial, now })
    return (
        <UsageBar
            label="Deploy"
            percent={view.percent}
            ariaLabel={DEPLOY_PROGRESS_ARIA_LABEL}
            ariaValueText={view.ariaValueText}
            detail={view.detail}
            detailTitle={meta.estimateMs === null ? "Sem deploys anteriores com sucesso para estimar a duração" : `Estimativa pela mediana de ${meta.sampleSize} deploy(s) com sucesso deste ambiente`}
            tone="primary"
            dataAttributes={{ "data-deploy-progress": view.overdue ? "overdue" : view.percent === null ? "indeterminate" : "estimated" }}
        />
    )
}

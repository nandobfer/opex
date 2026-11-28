"use client"

import { centralSettingsPath } from "@/features/agentic/constants"
import { useProjectBootstrapAction } from "../../hooks/useProjectBootstrap"
import type { ProjectBootstrapDto } from "../../types"
import { createdRows, stepNoticeView } from "../../view"
import { ProgressRow } from "./ProgressRow"
import { StepNotice } from "./StepNotice"

/** Etapa 3: o vínculo em Integrações › GitHub (que cria o Projeto) e a central do projeto. */
export function LinkPanel({ bootstrap }: { bootstrap: ProjectBootstrapDto }) {
    const action = useProjectBootstrapAction(bootstrap.id)
    const rows = createdRows(bootstrap)
    const notice = stepNoticeView(bootstrap, "link")
    return (
        <div className="space-y-4">
            <StepNotice tone={notice.tone} message={notice.message} onRetry={notice.retry ? () => action.mutate("retry") : undefined} retrying={action.isPending} />
            <ul className="space-y-2">
                <ProgressRow label="Vínculo do GitHub" description={`${bootstrap.repo} · sincronização ativa`} state={rows.link} href={bootstrap.created.projectId ? "/integracoes/github" : null} />
                <ProgressRow label="Central de desenvolvimento" description={`${bootstrap.directory} · branch ${bootstrap.branch}${bootstrap.result ? ` · backup do banco ${bootstrap.result.usesMongo ? "ligado" : "desligado"}` : ""}`} state={rows.central} href={bootstrap.created.centralId ? centralSettingsPath(bootstrap.created.centralId) : null} />
            </ul>
        </div>
    )
}

"use client"

import { ReplyTargetProvider } from "@/components/agent-reply/ReplyTargetProvider"
import { Timeline } from "@/features/agentic/components/workbench/Timeline"
import { ReconnectButton } from "@/features/agentic/components/workbench/ReconnectButton"
import { useProjectBootstrapAction, useProjectBootstrapStream } from "../../hooks/useProjectBootstrap"
import type { ProjectBootstrapDto } from "../../types"
import { canMessage, canReconnect, stepNoticeView } from "../../view"
import { BootstrapMessageBox } from "./BootstrapMessageBox"
import { BootstrapRequests } from "./BootstrapRequests"
import { StepNotice } from "./StepNotice"

/** Etapa 2: conversa ao vivo com o Agente de Bootstrap, pedidos pendentes, mensagem e o que faltou. */
export function ProvisionPanel({ bootstrap }: { bootstrap: ProjectBootstrapDto }) {
    const { timeline } = useProjectBootstrapStream(bootstrap.id)
    const action = useProjectBootstrapAction(bootstrap.id)
    const notice = stepNoticeView(bootstrap, "provision")
    return (
        <div className="space-y-4">
            <StepNotice
                tone={notice.tone}
                message={notice.message}
                items={bootstrap.step === "provision" ? bootstrap.missing : []}
                onRetry={notice.retry ? () => action.mutate("retry") : undefined}
                retrying={action.isPending}
                actions={canReconnect(bootstrap) ? <ReconnectButton reconnecting={action.isPending} onClick={() => action.mutate("reconnect")} /> : null}
            />
            <ReplyTargetProvider>
                <div className="flex h-[55vh] min-h-[20rem] flex-col overflow-hidden rounded-md border" data-testid="bootstrap-timeline">
                    <Timeline timeline={timeline} running={bootstrap.running && bootstrap.phase === "turn"} />
                </div>
                <BootstrapRequests bootstrap={bootstrap} />
            </ReplyTargetProvider>
            {canMessage(bootstrap) && <BootstrapMessageBox bootstrap={bootstrap} />}
        </div>
    )
}

import type { IEnvironmentDeploy } from "./models"
import { Environment } from "./models"
import { deployNoticeText, registryCleanupNoticeText } from "../opex-format"

/**
 * Avisos do módulo Ambientes ao Agente Opex: o fim de um deploy (ou mover) pedido pelo agente e o fim
 * da limpeza do registry entram como mensagem de aviso (`notice`) na sessão que os pediu.
 */

async function queueNotice(sessionId: string, text: string, display: string): Promise<void> {
    const { queueFollowUp } = await import("@/features/opex-agent/server/runner")
    await queueFollowUp(sessionId, { kind: "notice", text, display })
}

export async function notifyOpexDeployFinished(deploy: IEnvironmentDeploy): Promise<void> {
    if (!deploy.notifyOpexSessionId) return
    const env = await Environment.findById(deploy.environmentId).select({ name: 1, slug: 1 }).lean<{ name: string; slug: string }>()
    const notice = deployNoticeText(deploy, env)
    await queueNotice(deploy.notifyOpexSessionId, notice.text, notice.display)
}

export async function notifyOpexRegistryCleanup(sessionId: string, result: { ok: true; message: string } | { ok: false; error: string }): Promise<void> {
    const notice = registryCleanupNoticeText(result)
    await queueNotice(sessionId, notice.text, notice.display)
}

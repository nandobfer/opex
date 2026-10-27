import { DomainError } from "@/lib/api/route"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { LOCAL_DOCKER_INTEGRATION_ID } from "../constants"

/**
 * A Builder Machine liga e desliga pelo campo público "Integração ativa" (`active`) da integração
 * `builder_machine`. Desativada: rotas 404, rotinas não fazem nada e as prévias ficam no servidor.
 */
export async function isBuilderMachineActive(): Promise<boolean> {
    try {
        return (await getIntegrationConfig(LOCAL_DOCKER_INTEGRATION_ID)).active === true
    } catch {
        return false
    }
}

/** Rotas da Builder Machine respondem 404 com a integração desativada. */
export async function assertBuilderMachineActive(): Promise<void> {
    if (!(await isBuilderMachineActive())) throw new DomainError(404, "A integração Builder Machine está desativada: ative-a em Integrações › Builder Machine", "BUILDER_MACHINE_INACTIVE")
}

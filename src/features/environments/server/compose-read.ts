import { DomainError } from "@/lib/api/route"
import { loadCentral } from "@/features/agentic/server/centrals"
import type { HostRunner } from "@/features/local-docker/server/shell"
import { centralComposeConfigCommand, envFilesConfigCommand } from "../commands"
import { parseComposeConfig, selectServices } from "../compose-config"
import type { EnvironmentSource } from "../schemas"
import type { ComposeServicesDto } from "../types"
import { configError } from "./deploy"
import { composePlanOf } from "./service"
import { envLog, loadEnvironmentsSettings, machineAccess, runEnvHost } from "./settings"

/**
 * "Ler compose" do formulário (OPE-193): os serviços do compose da origem e os limites declarados neles,
 * sem o override do app. Central: o compose da ref (pasta temporária); adotado: a pasta do projeto, no
 * servidor ou no PC. A saída do `config` nunca vai para o log; na falha, só a última linha do erro.
 */
export async function readComposeServices(source: EnvironmentSource, run: HostRunner = runEnvHost): Promise<ComposeServicesDto> {
    let command: string
    if (source.kind === "central") {
        const { config } = await loadCentral(source.centralId)
        command = centralComposeConfigCommand(config.sessionDirectory, source.ref, source.composeFile)
    } else {
        const access = await machineAccess(run)
        if (source.machine === "pc" && !access.pcAvailable) throw new DomainError(409, access.pcReason ?? "O PC não está disponível", "ENVIRONMENT_PC_UNAVAILABLE")
        const plan = composePlanOf({ slug: "", source }, await loadEnvironmentsSettings())
        command = envFilesConfigCommand(plan, access.targets[source.machine])
    }
    const result = await run(command, 120_000, { retryOnLost: true, redactedAs: "docker compose config (ler os serviços do formulário; saída omitida)" })
    const parsed = result.exitCode === 0 ? parseComposeConfig(result.output) : null
    if (!parsed) {
        envLog.warn({ kind: source.kind, exitCode: result.exitCode }, "[environments] Falha ao ler o compose para o formulário")
        throw new DomainError(502, `Não foi possível ler o compose${result.exitCode === 0 ? ": a saída não trouxe os serviços" : configError(result.output)}`, "ENVIRONMENT_COMPOSE_READ_FAILED")
    }
    const services = source.kind === "central" ? selectServices(parsed, source.services) : parsed
    return { services: services.map((service) => ({ name: service.name, hasBuild: service.hasBuild, declared: service.declared })) }
}

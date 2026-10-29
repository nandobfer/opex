import { z } from "zod"
import type { PortalEnvironmentAction } from "@/features/environments/constants"
import { defineTool } from "../tools/define"
import { requireClientActor } from "./helpers"

/**
 * Ambientes no portal — espelham `/cliente/ambientes`: todos leem o estado dos ambientes dos
 * repositórios do cliente; implantar (a ref salva), levantar e reiniciar são do **admin** do cliente.
 * Chamam os mesmos serviços da tela (vínculo revalidado, auditoria e tempo real iguais).
 */

const portal = () => import("@/features/environments/server/portal")
const environment = z.string().trim().min(1).max(100).describe("Id ou slug do ambiente (de list_environments)")

async function act(ref: string, action: PortalEnvironmentAction, context: Parameters<typeof requireClientActor>[0]) {
    const actor = requireClientActor(context)
    const { resolvePortalEnvironment, runPortalEnvironmentAction } = await portal()
    const env = await resolvePortalEnvironment(actor.client, ref)
    const result = await runPortalEnvironmentAction(actor, String(env._id), action)
    return { id: String(env._id), slug: env.slug, action, ...(action === "deploy" ? { status: result.started ? "running" : "unknown", note: "O deploy segue em segundo plano; consulte list_environments para acompanhar." } : { done: true }) }
}

export const clientEnvironmentTools = [
    defineTool({
        name: "list_environments",
        group: "environments",
        label: "Listar ambientes",
        risk: "read",
        description: "Ambientes dos repositórios do cliente: estado (no ar, parcial, parado, nunca implantado, implantando), ref, versão no ar, serviços e o último deploy.",
        input: z.object({}),
        execute: async (_input, context) => {
            const actor = requireClientActor(context)
            return (await portal()).listPortalEnvironments(actor.client)
        },
    }),
    defineTool({
        name: "deploy_environment",
        group: "environments",
        label: "Implantar ambiente",
        risk: "destructive",
        adminOnly: true,
        description: "Implanta o código mais recente da ref salva do ambiente (não troca de ref nem de máquina). O ambiente pode ficar fora do ar por alguns instantes; o deploy segue em segundo plano.",
        input: z.object({ environment }),
        summarize: (input) => `Implantar o ambiente ${input.environment} (ref salva)`,
        execute: async (input, context) => act(input.environment, "deploy", context),
    }),
    defineTool({
        name: "start_environment",
        group: "environments",
        label: "Levantar ambiente",
        risk: "write",
        adminOnly: true,
        description: "Levanta (sobe) os serviços de um ambiente já implantado que está parado.",
        input: z.object({ environment }),
        summarize: (input) => `Levantar o ambiente ${input.environment}`,
        execute: async (input, context) => act(input.environment, "up", context),
    }),
    defineTool({
        name: "restart_environment",
        group: "environments",
        label: "Reiniciar ambiente",
        risk: "destructive",
        adminOnly: true,
        description: "Reinicia os serviços de um ambiente já implantado (fica fora do ar por alguns instantes).",
        input: z.object({ environment }),
        summarize: (input) => `Reiniciar o ambiente ${input.environment}`,
        execute: async (input, context) => act(input.environment, "restart", context),
    }),
]

import { z } from "zod"
import { defineTool, type OpexToolDef } from "./define"
import { ENGRAMIND_OPERATIONS, type EngramindOperation } from "@/features/engramind/operations"
import { TOKEN_REVEAL_TTL_MS } from "@/features/engramind/constants"
import { importInputSchema } from "@/features/engramind/schemas/import"
import { envUpdateSchema } from "@/features/engramind/schemas/env"
import type { IssuedToken } from "@/features/engramind/types"

/**
 * Ferramentas do Agente Opex do dono para o Engramind (só no catálogo do dono; nada no portal). Uma por
 * operação do catálogo `features/engramind/operations.ts`, mais importação, variáveis de ambiente e
 * bootstrap — todas chamam os serviços do Opex (`features/engramind/server/*`), nunca o HTTP do app.
 * Destrutivas (confirmação): excluir canal, memória, app e agente; arquivar canal e memória; revogar
 * token. O token emitido não vai ao modelo: o card mostra "Ver token" (uso único, 10 min).
 */

const runner = () => import("@/features/engramind/server/operations-runner")
const hostEnv = () => import("@/features/engramind/server/host-env")
const bootstrap = () => import("@/features/engramind/server/bootstrap")
const connection = () => import("@/features/engramind/server/connection")
const reveals = () => import("@/features/opex-agent/server/secret-reveals")

type AnyTool = OpexToolDef<unknown>
const tool = <I>(def: Omit<OpexToolDef<I>, "group">) => defineTool<I>({ ...def, group: "engramind" }) as unknown as AnyTool

/** Token emitido: o modelo recebe só o prefixo; o segredo fica para o botão "Ver token". */
async function issueToken(input: unknown, actorId: string): Promise<unknown> {
    const issued = (await (await runner()).runEngramindOperation("issue_token", input, actorId)) as IssuedToken
    const { token } = issued
    const view = { id: token.id, prefix: token.prefix, kind: token.kind, scopes: token.scopes, app: token.app.slug, agent: token.agent?.slug ?? null, label: token.label, expiresAt: token.expires_at }
    if (!issued.secret) return { token: view, note: "Emissão repetida: o Engramind não devolve o segredo de novo. Revogue e emita outro se ele se perdeu." }
    const resultAction = await (await reveals()).createSecretReveal(issued.secret, { title: `Token ${token.prefix}`, label: "Ver token", ttlMs: TOKEN_REVEAL_TTL_MS })
    return { token: view, note: "O segredo NÃO está aqui: o dono vê pelo botão \"Ver token\" do card, uma única vez, nos próximos 10 minutos.", resultAction }
}

function operationTool(operation: EngramindOperation): AnyTool {
    return tool<unknown>({
        name: operation.tool,
        label: operation.label,
        description: operation.description,
        risk: operation.risk,
        input: operation.input,
        ...(operation.summarize ? { summarize: operation.summarize } : {}),
        ...(operation.redact ? { redact: operation.redact } : {}),
        execute: (input, context) => (operation.id === "issue_token" ? issueToken(input, context.actorId) : runner().then((module) => module.runEngramindOperation(operation.id, input, context.actorId))),
    })
}

const envToolInput = envUpdateSchema
export const engramindTools: readonly AnyTool[] = [
    ...ENGRAMIND_OPERATIONS.map(operationTool),
    tool({
        name: "get_engramind_connection",
        label: "Conexão com o Engramind",
        description: "Estado da integração Engramind: URL base, URL pública do Opex, Ambiente vinculado, token (app, escopos, se ainda é o de bootstrap) e o webhook. Sem segredos.",
        risk: "read",
        input: z.object({}),
        execute: async () => (await connection()).getConnection(),
    }),
    tool({
        name: "run_engramind_bootstrap",
        label: "Repetir a configuração automática do Engramind",
        description: "Troca o token de bootstrap pelo token próprio do app opex (e só depois revoga o de bootstrap) e registra o webhook do Opex. Seguro para repetir.",
        risk: "write",
        input: z.object({}),
        execute: async (_input, context) => ({ steps: await (await bootstrap()).runBootstrap(context.actorId) }),
    }),
    tool({
        name: "import_engramind_memories",
        label: "Importar memórias no Engramind",
        description: "Importa um lote de memórias num canal ativo (até limits.max_batch). A chave de idempotência sai do canal e do conteúdo: repetir o mesmo lote não duplica. Devolve as criadas e as duplicadas (existing_id).",
        risk: "write",
        input: importInputSchema,
        redact: (input) => ({ channel: input.channel, memories: `${input.memories.length} memória(s)` }),
        execute: async (input, context) => (await runner()).importEngramindMemories(input, context.actorId),
    }),
    tool({
        name: "get_engramind_env",
        label: "Variáveis de ambiente do Engramind",
        description: "Lê o .env do Engramind no host (pelo OpenCode): as editáveis com o valor, as sensíveis só como configurada/não, o hash para gravar e se há alterações pendentes de aplicação.",
        risk: "read",
        input: z.object({}),
        execute: async () => (await hostEnv()).readEngramindEnv(),
    }),
    tool({
        name: "update_engramind_env",
        label: "Gravar variáveis de ambiente do Engramind",
        description: "Grava no .env do Engramind só as chaves alteradas (hash de get_engramind_env; recusa se o arquivo mudou). Não reinicia: depois use apply_engramind_env. litestreamSecret grava a senha do Litestream (vazio mantém).",
        risk: "write",
        input: envToolInput,
        redact: (input) => ({ ...input, litestreamSecret: input.litestreamSecret ? "[segredo omitido]" : undefined }),
        execute: async (input, context) => (await hostEnv()).updateEngramindEnv(input, context.actorId),
    }),
    tool({
        name: "apply_engramind_env",
        label: "Aplicar e reiniciar o Engramind",
        description: "Recria o serviço api do Engramind com o .env gravado (fica fora do ar por um instante) e confere /health/ready. Roda em segundo plano; o resultado aparece em get_engramind_env (apply).",
        risk: "write",
        input: z.object({}),
        execute: async (_input, context) => (await hostEnv()).applyEngramindEnv(context.actorId),
    }),
]

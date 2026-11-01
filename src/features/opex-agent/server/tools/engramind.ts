import { z } from "zod"
import { DomainError } from "@/lib/api/route"
import { defineTool, type OpexToolContext, type OpexToolDef } from "./define"
import { ENGRAMIND_OPERATIONS, type EngramindOperation } from "@/features/engramind/operations"
import { TOKEN_REVEAL_TTL_MS } from "@/features/engramind/constants"
import { importInputSchema } from "@/features/engramind/schemas/import"
import { envUpdateSchema } from "@/features/engramind/schemas/env"
import { applyAiSourceToolSchema, resendAiKeySchema } from "@/features/engramind/schemas/ai-source"
import type { IssuedToken, SearchResults } from "@/features/engramind/types"

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
const aiSource = () => import("@/features/engramind/server/ai-source")

type AnyTool = OpexToolDef<unknown>
const tool = <I>(def: Omit<OpexToolDef<I>, "group">) => defineTool<I>({ ...def, group: "engramind" }) as unknown as AnyTool

/** Token emitido: o modelo recebe só o prefixo; o segredo fica para o botão "Ver token". */
async function issueToken(input: unknown, actorId: string): Promise<unknown> {
    const issued = (await (await runner()).runEngramindOperation("issue_token", input, actorId)) as IssuedToken
    const { token } = issued
    const view = { id: token.id, prefix: token.prefix, kind: token.kind, scopes: token.scopes, app: token.app.slug, agent: token.agent?.slug ?? null, label: token.label, expiresAt: token.expires_at }
    if (!issued.secret) return { token: view, note: "Emissão repetida: o Engramind não devolve o segredo de novo. Revogue e emita outro se ele se perdeu." }
    let resultAction: Awaited<ReturnType<Awaited<ReturnType<typeof reveals>>["createSecretReveal"]>>
    try {
        resultAction = await (await reveals()).createSecretReveal(issued.secret, { title: `Token ${token.prefix}`, label: "Ver token", ttlMs: TOKEN_REVEAL_TTL_MS })
    } catch (error) {
        // Sem o cofre, o segredo se perderia e o token ficaria ativo e inalcançável: revoga na hora.
        const { engramindLog } = await import("@/features/engramind/server/shared")
        engramindLog.warn({ err: error, tokenId: token.id }, "[engramind] cofre do Ver token falhou; revogando o token recém-emitido")
        try {
            await (await runner()).runEngramindOperation("revoke_token", { token: token.id }, actorId)
        } catch (revokeError) {
            engramindLog.error({ err: revokeError, tokenId: token.id }, "[engramind] não foi possível revogar o token órfão")
            throw new DomainError(502, `O token ${token.prefix} foi emitido, mas o Opex não conseguiu guardar o segredo nem revogá-lo. Revogue ${token.prefix} em Integrações › Engramind › Identidades e emita outro.`, "ENGRAMIND_TOKEN_ORPHAN")
        }
        throw new DomainError(502, `Não foi possível guardar o segredo do token para o botão "Ver token"; o token ${token.prefix} foi revogado. Peça para emitir de novo.`, "ENGRAMIND_TOKEN_REVEAL_FAILED")
    }
    return { token: view, note: "O segredo NÃO está aqui: o dono vê pelo botão \"Ver token\" do card, uma única vez, nos próximos 10 minutos.", resultAction }
}

/**
 * Busca de memórias pelo agente (OPE-109): publica o consumo na rede (`engramind-consumption`, só ids).
 * Pelo MCP do Agente Maddox (token de sistema) o consumidor é `opex/maddox`; no chat, `opex/opex`.
 * Nunca derruba a ferramenta.
 */
export async function publishSearchConsumption(input: unknown, result: unknown, context: Pick<OpexToolContext, "origin">): Promise<void> {
    const hits = (result as Partial<SearchResults> | null)?.results ?? []
    const requested = ((input as { channels?: unknown } | null)?.channels as string[] | undefined) ?? []
    const delivered = [...new Set(hits.map((hit) => hit.memory.channel))]
    if (!hits.length) return
    const { publishConsumption } = await import("@/features/engramind/server/consumption")
    await publishConsumption({
        agent: context.origin?.kind === "api-token" ? "opex/maddox" : "opex/opex",
        kind: "search",
        channels: requested.length ? requested : delivered,
        delivered,
        memoryIds: hits.map((hit) => hit.memory.id),
    })
}

async function runOperation(operation: EngramindOperation, input: unknown, context: OpexToolContext): Promise<unknown> {
    const result = await (await runner()).runEngramindOperation(operation.id, input, context.actorId)
    if (operation.id === "search_memories") void publishSearchConsumption(input, result, context).catch(() => undefined)
    return result
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
        execute: (input, context) => (operation.id === "issue_token" ? issueToken(input, context.actorId) : runOperation(operation, input, context)),
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
        name: "get_engramind_ai_source",
        label: "IA do Opex no Engramind",
        description: "Mostra, para o Redator e o embedding, se a configuração em uso vem do Opex (provedor, modelo, reservas, temperatura, dimensão), o estado do modelo local de embedding ou foi mudada no Engramind, e o estado da cópia da chave. Sem segredos.",
        risk: "read",
        input: z.object({}),
        execute: async () => (await aiSource()).getOpexAiSourceState(),
    }),
    tool({
        name: "apply_engramind_ai_source",
        label: "Usar a IA do Opex no Engramind",
        description: "Aplica no Redator (gemini, anthropic, openai ou deepseek; modelo, até 5 reservas e temperatura de 0 a 2 — null usa o padrão do modelo e é obrigatório nos que recusam temperature) ou no embedding (local, gemini, openai ou off; modelo e dimensão) um provedor configurado no Opex. A URL vem do provedor; a chave é lida no servidor e copiada ao Engramind (nunca passa por aqui). Trocar o embedding reindexa.",
        risk: "write",
        confirmByDefault: true,
        input: applyAiSourceToolSchema,
        execute: async (input, context) => (await aiSource()).applyOpexAiSource(input, context.actorId),
    }),
    tool({
        name: "resend_engramind_ai_key",
        label: "Reenviar a chave do Opex ao Engramind",
        description: "Reenvia ao Engramind só a chave do provedor do Opex usado pelo Redator ou pelo embedding (quando a cópia falhou).",
        risk: "write",
        input: resendAiKeySchema,
        execute: async (input, context) => (await aiSource()).resendOpexAiKey(input, context.actorId),
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

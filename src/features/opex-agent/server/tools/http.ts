import { defineTool, type OpexTool } from "./define"
import { httpRequestInputSchema } from "@/features/http-request/schemas"

/**
 * Grupo `http` (OPE-130): a ferramenta "Chamada HTTP", só no dono. Decisão D6 do plano aprovado: uma
 * ferramenta para qualquer método, `risk: "write"` e **sem** confirmação por padrão (o dono liga em
 * Agente Opex › Ferramentas, e o ajuste vale também nos rotineiros). D7: sem bloqueio de endereços. O
 * grupo fica fora dos tokens de sistema (`MADDOX_TOKEN_EXCLUDED_GROUPS`). Segredos (`{{secret:NOME}}`)
 * só nos agentes rotineiros (`context.secrets`).
 */

export const HTTP_REQUEST_TOOL = "http_request"

export const httpTools: OpexTool[] = [
    defineTool({
        name: HTTP_REQUEST_TOOL,
        group: "http",
        label: "Chamada HTTP",
        risk: "write",
        description:
            "Faz uma requisição HTTP a qualquer endereço/API e devolve status, todos os cabeçalhos e o corpo. Controle completo de método, URL, query, cabeçalhos (Authorization, Cookie, User-Agent…), corpo (json, text, form, multipart com arquivos em base64, base64), tempo limite, redirecionamentos e formato da resposta. Uma resposta 4xx/5xx vem com ok=false (não é erro). Não há cookie jar: reenvie os cookies que quiser. Nos agentes rotineiros, use {{secret:NOME}} na URL, nos cabeçalhos ou no corpo para usar um segredo sem vê-lo (o valor nunca volta: aparece mascarado).",
        input: httpRequestInputSchema,
        summarize: (input) => `${input.method} ${input.url}`,
        execute: async (input, ctx) => {
            const { executeHttpRequest } = await import("@/features/http-request/execute")
            return executeHttpRequest(input, { secrets: ctx.secrets, signal: ctx.signal })
        },
    }),
]

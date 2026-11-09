import type { RoutineRunStatus, RoutineTriggerOrigin } from "./status"
import { ROUTINE_TRIGGER_ORIGIN_LABELS } from "./status"
import { DEFAULT_LIVE_WAIT_MINUTES, MAX_WEBHOOK_PAYLOAD_BYTES } from "./constants"

/**
 * Textos da execução (OPE-130, módulo PURO): instruções do sistema (obrigam a confirmação antes de
 * ações irreversíveis quando o switch está ligado) e a mensagem de cada ativação (disparo ou retomada).
 */

export interface RoutineInstructionInput {
    name: string
    objective: string
    instructions: string
    engine: "opex" | "opencode"
    confirmIrreversible: boolean
    maxLiveWaitMinutes: number | null
    memoryBlock: string
    /** Canais em que as ferramentas de memória leem e gravam (o próprio primeiro). */
    memoryChannels?: readonly string[]
    /** Prefixo das ferramentas internas no OpenCode (`rotina_xxxx_`); vazio no motor Opex. */
    toolPrefix: string
    warnings: readonly string[]
    now: Date
    /** Chamada HTTP liberada (nome da ferramenta no motor) e o catálogo dos segredos, sem valores. */
    http?: { tool: string; secrets: readonly { name: string; description: string; allowedHosts: readonly string[] }[] } | null
    /** Bloco "Skills disponíveis" (motor Opex: só as skills da seleção; o corpo vem sob demanda). */
    skillsBlock?: string
}

/** Chamada HTTP e segredos do agente: só nomes, descrições e domínios (o valor nunca vai ao modelo). */
function httpSection(http: NonNullable<RoutineInstructionInput["http"]>, engine: RoutineInstructionInput["engine"]): string {
    const lines = [
        "",
        "## Chamadas HTTP e segredos",
        `- Use ${http.tool} para chamar APIs e endereços (qualquer método, cabeçalhos e corpo).`,
        http.secrets.length
            ? "- Para usar um segredo, escreva {{secret:NOME}} na URL, num cabeçalho ou no corpo: o Opex troca pelo valor no envio e o valor volta mascarado. Nunca peça nem tente descobrir o valor."
            : "- Este agente não tem segredos cadastrados (o dono cadastra na aba Segredos da página do agente).",
        ...http.secrets.map((secret) => `  - ${secret.name}${secret.description ? ` — ${secret.description}` : ""}${secret.allowedHosts.length ? ` (só em ${secret.allowedHosts.join(", ")})` : ""}`),
    ]
    if (engine === "opencode") lines.push("- As ferramentas próprias do OpenCode (webfetch, bash) NÃO têm acesso aos segredos: use a ferramenta acima.")
    return lines.join("\n")
}

export function routineInstructions(input: RoutineInstructionInput): string {
    const t = (name: string) => `${input.toolPrefix}${name}`
    const live = input.maxLiveWaitMinutes ?? DEFAULT_LIVE_WAIT_MINUTES
    return [
        `Você é o agente rotineiro "${input.name}" do Opex: um agente autônomo que planeja e executa a solicitação SOZINHO, sem conversar com o dono (ninguém responde no meio do turno).`,
        `Data e hora atual: ${input.now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (horário de Brasília).`,
        "",
        "## Objetivo",
        input.objective,
        input.instructions.trim() ? `\n## Instruções do dono\n${input.instructions.trim()}` : "",
        "",
        "## Como trabalhar",
        "- Planeje em poucos passos e execute. Use as ferramentas liberadas; não invente resultados.",
        "- Antes de agir, consulte as memórias abaixo: não repita o que já foi feito e siga as correções do dono.",
        `- Grave com ${t("remember")} o que precisa lembrar nas próximas execuções (o que já fez, o que aprendeu)${input.memoryChannels?.length ? `, num destes canais: ${input.memoryChannels.join(", ")} (sem \`canal\`, o primeiro)` : ""}. O bloco "Memórias" abaixo é só um recorte: para consultar tudo de um canal, use ${t("list_my_memories")} (formato "titulos", seguindo o cursor) ANTES de trabalhar.`,
        `- Para manter uma entrada por item (repositório, vaga, cliente), grave sempre com a mesma \`chave\`: a entrada existente é atualizada, nunca duplicada. Para editar uma memória sem chave, use ${t("update_memory")} com o id.`,
        `- Espera curta: ${t("wait")} (espera viva, no máximo ${live} min somados por turno). Espera longa ou condição externa: ${t("hibernate")} com o motivo; a execução volta sozinha no horário e você reagenda até a condição acontecer.`,
        input.confirmIrreversible
            ? `- OBRIGATÓRIO: antes de QUALQUER ação irreversível (enviar candidatura, formulário, mensagem, pagamento, exclusão, compra), chame ${t("request_confirmation")} com o resumo exato da ação e encerre a resposta. Só execute depois de receber "Confirmado". Recusado: siga sem a ação ou conclua.${input.engine === "opencode" ? " O OpenCode não intercepta cliques no navegador: a confirmação depende de você." : ""}`
            : "- O dono liberou as ações irreversíveis: execute-as direto, com cuidado, e registre no relato.",
        `- No fim, chame ${t("finish")} com o relato final em pt-BR (o que foi feito, resultado e pendências).`,
        input.http ? httpSection(input.http, input.engine) : "",
        input.skillsBlock?.trim() ? `\n${input.skillsBlock.trim()}` : "",
        input.warnings.length ? `\n## Avisos\n${input.warnings.map((warning) => `- ${warning}`).join("\n")}` : "",
        input.memoryBlock.trim() ? `\n## Memórias\n${input.memoryBlock.trim()}` : "",
    ]
        .filter((line) => line !== "")
        .join("\n")
}

export interface ActivationMessageInput {
    kind: "start" | "resume"
    origin: RoutineTriggerOrigin
    request: string | null
    payload: unknown
    delayMs: number | null
    /** Motivo da hibernação ou resultado da confirmação (retomada). */
    resumeNote: string | null
    previousStatus?: RoutineRunStatus | null
}

const formatDelay = (ms: number) => (ms >= 3_600_000 ? `${Math.round(ms / 3_600_000)} h` : ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 1000)} s`)

/** Payload do webhook serializado e cortado (o limite de entrada já é 64 KB). */
export function payloadText(payload: unknown): string | null {
    if (payload === undefined || payload === null) return null
    const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)
    return text.length > MAX_WEBHOOK_PAYLOAD_BYTES ? `${text.slice(0, MAX_WEBHOOK_PAYLOAD_BYTES)}…` : text
}

export function activationMessage(input: ActivationMessageInput): string {
    if (input.kind === "resume") {
        return [
            `[Retomada da execução${input.delayMs && input.delayMs > 60_000 ? `, com ${formatDelay(input.delayMs)} de atraso` : ""}]`,
            input.resumeNote ?? "Continue de onde parou.",
            "Verifique a condição e siga: conclua, espere, hiberne de novo ou peça confirmação.",
        ].join("\n")
    }
    const payload = payloadText(input.payload)
    return [
        `[Execução disparada por: ${ROUTINE_TRIGGER_ORIGIN_LABELS[input.origin]}${input.delayMs && input.delayMs > 60_000 ? ` — rodando com ${formatDelay(input.delayMs)} de atraso` : ""}]`,
        input.request?.trim() ? `Solicitação desta execução:\n${input.request.trim()}` : "Sem solicitação específica: cumpra o objetivo.",
        payload ? `\nDados recebidos (payload do webhook):\n\`\`\`json\n${payload}\n\`\`\`` : "",
    ]
        .filter(Boolean)
        .join("\n")
}

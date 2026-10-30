import { z } from "zod"
import { COLUMN_COLORS } from "@/features/tasks/board"
import { DEFAULT_OPEX_TITLE_INSTRUCTIONS, OPEX_FILE_SIZE_MB_DEFAULT, OPEX_FILES_PER_MESSAGE_DEFAULT, OPEX_MESSAGE_MAX, OPEX_TITLE_MAX } from "@/features/opex-agent/constants"
import { opexFilesSettingsSchema } from "@/features/opex-agent/schemas"
import { DEFAULT_MADDOX_INSTRUCTIONS } from "./constants"

/** Modelo do catálogo do OpenCode (`provedor/modelo`) e variante; sem escolha de provedor. */
export const maddoxModelSchema = z.object({
    model: z.string().trim().max(200).nullable(),
    variant: z.string().trim().max(50).nullable(),
})
export type MaddoxModel = z.infer<typeof maddoxModelSchema>

/** Configuração do Agente Maddox — mesmo schema na tela e na API. */
export const maddoxAgentSettingsSchema = z
    .object({
        enabled: z.boolean(),
        /** Cor da paleta das colunas; `null` = primária (padrão). */
        color: z.enum(COLUMN_COLORS).nullable(),
        main: maddoxModelSchema,
        /** Subagente de título e resumo (sem modelo = usa o do agente principal). */
        title: maddoxModelSchema,
        instructions: z.string().trim().min(1, "Informe as instruções").max(12_000, "Até 12.000 caracteres"),
        titleInstructions: z.string().trim().min(1, "Informe as instruções").max(4000, "Até 4.000 caracteres"),
        /** Ferramentas do Opex **desligadas** para o Maddox (a nova nasce ligada). */
        disabledTools: z.array(z.string().trim().min(1).max(64)).max(300),
        /** Ajuste do "Pede confirmação" por ferramenta do Opex; ausente = padrão pelo risco. */
        confirmationOverrides: z.record(z.string().trim().min(1).max(64), z.boolean()),
        files: opexFilesSettingsSchema,
        /**
         * Endereço do Opex que o OpenCode usa para chamar o servidor MCP do Opex. A tela grava a origem
         * do navegador ao salvar (não é um campo editável).
         */
        mcpBaseUrl: z.string().trim().url("Endereço inválido").max(500).nullable(),
    })
    .superRefine((value, ctx) => {
        if (value.enabled && !value.main.model) ctx.addIssue({ code: "custom", path: ["main", "model"], message: "Selecione o modelo" })
    })
export type MaddoxAgentSettings = z.infer<typeof maddoxAgentSettingsSchema>

export const DEFAULT_MADDOX_AGENT_SETTINGS: MaddoxAgentSettings = {
    enabled: false,
    color: null,
    main: { model: null, variant: null },
    title: { model: null, variant: null },
    instructions: DEFAULT_MADDOX_INSTRUCTIONS,
    titleInstructions: DEFAULT_OPEX_TITLE_INSTRUCTIONS,
    disabledTools: [],
    confirmationOverrides: {},
    files: { maxPerMessage: OPEX_FILES_PER_MESSAGE_DEFAULT, maxSizeMb: OPEX_FILE_SIZE_MB_DEFAULT },
    mcpBaseUrl: null,
}

const messageText = z.string().trim().max(OPEX_MESSAGE_MAX, `Até ${OPEX_MESSAGE_MAX.toLocaleString("pt-BR")} caracteres`)

/** Nova sessão: primeira mensagem opcional e o modelo escolhido na "Nova sessão" (só desta sessão). */
export const createMaddoxSessionSchema = z.object({
    text: messageText.min(1, "Escreva uma mensagem").optional(),
    model: z.string().trim().min(1).max(200).nullable().optional(),
    variant: z.string().trim().max(50).nullable().optional(),
})
export type CreateMaddoxSessionInput = z.infer<typeof createMaddoxSessionSchema>

/** Renomear, arquivar ou trocar o modelo da sessão (`model: null` = volta ao padrão). */
export const updateMaddoxSessionSchema = z
    .object({
        title: z.string().trim().min(1, "Informe o título").max(OPEX_TITLE_MAX, `Até ${OPEX_TITLE_MAX} caracteres`).optional(),
        archived: z.boolean().optional(),
        model: z.string().trim().min(1).max(200).nullable().optional(),
        variant: z.string().trim().max(50).nullable().optional(),
    })
    .refine((value) => value.title !== undefined || value.archived !== undefined || value.model !== undefined, { message: "Nada para alterar" })
export type UpdateMaddoxSessionInput = z.infer<typeof updateMaddoxSessionSchema>

/** Resposta a uma pergunta (formulário) do OpenCode: o mesmo contrato da mesa de trabalho. */
export { formReplySchema as replyMaddoxFormSchema, type FormReplyInput as ReplyMaddoxFormInput } from "@/features/agentic/schemas"

/** Configuração do Maddox de um cliente do portal (mesmo schema na tela e na API). */
export const clientMaddoxAgentConfigSchema = z.object({
    enabled: z.boolean(),
    /** Ferramentas do portal ligadas; nomes conferidos no catálogo no servidor. */
    enabledTools: z.array(z.string().trim().min(1).max(64)).max(200),
})
export type ClientMaddoxAgentConfigInput = z.infer<typeof clientMaddoxAgentConfigSchema>

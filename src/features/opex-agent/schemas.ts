import { z } from "zod"
import { reserveChatFileSchema, type ReserveChatFileInput } from "@/lib/chat-files/kind"
import {
    DEFAULT_OPEX_INSTRUCTIONS,
    DEFAULT_OPEX_TITLE_INSTRUCTIONS,
    OPEX_FILE_SIZE_MB_DEFAULT,
    OPEX_FILE_SIZE_MB_MAX,
    OPEX_FILES_PER_MESSAGE_DEFAULT,
    OPEX_FILES_PER_MESSAGE_MAX,
    OPEX_HOST_DIRECTORIES_MAX,
    OPEX_HOST_MAX_TIMEOUT_DEFAULT_SECONDS,
    OPEX_HOST_MAX_TIMEOUT_LIMIT_SECONDS,
    OPEX_MESSAGE_MAX,
    OPEX_PROVIDER_IDS,
    OPEX_TITLE_MAX,
} from "./constants"
import { isAbsoluteHostPath } from "./host-terminal"

const providerFields = {
    provider: z.enum(OPEX_PROVIDER_IDS).nullable(),
    model: z.string().trim().max(200).nullable(),
    variant: z.string().trim().max(50).nullable(),
}

/** Provedor do agente principal (com amostragem). */
export const opexMainModelSchema = z.object({
    ...providerFields,
    temperature: z.number({ error: "Informe um número" }).min(0, "Mínimo 0").max(2, "Máximo 2").nullable(),
    maxOutputTokens: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(256, "Mínimo 256").max(65_536, "Máximo 65.536").nullable(),
})

/** Provedor do subagente de título e resumo (sem provedor = usa o do agente principal). */
export const opexTitleModelSchema = z.object(providerFields)

/** Limites dos arquivos enviados no chat. */
export const opexFilesSettingsSchema = z.object({
    maxPerMessage: z
        .number({ error: "Informe um número" })
        .int("Use um número inteiro")
        .min(1, "Mínimo 1")
        .max(OPEX_FILES_PER_MESSAGE_MAX, `Máximo ${OPEX_FILES_PER_MESSAGE_MAX}`),
    maxSizeMb: z
        .number({ error: "Informe um número" })
        .min(0.1, "Mínimo 0,1 MB")
        .max(OPEX_FILE_SIZE_MB_MAX, `Máximo ${OPEX_FILE_SIZE_MB_MAX} MB (limite dos anexos de tarefa)`),
})
export type OpexFilesSettings = z.infer<typeof opexFilesSettingsSchema>

/** Terminal do host: diretórios permitidos (vazio = livre) e tempo máximo de um comando. */
export const opexHostSettingsSchema = z.object({
    allowedDirectories: z
        .array(
            z
                .string()
                .trim()
                .min(1, "Informe o diretório")
                .max(500, "Caminho muito longo")
                .refine(isAbsoluteHostPath, "Use um caminho absoluto (começa com /)"),
        )
        .max(OPEX_HOST_DIRECTORIES_MAX, `Até ${OPEX_HOST_DIRECTORIES_MAX} diretórios`),
    maxTimeoutSeconds: z
        .number({ error: "Informe um número" })
        .int("Use um número inteiro")
        .min(5, "Mínimo 5 s")
        .max(OPEX_HOST_MAX_TIMEOUT_LIMIT_SECONDS, `Máximo ${OPEX_HOST_MAX_TIMEOUT_LIMIT_SECONDS} s`),
})
export type OpexHostSettings = z.infer<typeof opexHostSettingsSchema>

/** Configuração do Agente Opex — mesmo schema na tela e na API. */
export const opexAgentSettingsSchema = z
    .object({
        enabled: z.boolean(),
        main: opexMainModelSchema,
        title: opexTitleModelSchema,
        instructions: z.string().trim().min(1, "Informe as instruções").max(12_000, "Até 12.000 caracteres"),
        titleInstructions: z.string().trim().min(1, "Informe as instruções").max(4000, "Até 4.000 caracteres"),
        /** Ferramentas **desligadas** (a nova nasce ligada); nomes conferidos no catálogo no servidor. */
        disabledTools: z.array(z.string().trim().min(1).max(64)).max(300),
        /** Ajuste por ferramenta (pede ou não confirmação); ausente = padrão pelo risco (só destrutivas). */
        confirmationOverrides: z.record(z.string().trim().min(1).max(64), z.boolean()),
        files: opexFilesSettingsSchema,
        host: opexHostSettingsSchema,
    })
    .superRefine((value, ctx) => {
        if (value.title.provider && !value.title.model) ctx.addIssue({ code: "custom", path: ["title", "model"], message: "Selecione o modelo" })
        if (!value.enabled) return
        if (!value.main.provider) ctx.addIssue({ code: "custom", path: ["main", "provider"], message: "Selecione o provedor" })
        if (!value.main.model) ctx.addIssue({ code: "custom", path: ["main", "model"], message: "Selecione o modelo" })
    })

export type OpexAgentSettings = z.infer<typeof opexAgentSettingsSchema>
export type OpexMainModel = z.infer<typeof opexMainModelSchema>
export type OpexTitleModel = z.infer<typeof opexTitleModelSchema>

export const DEFAULT_OPEX_AGENT_SETTINGS: OpexAgentSettings = {
    enabled: false,
    main: { provider: null, model: null, variant: null, temperature: null, maxOutputTokens: null },
    title: { provider: null, model: null, variant: null },
    instructions: DEFAULT_OPEX_INSTRUCTIONS,
    titleInstructions: DEFAULT_OPEX_TITLE_INSTRUCTIONS,
    disabledTools: [],
    confirmationOverrides: {},
    files: { maxPerMessage: OPEX_FILES_PER_MESSAGE_DEFAULT, maxSizeMb: OPEX_FILE_SIZE_MB_DEFAULT },
    host: { allowedDirectories: [], maxTimeoutSeconds: OPEX_HOST_MAX_TIMEOUT_DEFAULT_SECONDS },
}

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Id inválido")
const messageText = z.string().trim().max(OPEX_MESSAGE_MAX, `Até ${OPEX_MESSAGE_MAX.toLocaleString("pt-BR")} caracteres`)

/** Mensagem: texto, arquivos enviados antes (reserva + PUT + confirmação) ou os dois. */
export const sendOpexMessageSchema = z
    .object({
        text: messageText.default(""),
        fileIds: z.array(objectId).max(OPEX_FILES_PER_MESSAGE_MAX, `Até ${OPEX_FILES_PER_MESSAGE_MAX} arquivos`).default([]),
    })
    .refine((value) => value.text.length > 0 || value.fileIds.length > 0, { message: "Escreva uma mensagem ou anexe um arquivo", path: ["text"] })
export type SendOpexMessageInput = z.infer<typeof sendOpexMessageSchema>

export const createOpexSessionSchema = z.object({
    text: messageText.min(1, "Escreva uma mensagem").optional(),
})

export const updateOpexSessionSchema = z
    .object({
        title: z.string().trim().min(1, "Informe o título").max(OPEX_TITLE_MAX, `Até ${OPEX_TITLE_MAX} caracteres`).optional(),
        archived: z.boolean().optional(),
    })
    .refine((value) => value.title !== undefined || value.archived !== undefined, { message: "Nada para alterar" })

/** Configuração do Agente Opex de um cliente do portal (mesmo schema na tela e na API). */
export const clientOpexAgentConfigSchema = z.object({
    enabled: z.boolean(),
    /** Ferramentas ligadas; nomes são validados contra o catálogo no servidor. */
    enabledTools: z.array(z.string().trim().min(1).max(64)).max(200),
})
export type ClientOpexAgentConfigInput = z.infer<typeof clientOpexAgentConfigSchema>

export const decideOpexActionSchema = z.object({
    decision: z.enum(["confirm", "cancel"]),
})

/**
 * Reserva de um arquivo do chat: o navegador declara nome, tamanho e tipo; o servidor confere os
 * limites e devolve a URL assinada do PUT direto no storage. O tamanho é conferido de novo na
 * confirmação (a URL assinada não impõe limite).
 */
export const reserveOpexFileSchema = reserveChatFileSchema
export type ReserveOpexFileInput = ReserveChatFileInput

/** Título e resumo devolvidos pelo subagente (cortados ao limite depois de validar). */
export const opexTitleOutputSchema = z.object({
    title: z.string().trim().min(1),
    summary: z.string().trim(),
})

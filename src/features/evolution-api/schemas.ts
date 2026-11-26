import { z } from "zod"

/** Schemas das rotas da integração Evolution API (os mesmos na tela e no servidor). */

/** Nome de instância aceito pela Evolution (letras, números, `-`, `_`, `.`). */
export const instanceNameSchema = z
    .string({ error: "Informe o nome da instância" })
    .trim()
    .min(2, "Mínimo de 2 caracteres")
    .max(60, "Máximo de 60 caracteres")
    .regex(/^[A-Za-z0-9._-]+$/, "Use só letras, números, ponto, hífen e sublinhado")

export const createInstanceSchema = z.object({ name: instanceNameSchema })
export type CreateInstanceInput = z.infer<typeof createInstanceSchema>

export const selectInstanceSchema = z.object({ name: instanceNameSchema })

/** Número com DDI (só dígitos depois de limpar). */
export const phoneNumberSchema = z
    .string({ error: "Informe o número" })
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().min(10, "Informe o número com DDI e DDD (ex.: 5531999999999)").max(15, "Número longo demais"))

export const connectInstanceSchema = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("qr") }),
    z.object({ mode: z.literal("pairing"), number: phoneNumberSchema }),
])
export type ConnectInstanceInput = z.infer<typeof connectInstanceSchema>

export const instanceOptionsSchema = z.object({
    rejectCall: z.boolean(),
    groupsIgnore: z.boolean(),
    alwaysOnline: z.boolean(),
    syncFullHistory: z.boolean(),
    readStatus: z.boolean(),
})
export type InstanceOptionsInput = z.infer<typeof instanceOptionsSchema>

export const webhookUrlSchema = z.object({
    url: z.url({ error: "Informe uma URL http(s) válida" }).refine((value) => /^https?:\/\//.test(value), "Use http:// ou https://"),
})
export type WebhookUrlInput = z.infer<typeof webhookUrlSchema>

export const sendTestSchema = z.object({
    number: phoneNumberSchema,
    text: z.string().trim().min(1, "Escreva a mensagem").max(4000, "Máximo de 4000 caracteres"),
})
export type SendTestInput = z.infer<typeof sendTestSchema>

export const checkNumberSchema = z.object({ number: phoneNumberSchema })
export type CheckNumberInput = z.infer<typeof checkNumberSchema>

export const contactKindSchema = z.enum(["contacts", "groups", "chats"])
export type ContactKind = z.infer<typeof contactKindSchema>

/**
 * Envio pela aba Conversas do Secretário (OPE-197): texto, reação, localização e contato em JSON (o mesmo schema na
 * tela e na rota). Foto, vídeo, documento e voz vão em `multipart/form-data` (`chatMediaFieldsSchema`).
 */
const messageIdSchema = z.string().trim().min(1).max(200)
const quotedIdSchema = messageIdSchema.optional()
export const chatLocationSchema = z.object({
    type: z.literal("location"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    name: z.string().trim().max(200, "Máximo de 200 caracteres").optional(),
    address: z.string().trim().max(300, "Máximo de 300 caracteres").optional(),
    quotedId: quotedIdSchema,
})
export const chatTextSchema = z.object({ type: z.literal("text"), text: z.string().trim().min(1, "Escreva a mensagem").max(4096, "Máximo de 4096 caracteres"), quotedId: quotedIdSchema })
export const chatSendSchema = z.discriminatedUnion("type", [
    chatTextSchema,
    z.object({ type: z.literal("reaction"), messageId: messageIdSchema, fromMe: z.boolean(), emoji: z.string().max(16) }),
    chatLocationSchema,
    z.object({
        type: z.literal("contact"),
        contacts: z.array(z.object({ name: z.string().trim().min(1, "Informe o nome").max(120), number: phoneNumberSchema })).min(1, "Escolha um contato").max(10),
        quotedId: quotedIdSchema,
    }),
])
export type ChatSendInput = z.infer<typeof chatSendSchema>

/** Campos do multipart de mídia (o arquivo vem em `file`). */
export const chatMediaFieldsSchema = z.object({
    voice: z.enum(["0", "1"]).optional().transform((value) => value === "1"),
    caption: z.string().trim().max(1024, "Legenda de no máximo 1024 caracteres").optional(),
    quotedId: quotedIdSchema,
})
export type ChatMediaFields = z.infer<typeof chatMediaFieldsSchema>

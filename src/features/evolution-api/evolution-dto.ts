import { z } from "zod"

/**
 * Formatos da Evolution API v2.3.8 (`src/api/dto`, `whatsapp.baileys.service.ts`) — só o que o Opex usa.
 * Tolerantes (`loose`): a Evolution acrescenta campos entre versões e o Opex ignora o resto.
 */

const str = z.string().nullish()

export const evolutionInfoSchema = z.looseObject({ status: z.number().optional(), message: str, version: str, clientName: str, manager: str })
export type EvolutionInfo = z.infer<typeof evolutionInfoSchema>

/** `GET /instance/fetchInstances` (2.3.8: lista de instâncias com `name`, `connectionStatus`, perfil e `Setting`). */
export const evolutionInstanceSchema = z.looseObject({
    id: str,
    name: z.string(),
    connectionStatus: str,
    ownerJid: str,
    profileName: str,
    profilePicUrl: str,
    number: str,
    integration: str,
})
export type EvolutionInstance = z.infer<typeof evolutionInstanceSchema>
export const evolutionInstancesSchema = z.array(evolutionInstanceSchema)

/** `GET /instance/connect/{instance}[?number=]`: QR (`base64`, `code`) e/ou código de pareamento. */
export const evolutionConnectSchema = z.looseObject({ pairingCode: str, code: str, base64: str, count: z.number().nullish() })
export type EvolutionConnect = z.infer<typeof evolutionConnectSchema>

/** `GET /instance/connectionState/{instance}`. */
export const evolutionConnectionStateSchema = z.looseObject({ instance: z.looseObject({ instanceName: str, state: str }) })

export const evolutionSettingsSchema = z.looseObject({
    rejectCall: z.boolean().nullish(),
    msgCall: str,
    groupsIgnore: z.boolean().nullish(),
    alwaysOnline: z.boolean().nullish(),
    readMessages: z.boolean().nullish(),
    readStatus: z.boolean().nullish(),
    syncFullHistory: z.boolean().nullish(),
})
export type EvolutionSettings = z.infer<typeof evolutionSettingsSchema>

export const evolutionWebhookSchema = z.looseObject({
    enabled: z.boolean().nullish(),
    url: str,
    events: z.array(z.string()).nullish(),
    webhookByEvents: z.boolean().nullish(),
    webhookBase64: z.boolean().nullish(),
})
export type EvolutionWebhook = z.infer<typeof evolutionWebhookSchema>

export const evolutionMessageKeySchema = z.looseObject({
    id: z.string(),
    remoteJid: z.string(),
    fromMe: z.boolean().optional().default(false),
    participant: str,
    remoteJidAlt: str,
    participantAlt: str,
})
export type EvolutionMessageKey = z.infer<typeof evolutionMessageKeySchema>

/** Mensagem como a Evolution guarda e repassa (`prepareMessage`). */
export const evolutionMessageSchema = z.looseObject({
    key: evolutionMessageKeySchema,
    pushName: str,
    message: z.record(z.string(), z.unknown()).nullish(),
    contextInfo: z.record(z.string(), z.unknown()).nullish(),
    messageType: str,
    messageTimestamp: z.union([z.number(), z.string()]).nullish(),
    source: str,
})
export type EvolutionMessage = z.infer<typeof evolutionMessageSchema>

/** `POST /chat/findMessages/{instance}`. */
export const evolutionMessagesPageSchema = z.looseObject({
    messages: z.looseObject({ total: z.number().optional().default(0), pages: z.number().optional().default(0), currentPage: z.number().optional().default(1), records: z.array(z.unknown()).optional().default([]) }),
})

export const evolutionContactSchema = z.looseObject({ remoteJid: z.string(), pushName: str, profilePicUrl: str })
export type EvolutionContact = z.infer<typeof evolutionContactSchema>

export const evolutionChatSchema = z.looseObject({
    remoteJid: z.string(),
    pushName: str,
    name: str,
    profilePicUrl: str,
    updatedAt: str,
    unreadMessages: z.number().nullish(),
})
export type EvolutionChat = z.infer<typeof evolutionChatSchema>

export const evolutionGroupSchema = z.looseObject({ id: z.string(), subject: str, pictureUrl: str, size: z.number().nullish() })
export type EvolutionGroup = z.infer<typeof evolutionGroupSchema>

/** `POST /chat/whatsappNumbers/{instance}`. */
export const evolutionNumberCheckSchema = z.array(z.looseObject({ exists: z.boolean(), jid: str, number: z.string(), name: str }))
export type EvolutionNumberCheck = z.infer<typeof evolutionNumberCheckSchema>[number]

/** `POST /message/sendText/{instance}` devolve a mensagem enviada (com a chave). */
export const evolutionSentSchema = z.looseObject({ key: evolutionMessageKeySchema })

export const evolutionBase64Schema = z.looseObject({ base64: z.string(), mimetype: str, fileName: str })

export const evolutionPictureSchema = z.looseObject({ profilePictureUrl: str, wuid: str })

/** Corpo do webhook (`webhook.controller.ts`, `emit`): o `apikey` vem junto e NUNCA é logado nem gravado. */
export const evolutionWebhookBodySchema = z.object({
    event: z.string(),
    instance: z.string(),
    data: z.unknown(),
    date_time: str,
    sender: str,
})
export type EvolutionWebhookBody = z.infer<typeof evolutionWebhookBodySchema>

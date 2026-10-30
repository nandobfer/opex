import { z } from "zod"
import { AI_PROVIDER_IDS, AI_TEXT_PROVIDER_IDS } from "@/lib/ai/providers"
import { MEMORY_TEXT_MAX } from "@/features/ai/schemas"
import {
    DEFAULT_MENTOR_WRITER_INSTRUCTIONS,
    MENTOR_AI_STAGES,
    MENTOR_LEVELS,
    MENTOR_SAVE_MODES,
    MENTOR_TARGETS,
    MENTOR_TIMEOUT_DEFAULT,
    MENTOR_TIMEOUT_MAX,
    MENTOR_TIMEOUT_MIN,
    MENTOR_USER_TRIGGERS,
    type MentorAiStage,
    type MentorTarget,
    type MentorUserTrigger,
} from "./constants"

const flags = <K extends string>(keys: readonly K[]) => z.object(Object.fromEntries(keys.map((key) => [key, z.boolean()])) as Record<K, z.ZodBoolean>)

const modelFields = {
    model: z.string().trim().max(200).nullable(),
    variant: z.string().trim().max(50).nullable(),
}

/** O que entra no estado do decisor e do redator (as memórias existentes sempre vão ao redator). */
export const mentorContextSchema = z.object({
    userMessage: z.boolean(),
    agentResponse: z.boolean(),
    developerRequest: z.boolean(),
    taskBasics: z.boolean(),
    adversarialVerdict: z.boolean(),
    approvedPlan: z.boolean(),
})
export type MentorContext = z.infer<typeof mentorContextSchema>

/** Configuração do Agente Mentor — mesmo schema na tela e na API. */
export const mentorSettingsSchema = z
    .object({
        enabled: z.boolean(),
        scope: z.object({
            all: z.boolean(),
            centralIds: z.array(z.string().trim().min(1).max(40)).max(200),
        }),
        triggers: z.object({
            user: flags(MENTOR_USER_TRIGGERS),
            ai: flags(MENTOR_AI_STAGES),
            developer: z.object({
                enabled: z.boolean(),
                stages: flags(MENTOR_AI_STAGES),
                /** Pedido do desenvolvedor vai direto ao redator (sem nota do decisor). */
                skipDecider: z.boolean(),
            }),
        }),
        /** Decide se vale gravar: JEV (pergunta `noul`) ou qualquer provedor de texto (JSON com a nota). */
        decider: z.object({ provider: z.enum(AI_PROVIDER_IDS).nullable(), ...modelFields }),
        level: z.enum(MENTOR_LEVELS),
        /** Triador (OPE-97): escolhe a lista de destino — JEV (pergunta `choice`) ou qualquer provedor de texto. */
        router: z.object({
            provider: z.enum(AI_PROVIDER_IDS).nullable(),
            ...modelFields,
            instructions: z.string().trim().max(8000, "Até 8.000 caracteres"),
        }),
        /** Listas em que o Mentor pode gravar (ao menos uma). */
        targets: flags(MENTOR_TARGETS),
        /** Escreve a regra genérica e decide entre criar, atualizar (fundir) ou não gravar. */
        writer: z.object({
            provider: z.enum(AI_TEXT_PROVIDER_IDS).nullable(),
            ...modelFields,
            instructions: z.string().trim().max(8000, "Até 8.000 caracteres"),
        }),
        saveMode: z.enum(MENTOR_SAVE_MODES),
        timeoutSeconds: z
            .number({ error: "Informe um número" })
            .int("Use um número inteiro")
            .min(MENTOR_TIMEOUT_MIN, `Mínimo ${MENTOR_TIMEOUT_MIN}`)
            .max(MENTOR_TIMEOUT_MAX, `Máximo ${MENTOR_TIMEOUT_MAX}`),
        context: mentorContextSchema,
    })
    .superRefine((value, ctx) => {
        if (value.decider.provider && !value.decider.model) ctx.addIssue({ code: "custom", path: ["decider", "model"], message: "Selecione o modelo" })
        if (value.writer.provider && !value.writer.model) ctx.addIssue({ code: "custom", path: ["writer", "model"], message: "Selecione o modelo" })
        if (value.router.provider && !value.router.model) ctx.addIssue({ code: "custom", path: ["router", "model"], message: "Selecione o modelo" })
        const targets = enabledTargets(value.targets)
        if (!targets.length) ctx.addIssue({ code: "custom", path: ["targets"], message: "Escolha ao menos um destino" })
        if (!value.enabled) return
        if (targets.length > 1 && !value.router.provider) ctx.addIssue({ code: "custom", path: ["router", "provider"], message: "Escolha o provedor do Triador" })
        if (!value.decider.provider) ctx.addIssue({ code: "custom", path: ["decider", "provider"], message: "Escolha o provedor do decisor" })
        if (!value.writer.provider) ctx.addIssue({ code: "custom", path: ["writer", "provider"], message: "Escolha o provedor do redator" })
        if (!value.scope.all && !value.scope.centralIds.length) ctx.addIssue({ code: "custom", path: ["scope", "centralIds"], message: "Escolha ao menos uma central" })
    })
export type MentorSettings = z.infer<typeof mentorSettingsSchema>

/** Destinos ligados, na ordem do catálogo. */
export function enabledTargets(targets: Record<MentorTarget, boolean>): MentorTarget[] {
    return MENTOR_TARGETS.filter((target) => targets[target])
}

const allUser = (value: boolean) => Object.fromEntries(MENTOR_USER_TRIGGERS.map((key) => [key, value])) as Record<MentorUserTrigger, boolean>

export const DEFAULT_MENTOR_SETTINGS: MentorSettings = {
    enabled: false,
    scope: { all: true, centralIds: [] },
    triggers: {
        user: allUser(true),
        ai: { planning: false, implementing: false } satisfies Record<MentorAiStage, boolean>,
        developer: { enabled: true, stages: { planning: false, implementing: true }, skipDecider: false },
    },
    decider: { provider: null, model: null, variant: null },
    level: "balanced",
    router: { provider: null, model: null, variant: null, instructions: "" },
    targets: { adversarial: true, "developer-global": true, "developer-central": true },
    writer: { provider: null, model: null, variant: null, instructions: DEFAULT_MENTOR_WRITER_INSTRUCTIONS },
    saveMode: "direct",
    timeoutSeconds: MENTOR_TIMEOUT_DEFAULT,
    context: { userMessage: true, agentResponse: true, developerRequest: true, taskBasics: true, adversarialVerdict: true, approvedPlan: false },
}

/** Bloco `opex-lesson` que o agente desenvolvedor escreve no fim da resposta para pedir uma memória. */
export const lessonBlockSchema = z.object({
    problem: z.string().trim().min(3, "Descreva o problema").max(4000),
    shouldHaveCaught: z.string().trim().min(3, "Diga o que o revisor deveria ter pego").max(4000),
    evidence: z.string().trim().max(4000).optional(),
    why: z.string().trim().min(3, "Diga por que vale como regra").max(2000),
})
export type LessonBlock = z.infer<typeof lessonBlockSchema>

/** Aprovar uma sugestão (o texto pode ser editado antes). */
export const mentorApproveSchema = z.object({
    text: z.string().trim().min(3, "Escreva a memória").max(MEMORY_TEXT_MAX, `Até ${MEMORY_TEXT_MAX.toLocaleString("pt-BR")} caracteres`).optional(),
    /** Lista de destino (trocar antes de aprovar; ausente = a escolhida pelo Triador). */
    target: z.enum(MENTOR_TARGETS).optional(),
})
export type MentorApproveInput = z.infer<typeof mentorApproveSchema>

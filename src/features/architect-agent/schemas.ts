import { z } from "zod"
import { agentConfigSchema } from "@/features/agentic/schemas"
import { ARCHITECT_DEPTH_DEFAULT, ARCHITECT_NODE_KINDS, ARCHITECT_TIMEOUT_DEFAULT, ARCHITECT_TIMEOUT_MAX, ARCHITECT_TIMEOUT_MIN, ARCHITECT_TRIGGERS, ARCHITECT_VIEWS, type ArchitectDepth } from "./constants"

const int = (min: number, max: number) =>
    z
        .number({ error: "Informe um número" })
        .int("Use um número inteiro")
        .min(min, `Mínimo ${min}`)
        .max(max, `Máximo ${max}`)

export const architectDepthSchema = int(1, 5).transform((value) => value as ArchitectDepth)

/** Como o diagrama é exibido (padrões da aba da mesa). */
export const architectDiagramSettingsSchema = z.object({
    depth: int(1, 5),
    nodeKinds: z.array(z.enum(ARCHITECT_NODE_KINDS)).min(1, "Escolha ao menos um tipo de nó"),
    showFiles: z.boolean(),
    showNotes: z.boolean(),
    defaultView: z.enum(ARCHITECT_VIEWS),
})
export type ArchitectDiagramSettings = z.infer<typeof architectDiagramSettingsSchema>

/** Configuração do Agente Arquiteto — mesmo schema na tela e na API. */
export const architectSettingsSchema = z
    .object({
        enabled: z.boolean(),
        trigger: z.enum(ARCHITECT_TRIGGERS),
        scope: z.object({
            all: z.boolean(),
            centralIds: z.array(z.string().trim().min(1).max(40)).max(200),
        }),
        /** Sempre OpenCode: agente, modelo, variante e modelos de fallback. */
        agent: agentConfigSchema,
        timeoutMinutes: int(ARCHITECT_TIMEOUT_MIN, ARCHITECT_TIMEOUT_MAX),
        instructions: z.string().trim().max(8000, "Até 8.000 caracteres"),
        diagram: architectDiagramSettingsSchema,
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.agent.model) ctx.addIssue({ code: "custom", path: ["agent", "model"], message: "Selecione o modelo" })
        if (!value.scope.all && !value.scope.centralIds.length) ctx.addIssue({ code: "custom", path: ["scope", "centralIds"], message: "Escolha ao menos uma central" })
    })
export type ArchitectSettings = z.infer<typeof architectSettingsSchema>

export const DEFAULT_ARCHITECT_SETTINGS: ArchitectSettings = {
    enabled: false,
    trigger: "auto",
    scope: { all: true, centralIds: [] },
    agent: { agent: null, model: null, variant: null, fallbacks: [] },
    timeoutMinutes: ARCHITECT_TIMEOUT_DEFAULT,
    instructions: "",
    diagram: { depth: ARCHITECT_DEPTH_DEFAULT, nodeKinds: [...ARCHITECT_NODE_KINDS], showFiles: true, showNotes: true, defaultView: "architecture" },
}

/** "Gerar arquitetura" / "Pedir ajustes" na aba da mesa. */
export const architectGenerateSchema = z.object({
    depth: int(1, 5).optional(),
    /** Pedido de ajuste (usa o grafo de `baseDiagramId` como contexto). */
    feedback: z.string().trim().min(3, "Descreva o ajuste (mínimo 3 caracteres)").max(4000, "Até 4.000 caracteres").optional(),
    baseDiagramId: z.string().regex(/^[a-f0-9]{24}$/i, "Versão inválida").optional(),
})
export type ArchitectGenerateInput = z.infer<typeof architectGenerateSchema>

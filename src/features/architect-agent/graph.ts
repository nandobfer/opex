import { z } from "zod"
import { ARCHITECT_NODE_DETAIL_MAX, ARCHITECT_EDGE_KINDS, ARCHITECT_GROUP_LAYERS, ARCHITECT_NODE_KINDS, ARCHITECT_NODE_STATUSES, ARCHITECT_NOTE_KINDS } from "./constants"

/**
 * Grafo semântico do Agente Arquiteto (módulo PURO): o mesmo schema valida o que o servidor grava e o
 * que a tela desenha. O modelo responde num formato tolerante (`rawGraphSchema`); o saneamento
 * (`sanitize.ts`) o converte neste formato estrito.
 */

const id = z.string().trim().min(1).max(80)
const text = (max: number) => z.string().trim().max(max)

export const architectGroupSchema = z.object({
    id,
    label: text(80).min(1),
    layer: z.enum(ARCHITECT_GROUP_LAYERS),
    detail: text(600),
})

export const architectNodeSchema = z.object({
    id,
    label: text(120).min(1),
    groupId: id.nullable(),
    kind: z.enum(ARCHITECT_NODE_KINDS),
    detail: text(ARCHITECT_NODE_DETAIL_MAX),
    files: z.array(text(300).min(1)).max(20),
    status: z.enum(ARCHITECT_NODE_STATUSES),
})

export const architectEdgeSchema = z.object({
    id,
    source: id,
    target: id,
    label: text(80).nullable(),
    kind: z.enum(ARCHITECT_EDGE_KINDS),
})

export const architectNoteSchema = z.object({
    kind: z.enum(ARCHITECT_NOTE_KINDS),
    text: text(1000).min(1),
})

export const architectGraphSchema = z.object({
    title: text(160),
    summary: text(2000),
    groups: z.array(architectGroupSchema).max(40),
    nodes: z.array(architectNodeSchema).min(1).max(120),
    edges: z.array(architectEdgeSchema).max(200),
    notes: z.array(architectNoteSchema).max(40),
})

export type ArchitectGroup = z.infer<typeof architectGroupSchema>
export type ArchitectNode = z.infer<typeof architectNodeSchema>
export type ArchitectEdge = z.infer<typeof architectEdgeSchema>
export type ArchitectNote = z.infer<typeof architectNoteSchema>
export type ArchitectGraph = z.infer<typeof architectGraphSchema>

/** Resposta do modelo antes do saneamento: só exige a lista de nós; itens inválidos caem no saneamento. */
export const rawGraphSchema = z.object({
    title: z.unknown().optional(),
    summary: z.unknown().optional(),
    groups: z.array(z.unknown()).optional(),
    nodes: z.array(z.unknown()).min(1, "a lista `nodes` veio vazia"),
    edges: z.array(z.unknown()).optional(),
    notes: z.array(z.unknown()).optional(),
})
export type RawGraph = z.infer<typeof rawGraphSchema>

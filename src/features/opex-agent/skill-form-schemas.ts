import { z } from "zod"
import { opexSkillCreateSchema, opexSkillDescriptionSchema, opexSkillFilePathSchema, opexSkillNameSchema, type OpexSkillCreateInput, type OpexSkillDetailDto, type OpexSkillUpdateInput } from "./skills"

/**
 * Formulário da skill do Opex (criar/editar), montado dos MESMOS schemas da API (`skills.ts`) para a
 * validação em tempo real bater com a do servidor. Arquivos de apoio existentes chegam sem o conteúdo
 * (`content: null` = não alterado); o conteúdo é carregado só ao editar aquele arquivo. Módulo puro.
 */

export const opexSkillFormFileSchema = z.object({
    path: opexSkillFilePathSchema,
    /** `null` = arquivo existente não alterado (conteúdo não carregado). */
    content: z.string().nullable(),
    existing: z.boolean(),
    binary: z.boolean(),
    size: z.number(),
})
export type OpexSkillFormFile = z.infer<typeof opexSkillFormFileSchema>

const formBase = z.object({
    name: opexSkillNameSchema,
    description: opexSkillDescriptionSchema,
    body: opexSkillCreateSchema.shape.body,
    files: z.array(opexSkillFormFileSchema),
    /** Arquivos existentes removidos no formulário. */
    removed: z.array(z.string()),
})
export type OpexSkillFormValues = z.infer<typeof formBase>

/** Nome único entre as skills do Opex (na criação) e caminhos sem repetição. */
export function opexSkillFormSchema(takenNames: readonly string[] = []) {
    const taken = new Set(takenNames)
    return formBase.superRefine((value, ctx) => {
        if (taken.has(value.name)) ctx.addIssue({ code: "custom", path: ["name"], message: `Já existe uma skill com o nome "${value.name}" no Opex` })
        const seen = new Set<string>()
        value.files.forEach((file, index) => {
            if (seen.has(file.path)) ctx.addIssue({ code: "custom", path: ["files", index, "path"], message: "Caminho repetido" })
            seen.add(file.path)
        })
    })
}

export const EMPTY_OPEX_SKILL_FORM: OpexSkillFormValues = { name: "", description: "", body: "", files: [], removed: [] }

export function formOfSkill(skill: OpexSkillDetailDto): OpexSkillFormValues {
    return { name: skill.name, description: skill.description, body: skill.body, files: skill.files.map((file) => ({ path: file.path, content: null, existing: true, binary: file.binary, size: file.size })), removed: [] }
}

export function createInputOf(values: OpexSkillFormValues): OpexSkillCreateInput {
    const files = values.files.filter((file) => file.content !== null).map((file) => ({ path: file.path, content: file.content ?? "" }))
    return { name: values.name, description: values.description, body: values.body, ...(files.length ? { files } : {}) }
}

/** Só as mudanças: arquivos novos/alterados com o texto, removidos com `null`; os demais ficam. */
export function updateInputOf(values: OpexSkillFormValues): OpexSkillUpdateInput {
    const changed = values.files.filter((file) => file.content !== null).map((file) => ({ path: file.path, content: file.content }))
    const kept = new Set(values.files.map((file) => file.path))
    const removed = values.removed.filter((path) => !kept.has(path)).map((path) => ({ path, content: null }))
    const files = [...changed, ...removed]
    return { description: values.description, body: values.body, ...(files.length ? { files } : {}) }
}

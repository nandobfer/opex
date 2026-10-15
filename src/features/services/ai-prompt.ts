import { z } from "zod"
import { SERVICE_SUMMARY_MAX, SERVICE_TITLE_MAX } from "./constants"

/**
 * Entrada da geração por IA de um serviço (módulo PURO): instruções (prompt de sistema + contrato
 * JSON), prompt com o serviço e o parser tolerante da saída. O serviço não tem tarefa/rascunho, então
 * a IA produz o **título**, o **resumo** e as **tags** (estas pela feature "Tags de tarefas").
 */

export interface ServiceAiInput {
    code: string
    projectName: string | null
    serviceDate: string
    description: string
}

/** Instruções de sistema: prompt configurado + contrato de saída JSON. */
export function buildServiceAiInstructions(instructions: string): string {
    const contract = [
        "Responda APENAS com um objeto JSON válido, sem texto antes ou depois e sem cercas de código, com exatamente estas chaves:",
        `- "title": título curto do serviço, em português do Brasil (no máximo ${SERVICE_TITLE_MAX} caracteres);`,
        `- "summary": resumo de UMA linha do serviço, em português do Brasil (no máximo ${SERVICE_SUMMARY_MAX} caracteres).`,
    ].join("\n")
    return `${instructions.trim()}\n\n${contract}`
}

function clip(text: string, max = 6000): string {
    const value = text.trim()
    return value.length > max ? `${value.slice(0, max)}… (cortado)` : value
}

export function buildServiceAiPrompt(input: ServiceAiInput): string {
    const facts = [`- Código: ${input.code}`, `- Data: ${input.serviceDate}`, input.projectName && `- Repositório: ${input.projectName}`].filter(Boolean)
    return [`# Serviço ${input.code}`, facts.join("\n"), `## Descrição\n${clip(input.description)}`, "Descreva o serviço em um título curto e um resumo de uma linha."].join("\n\n")
}

const responseSchema = z.object({
    title: z.string().trim().max(SERVICE_TITLE_MAX).nullish(),
    summary: z.string().trim().max(SERVICE_SUMMARY_MAX).nullish(),
})

/** Extrai o primeiro objeto JSON do texto (aceita cercas de código ```json). */
function extractJsonObject(text: string): string | null {
    const segments = text.includes("```") ? text.split("```") : [text]
    for (const segment of segments) {
        const start = segment.indexOf("{")
        const end = segment.lastIndexOf("}")
        if (start !== -1 && end > start) return segment.slice(start, end + 1)
    }
    return null
}

/** Valida a saída e devolve `{ title, summary }`; `null` quando o JSON for inválido. */
export function parseServiceAi(text: string): { title: string | null; summary: string | null } | null {
    const json = extractJsonObject(text)
    if (!json) return null
    try {
        const parsed = responseSchema.safeParse(JSON.parse(json))
        if (!parsed.success) return null
        return { title: parsed.data.title?.trim() || null, summary: parsed.data.summary?.trim() || null }
    } catch {
        return null
    }
}

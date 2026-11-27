import { z } from "zod"
import { PDF_FORMATS, PDF_ORIENTATIONS } from "@/lib/pdf/pages"
import { AGENT_DOCUMENT_LIMITS as L, PDF_DEFAULT_MIN_SCALE, PDF_MIN_SCALE_FLOOR, URL_TTL_SIGV4_MAX_MINUTES } from "./constants"

/**
 * Entradas das ferramentas de documentos (OPE-210, módulo PURO). As ferramentas e o motor usam os
 * mesmos schemas. Os limites de tamanho do conteúdo (HTML, base64) são conferidos no motor, com
 * mensagem em pt-BR que informa o tamanho recebido.
 */

export const agentFileIdSchema = z.string().regex(/^[a-f0-9]{24}$/, "Id inválido: use o id devolvido pelas ferramentas de documentos")

export const metadataSchema = z
    .record(z.string().regex(new RegExp(`^[A-Za-z0-9_.-]{1,${L.metadataKeyChars}}$`), `Chave de metadado inválida (letras, números, _ . -, até ${L.metadataKeyChars})`), z.string().max(L.metadataValueChars))
    .refine((value) => Object.keys(value).length <= L.metadataKeys, `No máximo ${L.metadataKeys} metadados`)
    .describe("Metadados livres para achar o arquivo depois (ex.: { empresa, vaga, jobId })")

export const fileNameSchema = z.string().trim().min(1).max(120).describe("Nome do arquivo (com ou sem extensão)")
export const mimeTypeSchema = z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i, "Tipo inválido (ex.: text/plain, application/pdf)")
    .describe("Tipo MIME (ex.: application/pdf, text/plain, image/png)")
export const ttlMinutesSchema = z.number().int().min(1).max(URL_TTL_SIGV4_MAX_MINUTES).optional().describe("Validade das URLs em minutos (padrão da integração; limitada à máxima)")

const dateSchema = z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), "Data inválida (use AAAA-MM-DD ou ISO)")

export const agentFileFiltersSchema = z.object({
    origem: z
        .object({
            agente: z.string().trim().min(1).max(120).optional().describe("Id ou nome do agente (ex.: Candidatador)"),
            execucao: agentFileIdSchema.optional().describe("Id da execução do agente rotineiro"),
            ferramenta: z.string().trim().min(1).max(80).optional().describe("Ferramenta que criou o arquivo (ex.: gerar_pdf)"),
        })
        .optional(),
    metadados: metadataSchema.optional(),
    de: dateSchema.optional().describe("Criado a partir de (data)"),
    ate: dateSchema.optional().describe("Criado até (data, inclusive)"),
    nome: z.string().trim().min(1).max(120).optional().describe("Parte do nome do arquivo"),
    limite: z.number().int().min(1).max(L.searchMax).optional().describe(`Quantos (padrão ${L.searchDefault}, máximo ${L.searchMax})`),
})
export type AgentFileFilters = z.infer<typeof agentFileFiltersSchema>

export const marginsSchema = z.object({
    topo: z.number().min(0).max(50).default(10),
    direita: z.number().min(0).max(50).default(10),
    baixo: z.number().min(0).max(50).default(10),
    esquerda: z.number().min(0).max(50).default(10),
})

export const generatePdfInputSchema = z.object({
    html: z.string().min(1).describe("Documento HTML completo, com o CSS num <style> e imagens como data: URI (sem endereços externos nem JavaScript)"),
    formato: z.enum(PDF_FORMATS).default("A4"),
    orientacao: z.enum(PDF_ORIENTATIONS).default("retrato"),
    margens: marginsSchema.optional().describe("Margens em mm (padrão 10 em cada lado)"),
    fundo: z.boolean().default(true).describe("Imprimir cores e imagens de fundo"),
    usarCssDaPagina: z.boolean().default(false).describe("Usar o @page do CSS (tamanho e margens) no lugar do formato e das margens"),
    maxPaginas: z.number().int().min(1).max(L.maxPages).optional().describe("Ajusta a escala até caber nesse número de páginas"),
    escalaMinima: z.number().min(PDF_MIN_SCALE_FLOOR).max(1).default(PDF_DEFAULT_MIN_SCALE).describe("Menor escala aceita no ajuste"),
    previaPng: z.boolean().default(false).describe("Gerar também a imagem PNG da primeira página"),
    nome: fileNameSchema.optional(),
    metadados: metadataSchema.optional(),
    validadeMinutos: ttlMinutesSchema,
})
export type GeneratePdfInput = z.infer<typeof generatePdfInputSchema>

export const findFilesInputSchema = agentFileFiltersSchema.extend({
    id: agentFileIdSchema.optional().describe("Id do arquivo (dispensa os filtros)"),
    validadeMinutos: ttlMinutesSchema,
})
export type FindFilesInput = z.infer<typeof findFilesInputSchema>

export const getFileInputSchema = findFilesInputSchema.extend({
    incluirConteudo: z.boolean().default(true).describe("Devolver o conteúdo dos arquivos de texto pequenos"),
})
export type GetFileInput = z.infer<typeof getFileInputSchema>

export const uploadInputSchema = z
    .object({
        modo: z.enum(["conteudo", "url"]).describe("conteudo: envia o texto/base64 agora; url: devolve uma URL de envio (PUT) para quem está fora do Opex"),
        nome: fileNameSchema,
        tipo: mimeTypeSchema,
        texto: z.string().optional().describe("Conteúdo em texto (modo conteudo)"),
        base64: z.string().optional().describe("Conteúdo em base64 (modo conteudo)"),
        tamanho: z.number().int().min(1).max(L.putUploadBytes).optional().describe("Tamanho em bytes do arquivo a enviar (modo url)"),
        metadados: metadataSchema.optional(),
        validadeMinutos: ttlMinutesSchema,
    })
    .superRefine((input, ctx) => {
        if (input.modo === "conteudo" && (input.texto === undefined) === (input.base64 === undefined)) ctx.addIssue({ code: "custom", path: ["texto"], message: "No modo conteudo, informe texto OU base64 (um dos dois)" })
        if (input.modo === "url" && (input.texto !== undefined || input.base64 !== undefined)) ctx.addIssue({ code: "custom", path: ["modo"], message: "No modo url, não envie o conteúdo: ele vai direto ao bucket pela URL de envio" })
        if (input.modo === "url" && input.tamanho === undefined) ctx.addIssue({ code: "custom", path: ["tamanho"], message: "No modo url, informe o tamanho do arquivo em bytes" })
    })
    // Exemplo da documentação (MCP do dono): o mínimo que valida inclui o conteúdo.
    .meta({ examples: [{ modo: "conteudo", nome: "notas.txt", tipo: "text/plain", texto: "Anotações da candidatura" }] })
export type UploadInput = z.infer<typeof uploadInputSchema>

// ---------------------------------------------------------------- currículo

export const RESUME_LANGUAGES = ["en", "pt-BR"] as const
export type ResumeLanguage = (typeof RESUME_LANGUAGES)[number]

export const resumeContentSchema = z.object({
    nome: z.string().trim().min(1).max(120).describe("Nome no topo"),
    titulo: z.string().trim().min(1).max(300).describe("Subtítulo (cargo · foco · tecnologias)"),
    contato: z.array(z.string().trim().min(1).max(200)).min(1).max(10).describe("Itens da linha de contato (cidade, e-mail, telefone, LinkedIn, GitHub)"),
    perfil: z.string().trim().min(1).max(3000),
    competencias: z
        .array(z.object({ grupo: z.string().trim().min(1).max(60), itens: z.string().trim().min(1).max(600) }))
        .max(15)
        .default([])
        .describe("Competências por grupo (ex.: { grupo: \"Languages\", itens: \"TypeScript, Python\" })"),
    experiencias: z
        .array(
            z.object({
                cargo: z.string().trim().min(1).max(120),
                empresa: z.string().trim().min(1).max(120),
                periodo: z.string().trim().min(1).max(60),
                local: z.string().trim().min(1).max(80).optional(),
                topicos: z.array(z.string().trim().min(1).max(600)).max(12).default([]),
            }),
        )
        .max(12)
        .default([]),
    anteriores: z.string().trim().min(1).max(600).optional().describe("Linha \"Earlier\" depois das experiências"),
    destaques: z
        .array(z.object({ titulo: z.string().trim().min(1).max(120), texto: z.string().trim().min(1).max(600) }))
        .max(12)
        .default([])
        .describe("Trabalhos em destaque"),
    formacao: z
        .array(z.object({ titulo: z.string().trim().min(1).max(200), detalhe: z.string().trim().min(1).max(300).optional() }))
        .max(10)
        .default([])
        .describe("Formação: título em negrito — detalhe"),
    certificacoes: z
        .array(z.object({ titulo: z.string().trim().min(1).max(200), detalhe: z.string().trim().min(1).max(300).optional() }))
        .max(10)
        .default([])
        .describe("Certificações: título em negrito e detalhe (ex.: { titulo: \"SAP ACM\", detalhe: \"certification\" })"),
    idiomas: z.string().trim().min(1).max(300).optional().describe("Idiomas (ex.: Portuguese (native); English (advanced))"),
    idioma: z.enum(RESUME_LANGUAGES).default("en").describe("Idioma do currículo (títulos das seções)"),
})
export type ResumeContent = z.infer<typeof resumeContentSchema>

export const prepareResumeInputSchema = resumeContentSchema.extend({
    empresa: z.string().trim().min(1).max(120),
    vaga: z.string().trim().min(1).max(200),
    jobId: z.string().trim().min(1).max(60).optional(),
    nomeArquivo: fileNameSchema.optional().describe("Nome do arquivo sem extensão (padrão: data-empresa-vaga)"),
    validadeMinutos: ttlMinutesSchema,
})
export type PrepareResumeInput = z.infer<typeof prepareResumeInputSchema>

export const findResumesInputSchema = z.object({
    id: agentFileIdSchema.optional(),
    empresa: z.string().trim().min(1).max(120).optional(),
    vaga: z.string().trim().min(1).max(200).optional().describe("Parte do título da vaga"),
    jobId: z.string().trim().min(1).max(60).optional(),
    de: dateSchema.optional(),
    ate: dateSchema.optional(),
    limite: z.number().int().min(1).max(L.searchMax).optional(),
    validadeMinutos: ttlMinutesSchema,
})
export type FindResumesInput = z.infer<typeof findResumesInputSchema>

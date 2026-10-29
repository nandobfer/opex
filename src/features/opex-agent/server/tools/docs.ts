import { z } from "zod"
import {
    APP_DOC_DEFAULT_LINES,
    APP_DOC_MAX_LINES,
    APP_DOC_SEARCH_DEFAULT_LIMIT,
    APP_DOC_SEARCH_MAX_LIMIT,
    docTitle,
    findSection,
    normalizeDocDir,
    parseHeadings,
    searchDocs,
    sliceLines,
} from "../../app-docs"
import { listAppDocPaths, readAllAppDocs, readAppDoc } from "../app-docs"
import { defineTool, OpexToolError } from "./define"

export const docTools = [
    defineTool({
        name: "list_app_docs",
        group: "docs",
        label: "Listar documentação",
        risk: "read",
        description:
            "Lista a documentação do app (arquivos Markdown de aicontext/: guias gerais e modules/ com cada funcionalidade), com título, tamanho e seções (##) de cada arquivo. Use para descobrir onde está o assunto antes de ler.",
        input: z.object({ dir: z.string().max(200).optional().describe("Subpasta de aicontext/ (ex.: modules); omitido = tudo") }),
        execute: async ({ dir }) => {
            const prefix = normalizeDocDir(dir)
            if (prefix === null) throw new OpexToolError(`Pasta inválida: "${dir}"`)
            const paths = (await listAppDocPaths()).filter((item) => !prefix || item.startsWith(`${prefix}/`))
            const docs = await Promise.all(
                paths.map(async (item) => {
                    const { content } = await readAppDoc(item)
                    const headings = parseHeadings(content)
                    return { path: item, title: docTitle(item, headings), lines: content.split("\n").length, sections: headings.filter((heading) => heading.level === 2).map((heading) => heading.text) }
                }),
            )
            return { root: "aicontext/", total: docs.length, docs }
        },
    }),
    defineTool({
        name: "read_app_doc",
        group: "docs",
        label: "Ler documentação",
        risk: "read",
        description: `Lê um arquivo da documentação do app (caminho relativo a aicontext/, ex.: modules/tasks.md), com as linhas numeradas, em janelas de até ${APP_DOC_MAX_LINES} linhas. Com section, lê só a seção daquele título (e subseções). Se truncated=true, continue com startLine.`,
        input: z.object({
            path: z.string().min(1).max(300),
            section: z.string().max(200).optional().describe("Título da seção (sem os #); sem acento/caixa"),
            startLine: z.number().int().min(1).optional().describe("Linha inicial (padrão 1 ou o início da seção)"),
            maxLines: z.number().int().min(1).max(APP_DOC_MAX_LINES).optional().describe(`Padrão ${APP_DOC_DEFAULT_LINES}`),
        }),
        execute: async ({ path, section, startLine, maxLines }) => {
            const doc = await readAppDoc(path)
            const headings = parseHeadings(doc.content)
            let range: { start: number; end?: number; section?: string } = { start: startLine ?? 1 }
            if (section) {
                const found = findSection(doc.content, section)
                if (!found) throw new OpexToolError(`Seção "${section}" não encontrada em ${doc.path}. Seções: ${headings.map((heading) => heading.text).join(" · ")}`)
                range = { start: Math.max(found.start, startLine ?? found.start), end: found.end, section: found.heading.text }
            }
            const window = sliceLines(doc.content, range.start, maxLines ?? APP_DOC_DEFAULT_LINES, undefined, range.end)
            return { path: doc.path, title: docTitle(doc.path, headings), ...(range.section ? { section: range.section } : {}), ...window }
        },
    }),
    defineTool({
        name: "search_app_docs",
        group: "docs",
        label: "Buscar na documentação",
        risk: "read",
        description:
            "Busca palavras na documentação do app (aicontext/**.md), sem diferenciar acentos e maiúsculas. Devolve os trechos mais relevantes com arquivo, linha e seção; depois leia com read_app_doc (section ou startLine). Use para responder como fazer algo no app, regras e funcionalidades.",
        input: z.object({
            query: z.string().min(2).max(200).describe("Palavras-chave (ex.: apontar horas timer)"),
            limit: z.number().int().min(1).max(APP_DOC_SEARCH_MAX_LIMIT).optional().describe(`Padrão ${APP_DOC_SEARCH_DEFAULT_LIMIT}`),
        }),
        execute: async ({ query, limit }) => {
            const hits = searchDocs(await readAllAppDocs(), query, limit ?? APP_DOC_SEARCH_DEFAULT_LIMIT)
            return { query, total: hits.length, hits: hits.map((hit) => ({ path: hit.path, line: hit.line, section: hit.section, snippet: hit.snippet })) }
        },
    }),
]

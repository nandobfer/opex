import { defineTool, type OpexTool, type OpexToolContext } from "./define"
import {
    findFilesInputSchema,
    findResumesInputSchema,
    generatePdfInputSchema,
    getFileInputSchema,
    prepareResumeInputSchema,
    uploadInputSchema,
    type FindFilesInput,
} from "@/features/agent-documents/schemas"

/**
 * Grupo `documents` (OPE-210): PDF e arquivos dos agentes sobre o motor compartilhado
 * (`src/features/agent-documents`, nunca HTTP). Só o espaço `agent-files/` do bucket, por id do
 * catálogo; URLs temporárias pelo Endpoint público da Storage S3. `upload_s3` não busca URL informada
 * pelo agente. Ver `aicontext/modules/agent-documents.md`.
 */

const origin = async (context: OpexToolContext, tool: string) => {
    const { originOf } = await import("@/features/agent-documents/server/origin")
    return originOf(context, tool)
}

const sizeLabel = (value: string | undefined) => (value === undefined ? undefined : `<${value.length.toLocaleString("pt-BR")} caracteres>`)

async function listFiles(input: FindFilesInput, context: OpexToolContext, tool: string, scope: { mimeType?: string }, options: { content?: boolean } = {}) {
    const store = await import("@/features/agent-documents/server/store")
    const docs = await store.lookupAgentFiles(input, scope)
    const ttl = await store.urlTtl(input.validadeMinutos)
    const arquivos = await Promise.all(docs.map((doc) => store.withDownload(doc, ttl, options)))
    await store.auditAgentFileRead(context.actorId, docs, tool)
    return { total: arquivos.length, arquivos }
}

export const documentTools: OpexTool[] = [
    defineTool({
        name: "gerar_pdf",
        group: "documents",
        label: "Gerar PDF",
        risk: "write",
        description:
            "Gera um PDF a partir de um HTML completo (CSS num <style>, imagens como data: URI; sem endereços externos nem JavaScript) e guarda no catálogo dos agentes. Opções: formato A4/Carta, orientação, margens (mm), fundo, usar o @page do CSS, máximo de páginas (reduz a escala até caber e avisa se não couber), prévia PNG, nome e metadados. Devolve id, nome, páginas, tamanho, se coube, a escala usada e uma URL de download temporária.",
        input: generatePdfInputSchema,
        summarize: (input) => `Gerar o PDF ${input.nome ? `"${input.nome}"` : "do HTML"}${input.maxPaginas ? ` em até ${input.maxPaginas} página(s)` : ""}`,
        redact: (input) => ({ ...input, html: sizeLabel(input.html) }),
        execute: async (input, context) => {
            const { generateAgentPdf } = await import("@/features/agent-documents/server/pdf")
            return generateAgentPdf(input, { origin: await origin(context, "gerar_pdf"), actorId: context.actorId, signal: context.signal })
        },
    }),
    defineTool({
        name: "obter_pdf",
        group: "documents",
        label: "Obter PDFs",
        risk: "read",
        description:
            "Busca PDFs do catálogo dos agentes por id ou por filtros (origem: agente, execução ou ferramenta; metadados; período; parte do nome). Devolve os metadados e URLs novas de download temporárias, sem o conteúdo.",
        input: findFilesInputSchema,
        execute: (input, context) => listFiles(input, context, "obter_pdf", { mimeType: "application/pdf" }),
    }),
    defineTool({
        name: "upload_s3",
        group: "documents",
        label: "Guardar arquivo",
        risk: "write",
        description:
            "Guarda um arquivo no catálogo dos agentes. Modo conteudo: envia o texto ou o base64 agora (até 5 MB) e recebe o id e a URL de download. Modo url: informe nome, tipo e tamanho e receba uma URL de envio (PUT) temporária para quem está fora do Opex (ex.: o navegador do Galaxy) mandar o arquivo direto ao bucket, com o cabeçalho Content-Type indicado; o arquivo fica pronto na primeira leitura (get_s3). Não baixa conteúdo de URLs.",
        input: uploadInputSchema,
        summarize: (input) => (input.modo === "url" ? `Gerar URL de envio para "${input.nome}"` : `Guardar "${input.nome}"`),
        redact: (input) => ({ ...input, texto: sizeLabel(input.texto), base64: sizeLabel(input.base64) }),
        execute: async (input, context) => {
            const store = await import("@/features/agent-documents/server/store")
            const from = await origin(context, "upload_s3")
            if (input.modo === "url") {
                const pending = await store.createAgentFileUpload({ name: input.nome, mimeType: input.tipo, size: input.tamanho!, origin: from, metadata: input.metadados, ttlMinutes: input.validadeMinutos, actorId: context.actorId })
                return {
                    id: String(pending.doc._id),
                    nome: pending.doc.name,
                    status: "aguardando envio",
                    urlEnvio: pending.uploadUrl,
                    metodo: "PUT",
                    cabecalhos: { "Content-Type": input.tipo },
                    expiraEm: pending.expiresAt.toISOString(),
                    instrucao: "Envie o arquivo com PUT nessa URL (corpo = conteúdo bruto, com o Content-Type indicado) antes de expirar; depois confira com get_s3 pelo id.",
                }
            }
            const body = store.decodeUploadContent(input)
            const saved = await store.saveAgentFile({ name: input.nome, mimeType: input.tipo, body, origin: from, metadata: input.metadados, actorId: context.actorId })
            const ttl = await store.urlTtl(input.validadeMinutos)
            return await store.withDownload(saved, ttl)
        },
    }),
    defineTool({
        name: "get_s3",
        group: "documents",
        label: "Ler arquivo",
        risk: "read",
        description:
            "Lê arquivos do catálogo dos agentes por id ou filtros (origem, metadados, período, nome): metadados e URL de download temporária. Para arquivos de texto de até 64 KB, devolve também o conteúdo. Envios pela URL ainda não concluídos aparecem como \"aguardando envio\", sem URL.",
        input: getFileInputSchema,
        execute: (input, context) => listFiles(input, context, "get_s3", {}, { content: input.incluirConteudo }),
    }),
    defineTool({
        name: "preparar_curriculo",
        group: "documents",
        label: "Preparar currículo",
        risk: "write",
        description:
            "Gera o currículo no modelo aprovado pelo dono (fixo): recebe só o conteúdo estruturado (nome, subtítulo, contato, perfil, competências por grupo, experiências com tópicos, linha \"Earlier\", trabalhos em destaque, formação, certificações, idiomas e o idioma do currículo) mais empresa, vaga e jobId. Ajusta a 1 página, guarda o PDF, o HTML e a prévia PNG e devolve o id, as páginas, se coube e as URLs de download. Para anexar numa candidatura, baixe o PDF pela URL (ex.: page.request.get(url)) e use o buffer no setInputFiles.",
        input: prepareResumeInputSchema,
        summarize: (input) => `Preparar o currículo para ${input.vaga} (${input.empresa})`,
        execute: async (input, context) => {
            const { prepareResume } = await import("@/features/agent-documents/server/resume/service")
            return prepareResume(input, { origin: await origin(context, "preparar_curriculo"), actorId: context.actorId, signal: context.signal })
        },
    }),
    defineTool({
        name: "obter_curriculo",
        group: "documents",
        label: "Obter currículos",
        risk: "read",
        description:
            "Busca currículos já gerados por id, empresa, parte do título da vaga, jobId ou período, para reaproveitar sem gerar de novo. Devolve os metadados, URLs novas (PDF, HTML e PNG) e o conteúdo estruturado usado.",
        input: findResumesInputSchema,
        execute: async (input, context) => {
            const { findResumes } = await import("@/features/agent-documents/server/resume/service")
            const curriculos = await findResumes(input, { actorId: context.actorId, tool: "obter_curriculo" })
            return { total: curriculos.length, curriculos }
        },
    }),
]

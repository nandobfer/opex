import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'

const mocks = vi.hoisted(() => ({
  convert: vi.fn(),
  screenshot: vi.fn(),
  saved: [] as Record<string, unknown>[],
  lookup: vi.fn(),
  createUpload: vi.fn(),
  auditRead: vi.fn(),
  prepare: vi.fn(),
  findResumes: vi.fn(),
}))

vi.mock('@/lib/pdf/gotenberg', async (original) => ({ ...(await original<object>()), convertHtmlToPdf: mocks.convert, screenshotHtml: mocks.screenshot }))
vi.mock('@/lib/db/models/RoutineAgent', () => ({ RoutineAgent: { findById: () => ({ select: () => ({ lean: async () => ({ name: 'Candidatador' }) }) }) } }))
vi.mock('@/features/agent-documents/server/store', async (original) => {
  const actual = await original<{ toAgentFileDto: (doc: unknown) => Record<string, unknown> }>()
  return {
    ...actual,
    withDownload: async (doc: { name: string }, ttl: { expiresAt: Date }, options: { content?: boolean } = {}) => ({
      ...actual.toAgentFileDto(doc),
      url: `https://s3.nandoburgos.dev/opex/agent-files/x/${doc.name}?X-Amz-Expires=900`,
      expiraEm: ttl.expiresAt.toISOString(),
      ...(options.content ? { conteudo: 'conteúdo do arquivo' } : {}),
    }),
    saveAgentFile: vi.fn(async (input: Record<string, unknown>) => {
      const doc = { _id: input.id ?? new Types.ObjectId(), key: `agent-files/${new Types.ObjectId()}/x`, status: 'ready', kind: 'file', createdAt: new Date('2026-11-27T12:00:00Z'), parentId: null, pages: null, ...input, metadata: input.metadata ?? {}, size: (input.body as Buffer).length }
      delete (doc as Record<string, unknown>).body
      mocks.saved.push(doc)
      return doc
    }),
    urlTtl: async () => ({ seconds: 900, expiresAt: new Date('2026-11-27T12:15:00Z') }),
    agentFileDownloadUrl: async (doc: { name: string }) => `https://s3.nandoburgos.dev/opex/agent-files/x/${doc.name}?X-Amz-Expires=900`,
    readAgentFileText: async () => 'conteúdo do arquivo',
    lookupAgentFiles: mocks.lookup,
    createAgentFileUpload: mocks.createUpload,
    auditAgentFileRead: mocks.auditRead,
  }
})
vi.mock('@/features/agent-documents/server/resume/service', () => ({ prepareResume: mocks.prepare, findResumes: mocks.findResumes }))

import { documentTools } from '@/features/opex-agent/server/tools/documents'
import { opexToolMetas } from '@/features/opex-agent/server/tools/registry'
import { buildOpexToolTree, toolConfirms } from '@/features/opex-agent/tool-tree'
import { mcpOwnerGroupScope, mcpOwnerToolDecision, MCP_OWNER_SCOPE } from '@/features/integrations/api-tokens/scopes'
import { isRoutineForbiddenToolGroup } from '@/features/routine-agents/constants'
import { OPEX_CLIENT_TOOL_GROUPS } from '@/features/opex-agent/client-tools'
import type { OpexToolContext } from '@/features/opex-agent/server/tools/define'

const tool = (name: string) => documentTools.find((item) => item.name === name)!
const routineContext: OpexToolContext = { sessionId: '', actorId: 'local', routine: { agentId: '6af650affbe1defce0845967', runId: '6af650affbe1defce0845968' }, secrets: undefined }
const run = (name: string, input: unknown, context: OpexToolContext = routineContext) => tool(name).execute(tool(name).input.parse(input), context)
const fakePdf = (pages: number) => Buffer.from(`%PDF ${'/Type /Page '.repeat(pages)}`, 'latin1')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.saved = []
  mocks.convert.mockResolvedValue(fakePdf(1))
  mocks.screenshot.mockResolvedValue(Buffer.from('PNG'))
})

describe('grupo Documentos (OPE-210)', () => {
  it('registra as 6 ferramentas no grupo documents com o risco declarado', () => {
    const metas = opexToolMetas().filter((meta) => meta.group === 'documents')
    expect(Object.fromEntries(metas.map((meta) => [meta.name, meta.risk]))).toEqual({
      gerar_pdf: 'write',
      obter_pdf: 'read',
      upload_s3: 'write',
      get_s3: 'read',
      preparar_curriculo: 'write',
      obter_curriculo: 'read',
    })
    // Escrita segue a regra padrão: sem confirmação por padrão.
    for (const meta of metas) expect(toolConfirms(meta)).toBe(false)
  })

  it('aparece na árvore, é liberável aos rotineiros e fica fora do portal', () => {
    const branch = buildOpexToolTree(opexToolMetas()).find((item) => item.id === 'tools_documents')
    expect(branch?.label).toBe('Documentos')
    expect(isRoutineForbiddenToolGroup('documents')).toBe(false)
    expect((OPEX_CLIENT_TOOL_GROUPS as readonly string[]).includes('documents')).toBe(false)
  })

  it('o escopo mcp:owner:group:documents libera as 6 pelo token, sem o destrutivo', () => {
    const scopes = [MCP_OWNER_SCOPE, mcpOwnerGroupScope('documents')]
    for (const meta of opexToolMetas().filter((item) => item.group === 'documents')) expect(mcpOwnerToolDecision(scopes, meta)).toEqual({ ok: true })
  })
})

describe('ferramentas de documentos (motor mockado no S3 e no Gotenberg)', () => {
  it('gerar_pdf: gera, guarda com a origem do rotineiro e devolve a URL temporária', async () => {
    const result = (await run('gerar_pdf', { html: '<html><body><p>Olá</p></body></html>', nome: 'relatorio', maxPaginas: 1, previaPng: true, metadados: { empresa: 'Acme' } })) as Record<string, unknown>
    expect(result).toMatchObject({ nome: 'relatorio.pdf', paginas: 1, coube: true, escala: 1, expiraEm: '2026-11-27T12:15:00.000Z' })
    expect(result.url).toContain('https://s3.nandoburgos.dev/')
    expect(result.previa).toMatchObject({ url: expect.stringContaining('relatorio.png') })
    expect(mocks.saved[0]).toMatchObject({ kind: 'pdf', origin: { type: 'routine', agentName: 'Candidatador', runId: '6af650affbe1defce0845968', tool: 'gerar_pdf' } })
    expect(JSON.stringify(result)).not.toMatch(/secretKey|accessKey|agent-files\/[a-f0-9]{24}\/relatorio\.pdf"/)
  })

  it('gerar_pdf: HTML acima de 1 MB e HTML com recurso externo são recusados', async () => {
    await expect(run('gerar_pdf', { html: 'x'.repeat(1024 * 1024 + 1) })).rejects.toMatchObject({ status: 413 })
    await expect(run('gerar_pdf', { html: '<img src="http://169.254.169.254/x">' })).rejects.toMatchObject({ code: 'AGENT_PDF_HTML_EXTERNAL' })
    expect(mocks.convert).not.toHaveBeenCalled()
  })

  it('gerar_pdf: falha na prévia PNG não deixa PDF gravado', async () => {
    mocks.screenshot.mockRejectedValueOnce(Object.assign(new Error('O Gotenberg não respondeu em 30 s'), { status: 504 }))
    await expect(run('gerar_pdf', { html: '<p>x</p>', previaPng: true })).rejects.toMatchObject({ status: 504 })
    expect(mocks.saved).toHaveLength(0)
  })

  it('gerar_pdf: o histórico guarda só o tamanho do HTML', () => {
    const redacted = tool('gerar_pdf').redact!(tool('gerar_pdf').input.parse({ html: '<p>documento</p>' })) as { html: string }
    expect(redacted.html).toBe('<16 caracteres>')
  })

  it('upload_s3 (conteúdo): grava o texto e devolve a URL; acima de 5 MB recusa', async () => {
    const result = (await run('upload_s3', { modo: 'conteudo', nome: 'notas.txt', tipo: 'text/plain', texto: 'abc' })) as Record<string, unknown>
    expect(result).toMatchObject({ nome: 'notas.txt', status: 'pronto', url: expect.stringContaining('notas.txt') })
    expect(mocks.saved[0]).toMatchObject({ origin: { tool: 'upload_s3' }, size: 3 })
    await expect(run('upload_s3', { modo: 'conteudo', nome: 'g.bin', tipo: 'application/octet-stream', base64: Buffer.alloc(5 * 1024 * 1024 + 10).toString('base64') })).rejects.toMatchObject({ status: 413 })
    const redacted = tool('upload_s3').redact!(tool('upload_s3').input.parse({ modo: 'conteudo', nome: 'a', tipo: 'text/plain', base64: 'QUJD' })) as { base64: string }
    expect(redacted.base64).toBe('<4 caracteres>')
  })

  it('upload_s3 (url): devolve a URL de envio PUT e não aceita conteúdo nem URL de origem', async () => {
    mocks.createUpload.mockResolvedValue({ doc: { _id: new Types.ObjectId(), name: 'cv.pdf' }, uploadUrl: 'https://s3.nandoburgos.dev/opex/agent-files/x/cv.pdf?put', expiresAt: new Date('2026-11-27T12:15:00Z') })
    const result = (await run('upload_s3', { modo: 'url', nome: 'cv.pdf', tipo: 'application/pdf', tamanho: 80_000 })) as Record<string, unknown>
    expect(result).toMatchObject({ metodo: 'PUT', status: 'aguardando envio', cabecalhos: { 'Content-Type': 'application/pdf' } })
    expect(mocks.createUpload.mock.calls[0]![0]).toMatchObject({ size: 80_000, origin: { tool: 'upload_s3' } })
    expect(() => tool('upload_s3').input.parse({ modo: 'url', nome: 'a', tipo: 'text/plain', tamanho: 1, texto: 'x' })).toThrow()
    expect(tool('upload_s3').input.parse({ modo: 'conteudo', nome: 'a', tipo: 'text/plain', texto: 'x', url: 'http://interno' })).not.toHaveProperty('url')
  })

  it('obter_pdf e get_s3: buscam no catálogo, devolvem URLs novas e auditam a leitura', async () => {
    const doc = { _id: new Types.ObjectId(), name: 'a.txt', mimeType: 'text/plain', size: 3, pages: null, kind: 'file', status: 'ready', key: 'agent-files/x/a.txt', origin: { type: 'opex', tool: 'upload_s3' }, metadata: {}, parentId: null, createdAt: new Date() }
    mocks.lookup.mockResolvedValue([doc])
    const read = (await run('get_s3', { origem: { agente: 'Candidatador' } })) as { total: number; arquivos: Record<string, unknown>[] }
    expect(read.total).toBe(1)
    expect(read.arquivos[0]).toMatchObject({ nome: 'a.txt', conteudo: 'conteúdo do arquivo', url: expect.stringContaining('a.txt') })
    expect(mocks.auditRead).toHaveBeenCalledWith('local', [doc], 'get_s3')

    await run('obter_pdf', { metadados: { jobId: '1' } })
    expect(mocks.lookup.mock.calls[1]![1]).toEqual({ mimeType: 'application/pdf' })
  })

  it('preparar_curriculo e obter_curriculo chamam o motor do currículo', async () => {
    mocks.prepare.mockResolvedValue({ id: '1', coube: true })
    mocks.findResumes.mockResolvedValue([{ id: '1' }])
    expect(await run('preparar_curriculo', { nome: 'F', titulo: 'T', contato: ['c'], perfil: 'p', empresa: 'Acme', vaga: 'Dev' })).toEqual({ id: '1', coube: true })
    expect(mocks.prepare.mock.calls[0]![1]).toMatchObject({ origin: { type: 'routine', tool: 'preparar_curriculo' }, actorId: 'local' })
    expect(await run('obter_curriculo', { empresa: 'Acme' })).toEqual({ total: 1, curriculos: [{ id: '1' }] })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'

const mocks = vi.hoisted(() => ({
  /** Escala máxima que cabe em 1 página por densidade (null = nunca cabe). */
  fitsAt: { padrao: 1 as number | null, compacto: 1 as number | null },
  convert: vi.fn(),
  screenshot: vi.fn(),
  saved: [] as Record<string, unknown>[],
  links: vi.fn(),
  lookup: vi.fn(),
  byIds: vi.fn(),
  auditRead: vi.fn(),
}))

const fakePdf = (pages: number) => Buffer.from(`%PDF ${'/Type /Page '.repeat(pages)}`, 'latin1')

vi.mock('@/lib/pdf/gotenberg', async (original) => ({ ...(await original<object>()), convertHtmlToPdf: mocks.convert, screenshotHtml: mocks.screenshot }))
vi.mock('@/features/agent-documents/server/store', async (original) => ({
  ...(await original<object>()),
  saveAgentFile: vi.fn(async (input: Record<string, unknown>) => {
    const doc = { _id: input.id ?? new Types.ObjectId(), key: 'agent-files/x/y', status: 'ready', createdAt: new Date(), ...input, metadata: input.metadata ?? {}, size: (input.body as Buffer).length }
    mocks.saved.push(doc)
    return doc
  }),
  setResumeLinks: mocks.links,
  urlTtl: async () => ({ seconds: 900, expiresAt: new Date('2026-11-27T12:15:00Z') }),
  agentFileDownloadUrl: async (doc: { name: string }) => `https://s3.publico/${doc.name}`,
  lookupAgentFiles: mocks.lookup,
  findAgentFilesByIds: mocks.byIds,
  auditAgentFileRead: mocks.auditRead,
}))

import { findResumes, prepareResume } from '@/features/agent-documents/server/resume/service'
import { prepareResumeInputSchema } from '@/features/agent-documents/schemas'
import { REFERENCE_RESUME_CONTENT } from '../../fixtures/resume/sample-content'

const origin = { type: 'routine' as const, agentId: 'a', agentName: 'Candidatador', runId: 'r', tool: 'preparar_curriculo' }
const input = prepareResumeInputSchema.parse({ ...REFERENCE_RESUME_CONTENT, empresa: 'AE Studio', vaga: 'Product Engineer (AI Driven)', jobId: '4321' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.saved = []
  mocks.fitsAt = { padrao: 1, compacto: 1 }
  mocks.convert.mockImplementation(async (html: string, options: { scale: number }) => {
    const density = html.includes('font-size:9.3pt') ? 'padrao' : 'compacto'
    const limit = mocks.fitsAt[density]
    return fakePdf(limit !== null && options.scale <= limit ? 1 : 2)
  })
  mocks.screenshot.mockResolvedValue(Buffer.from('PNG'))
})

describe('preparar_curriculo: degraus do modelo aprovado (OPE-210)', () => {
  it('padrão cabe com escala 1: guarda PDF, HTML e PNG ligados pelo arquivo principal', async () => {
    const result = await prepareResume(input, { origin, actorId: 'local' })
    expect(result).toMatchObject({ paginas: 1, coube: true, densidade: 'padrao', escala: 1 })
    expect(result.nome).toMatch(/^\d{4}-\d{2}-\d{2}-ae-studio-product-engineer-ai-driven\.pdf$/)
    const [pdf, html, png] = mocks.saved
    expect(pdf).toMatchObject({ kind: 'resume', mimeType: 'application/pdf', metadata: { empresa: 'AE Studio', vaga: 'Product Engineer (AI Driven)', jobId: '4321', idioma: 'en' } })
    expect((pdf!.resume as { content: unknown }).content).toMatchObject({ nome: 'Fernando Burgos Fernandes' })
    expect(html).toMatchObject({ mimeType: 'text/html', parentId: pdf!._id })
    expect(png).toMatchObject({ mimeType: 'image/png', parentId: pdf!._id })
    expect(mocks.links).toHaveBeenCalledWith(pdf!._id, { htmlFileId: html!._id, pngFileId: png!._id })
    expect(result.url).toContain('.pdf')
    expect(result.previa.url).toContain('.png')
  })

  it('padrão com 0,97 (fonte do Gotenberg): continua no CSS exato do modelo', async () => {
    mocks.fitsAt = { padrao: 0.97, compacto: 1 }
    const result = await prepareResume(input, { origin, actorId: 'local' })
    expect(result).toMatchObject({ coube: true, densidade: 'padrao', escala: 0.97 })
  })

  it('padrão não cabe nem com 0,95: usa a densidade compacta', async () => {
    mocks.fitsAt = { padrao: null, compacto: 0.9 }
    const result = await prepareResume(input, { origin, actorId: 'local' })
    expect(result).toMatchObject({ coube: true, densidade: 'compacto', escala: 0.9 })
    const html = (mocks.saved[1]!.body as Buffer).toString()
    expect(html).toContain('font-size:8.25pt;line-height:1.22')
  })

  it('não coube: guarda assim mesmo, com coube=false e o aviso', async () => {
    mocks.fitsAt = { padrao: null, compacto: null }
    const result = await prepareResume(input, { origin, actorId: 'local' })
    expect(result).toMatchObject({ coube: false, densidade: 'compacto', escala: 0.8, paginas: 2 })
    expect(result.aviso).toContain('reduza o conteúdo')
    expect(mocks.saved).toHaveLength(3)
  })
})

describe('obter_curriculo (OPE-210)', () => {
  it('busca por empresa e vaga no catálogo e devolve URLs novas e o conteúdo usado', async () => {
    const pdfId = new Types.ObjectId()
    const htmlId = new Types.ObjectId()
    const doc = { _id: pdfId, name: 'cv.pdf', mimeType: 'application/pdf', size: 10, pages: 1, kind: 'resume', status: 'ready', key: 'agent-files/x/cv.pdf', origin, metadata: { empresa: 'AE Studio' }, parentId: null, createdAt: new Date(), resume: { content: { nome: 'F' }, density: 'padrao', htmlFileId: htmlId, pngFileId: null } }
    mocks.lookup.mockResolvedValue([doc])
    mocks.byIds.mockResolvedValue(new Map([[String(htmlId), { _id: htmlId, name: 'cv.html' }]]))
    const [resume] = await findResumes({ empresa: 'ae studio', vaga: 'product', jobId: '4321' }, { actorId: 'local', tool: 'obter_curriculo' })
    const [filters, scope] = mocks.lookup.mock.calls[0]!
    expect(filters).toMatchObject({ metadados: { jobId: '4321' } })
    expect(scope.kind).toBe('resume')
    expect(scope.metadataPatterns.empresa.test('AE Studio')).toBe(true)
    expect(scope.metadataPatterns.vaga.test('Product Engineer')).toBe(true)
    expect(resume).toMatchObject({ id: String(pdfId), url: 'https://s3.publico/cv.pdf', html: { id: String(htmlId), url: 'https://s3.publico/cv.html' }, previa: null, conteudo: { nome: 'F' }, densidade: 'padrao' })
    expect(mocks.auditRead).toHaveBeenCalledWith('local', [doc], 'obter_curriculo')
  })
})

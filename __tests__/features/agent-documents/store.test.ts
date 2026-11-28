import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'

const mocks = vi.hoisted(() => ({
  docs: [] as Record<string, unknown>[],
  upload: vi.fn(),
  getFileUrl: vi.fn(),
  getUploadUrl: vi.fn(),
  headFile: vi.fn(),
  deleteFile: vi.fn(),
  getFileObject: vi.fn(),
  audit: vi.fn(),
  gotenberg: { urlTtlMinutes: 15, urlTtlMaxMinutes: 60 } as Record<string, unknown>,
  lastFind: null as unknown,
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/audit/record', () => ({ recordAudit: mocks.audit, AcaoAuditoria: { CRIAR: 'CRIAR', EXECUTAR: 'EXECUTAR', ATUALIZAR: 'ATUALIZAR' } }))
vi.mock('@/lib/integrations/runtime', () => ({ getIntegrationConfig: async () => mocks.gotenberg }))
vi.mock('@/lib/storage/s3', async (original) => ({
  ...(await original<object>()),
  uploadFile: mocks.upload,
  getFileUrl: mocks.getFileUrl,
  getUploadUrl: mocks.getUploadUrl,
  headFile: mocks.headFile,
  deleteFile: mocks.deleteFile,
  getFileObject: mocks.getFileObject,
}))
vi.mock('@/lib/db/models/AgentFile', () => {
  const lean = <T,>(value: T) => ({ lean: async () => value })
  return {
    AgentFile: {
      create: async (doc: Record<string, unknown>) => {
        const saved = { createdAt: new Date('2026-11-27T12:00:00Z'), updatedAt: new Date(), pages: null, parentId: null, ...doc }
        mocks.docs.push(saved)
        return { toObject: () => saved }
      },
      findById: (id: string) => lean(mocks.docs.find((doc) => String(doc._id) === String(id)) ?? null),
      find: (query: unknown) => {
        mocks.lastFind = query
        return { sort: () => ({ limit: () => ({ lean: async () => [...mocks.docs] }) }), lean: async () => [...mocks.docs] }
      },
      findOneAndUpdate: (filter: { _id: unknown }, update: { $set: Record<string, unknown> }) => {
        const doc = mocks.docs.find((item) => String(item._id) === String(filter._id))
        if (doc) Object.assign(doc, update.$set)
        return lean(doc ?? null)
      },
      updateOne: vi.fn(),
    },
  }
})

import {
  agentFileQuery,
  assertAgentKey,
  buildAgentKey,
  createAgentFileUpload,
  decodeUploadContent,
  finalizePending,
  lookupAgentFiles,
  readAgentFileText,
  saveAgentFile,
  toAgentFileDto,
  urlTtl,
  withDownload,
} from '@/features/agent-documents/server/store'
import type { IAgentFile } from '@/lib/db/models/AgentFile'

const origin = { type: 'routine' as const, agentId: '6af650affbe1defce0845967', agentName: 'Candidatador', runId: '6af650affbe1defce0845968', tool: 'upload_s3' }

beforeEach(() => {
  mocks.docs = []
  mocks.gotenberg = { urlTtlMinutes: 15, urlTtlMaxMinutes: 60 }
  vi.clearAllMocks()
  mocks.getFileUrl.mockImplementation(async (key: string, options: { audience: string; expiresIn: number }) => `https://s3.publico/${key}?aud=${options.audience}&exp=${options.expiresIn}`)
  mocks.getUploadUrl.mockImplementation(async (key: string, _type: string, expiresIn: number, audience: string) => `https://s3.publico/${key}?put&aud=${audience}&exp=${expiresIn}`)
})

describe('espaço isolado dos agentes no bucket (OPE-210)', () => {
  it('gera a chave no prefixo agent-files/<id>/<nome sanitizado>', () => {
    const id = new Types.ObjectId()
    expect(buildAgentKey(id, 'Currículo Fernando (final).pdf')).toBe(`agent-files/${id}/Curriculo-Fernando-final-.pdf`)
  })

  it.each(['attachments/6af650affbe1defce0845967/x.pdf', 'agent-files/../attachments/x', 'agent-files/6af650affbe1defce0845967/../x', 'agent-files/abc/x.pdf', 'opex-chat/6af650affbe1defce0845967/x', 'agent-files/6af650affbe1defce0845967/a\\b'])('recusa chave fora do espaço: %s', (key) => {
    expect(() => assertAgentKey(key)).toThrow('Chave fora do espaço')
  })
})

describe('motor de arquivos dos agentes (OPE-210)', () => {
  it('grava no bucket, registra no catálogo e audita sem o conteúdo', async () => {
    const saved = await saveAgentFile({ name: 'notas.txt', mimeType: 'text/plain', body: Buffer.from('conteúdo secreto'), origin, metadata: { empresa: 'Acme' }, actorId: 'local' })
    expect(mocks.upload).toHaveBeenCalledWith(saved.key, expect.any(Buffer), 'text/plain')
    expect(saved.key.startsWith('agent-files/')).toBe(true)
    expect(saved.size).toBe(Buffer.byteLength('conteúdo secreto'))
    const audit = mocks.audit.mock.calls[0]![0]
    expect(audit).toMatchObject({ entidade: 'DocumentoAgente', acao: 'CRIAR', depois: { operacao: 'gravar', nome: 'notas.txt', origem: { type: 'routine', agentName: 'Candidatador' } } })
    expect(JSON.stringify(audit)).not.toContain('conteúdo secreto')
  })

  it('falha no catálogo depois do envio remove o objeto do bucket (sem órfão)', async () => {
    const { AgentFile } = await import('@/lib/db/models/AgentFile')
    const create = vi.spyOn(AgentFile, 'create').mockRejectedValueOnce(new Error('Mongoose maps do not support keys that contain "."') as never)
    mocks.deleteFile.mockResolvedValueOnce(undefined)
    await expect(saveAgentFile({ name: 'a.txt', mimeType: 'text/plain', body: Buffer.from('a'), origin, actorId: 'local' })).rejects.toThrow('Mongoose maps')
    const key = mocks.upload.mock.calls[0]![0]
    expect(mocks.deleteFile).toHaveBeenCalledWith(key)
    expect(mocks.audit).not.toHaveBeenCalled()
    create.mockRestore()
  })

  it('enquanto a URL de envio vale, um novo PUT é conferido: o tamanho acompanha e acima do limite remove', async () => {
    const pending = await createAgentFileUpload({ name: 'cv.pdf', mimeType: 'application/pdf', size: 1000, origin, actorId: 'local' })
    mocks.headFile.mockResolvedValueOnce({ contentLength: 1000 })
    const ready = await finalizePending(pending.doc as IAgentFile)
    expect(ready).toMatchObject({ status: 'ready', size: 1000 })
    mocks.headFile.mockResolvedValueOnce({ contentLength: 800 })
    expect(await finalizePending(ready)).toMatchObject({ size: 800 })
    mocks.headFile.mockResolvedValueOnce({ contentLength: 50_000 })
    mocks.deleteFile.mockResolvedValueOnce(undefined)
    await expect(finalizePending({ ...ready, size: 800 })).rejects.toMatchObject({ status: 413 })
    expect(mocks.deleteFile).toHaveBeenCalledWith(pending.doc.key)
  })

  it('arquivo pronto com a URL de envio vencida não é conferido de novo', async () => {
    const pending = await createAgentFileUpload({ name: 'cv.pdf', mimeType: 'application/pdf', size: 1000, origin, actorId: 'local' })
    const expired = { ...pending.doc, status: 'ready', size: 1000, upload: { maxBytes: 1000, expiresAt: new Date(Date.now() - 1000) } } as IAgentFile
    expect(await finalizePending(expired)).toBe(expired)
    expect(mocks.headFile).not.toHaveBeenCalled()
  })

  it('texto inline só é lido quando o tamanho real cabe em 64 KB', async () => {
    const saved = await saveAgentFile({ name: 'a.txt', mimeType: 'text/plain', body: Buffer.from('abc'), origin, actorId: 'local' })
    const cancel = vi.fn(async () => undefined)
    mocks.getFileObject.mockResolvedValueOnce({ body: { cancel }, contentLength: 10 * 1024 * 1024 })
    expect(await readAgentFileText(saved)).toBeNull()
    expect(cancel).toHaveBeenCalled()
    mocks.getFileObject.mockResolvedValueOnce({ body: new Response('abc').body, contentLength: 3 })
    expect(await readAgentFileText(saved)).toBe('abc')
  })

  it('DTO não expõe a chave do bucket', async () => {
    const saved = await saveAgentFile({ name: 'a.txt', mimeType: 'text/plain', body: Buffer.from('a'), origin, actorId: 'local' })
    const dto = toAgentFileDto(saved)
    expect(JSON.stringify(dto)).not.toContain('agent-files/')
    expect(dto).toMatchObject({ nome: 'a.txt', status: 'pronto', origem: { agente: 'Candidatador', ferramenta: 'upload_s3' } })
  })

  it('URL de download pelo Endpoint público com a validade padrão, limitada à máxima', async () => {
    const saved = await saveAgentFile({ name: 'a.txt', mimeType: 'text/plain', body: Buffer.from('a'), origin, actorId: 'local' })
    const dto = await withDownload(saved, await urlTtl())
    expect(dto.url).toContain('aud=browser&exp=900')
    expect((await urlTtl(500)).seconds).toBe(3600)
    mocks.gotenberg = { urlTtlMinutes: 30, urlTtlMaxMinutes: 10 }
    expect((await urlTtl()).seconds).toBe(600)
  })

  it('decodifica texto e base64 e recusa acima de 5 MB com mensagem acionável', () => {
    expect(decodeUploadContent({ texto: 'olá' }).toString()).toBe('olá')
    expect(decodeUploadContent({ base64: Buffer.from('pdf').toString('base64') }).toString()).toBe('pdf')
    expect(decodeUploadContent({ base64: `data:text/plain;base64,${Buffer.from('x').toString('base64')}` }).toString()).toBe('x')
    expect(() => decodeUploadContent({ texto: 'x'.repeat(5 * 1024 * 1024 + 1) })).toThrow(/limite do envio direto é 5 MB/)
    expect(() => decodeUploadContent({ base64: '%%%' })).toThrow('base64')
  })

  it('URL de envio (PUT) pelo Endpoint público cria o registro pendente; o head finaliza', async () => {
    const pending = await createAgentFileUpload({ name: 'cv.pdf', mimeType: 'application/pdf', size: 1000, origin, actorId: 'local' })
    expect(pending.uploadUrl).toContain('put&aud=browser&exp=900')
    expect(pending.doc.status).toBe('pending')

    mocks.headFile.mockRejectedValueOnce(Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }))
    expect((await finalizePending(pending.doc as IAgentFile)).status).toBe('pending')

    mocks.headFile.mockResolvedValueOnce({ contentLength: 900 })
    const ready = await finalizePending(pending.doc as IAgentFile)
    expect(ready).toMatchObject({ status: 'ready', size: 900 })
  })

  it('envio acima do limite declarado é removido e recusado', async () => {
    const pending = await createAgentFileUpload({ name: 'cv.pdf', mimeType: 'application/pdf', size: 1000, origin, actorId: 'local' })
    mocks.headFile.mockResolvedValueOnce({ contentLength: 5000 })
    mocks.deleteFile.mockResolvedValueOnce(undefined)
    await expect(finalizePending(pending.doc as IAgentFile)).rejects.toMatchObject({ status: 413 })
    expect(mocks.deleteFile).toHaveBeenCalledWith(pending.doc.key)
  })

  it('recusa declarar mais de 25 MB no envio pela URL', async () => {
    await expect(createAgentFileUpload({ name: 'grande.zip', mimeType: 'application/zip', size: 26 * 1024 * 1024, origin, actorId: 'local' })).rejects.toMatchObject({ status: 413 })
  })

  it('pendente não ganha URL de download', async () => {
    const pending = await createAgentFileUpload({ name: 'cv.pdf', mimeType: 'application/pdf', size: 10, origin, actorId: 'local' })
    const dto = await withDownload(pending.doc as IAgentFile, await urlTtl())
    expect(dto).toMatchObject({ status: 'aguardando envio', url: null })
  })

  it('id de outro tipo é recusado na busca por PDF', async () => {
    const saved = await saveAgentFile({ name: 'a.txt', mimeType: 'text/plain', body: Buffer.from('a'), origin, actorId: 'local' })
    await expect(lookupAgentFiles({ id: String(saved._id) }, { mimeType: 'application/pdf' })).rejects.toMatchObject({ status: 404 })
  })
})

describe('metadados (OPE-210)', () => {
  it('recusam chave com ponto ou $ (Map do Mongoose e filtro metadata.<chave>)', async () => {
    const { metadataSchema } = await import('@/features/agent-documents/schemas')
    expect(metadataSchema.safeParse({ 'vaga.id': '1' }).success).toBe(false)
    expect(metadataSchema.safeParse({ $x: '1' }).success).toBe(false)
    expect(metadataSchema.safeParse({ job_id: '1', 'vaga-id': '2' }).success).toBe(true)
  })
})

describe('consulta do catálogo (OPE-210)', () => {
  it('filtra por origem, metadados, período e nome escapado', () => {
    const query = agentFileQuery({ origem: { agente: 'Candidatador', execucao: '6af650affbe1defce0845968', ferramenta: 'gerar_pdf' }, metadados: { jobId: '123' }, de: '2026-11-01', ate: '2026-11-27', nome: 'a.b(c' }, { mimeType: 'application/pdf' })
    expect(query).toMatchObject({ mimeType: 'application/pdf', 'origin.runId': '6af650affbe1defce0845968', 'origin.tool': 'gerar_pdf', 'metadata.jobId': '123' })
    expect((query.$or as { 'origin.agentName': RegExp }[])[0]!['origin.agentName'].test('candidatador')).toBe(true)
    expect((query.name as RegExp).source).toBe('a\\.b\\(c')
    const created = query.createdAt as { $gte: Date; $lte: Date }
    expect(created.$gte.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(created.$lte.toISOString()).toBe('2026-11-27T23:59:59.999Z')
  })

  it('agente por id usa origin.agentId', () => {
    expect(agentFileQuery({ origem: { agente: '6af650affbe1defce0845967' } })).toMatchObject({ $or: [{ 'origin.agentId': '6af650affbe1defce0845967' }] })
  })
})

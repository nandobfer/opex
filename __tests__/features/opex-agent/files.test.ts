import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { memoryModel, type Doc } from '../../helpers/memory-model'

const s3 = vi.hoisted(() => ({
  objects: new Map<string, string>(),
  headFailure: null as unknown,
  getUploadUrl: vi.fn(async (key: string) => `https://s3.local/bucket/${key}?assinado`),
  headFile: vi.fn(),
  copyFile: vi.fn(),
  deleteFile: vi.fn(),
  getFileObject: vi.fn(),
}))
vi.mock('@/lib/storage/s3', () => ({
  getUploadUrl: s3.getUploadUrl,
  headFile: s3.headFile,
  copyFile: s3.copyFile,
  deleteFile: s3.deleteFile,
  getFileObject: s3.getFileObject,
  storageErrorInfo: (error: { kind?: string }) => ({ kind: error?.kind ?? 'unavailable', httpStatus: null, code: null }),
}))

const store = vi.hoisted(() => ({ files: null as unknown }))
vi.mock('@/lib/db/models/Opex', () => {
  const model = memoryModel()
  const create = model.create
  store.files = Object.assign(model, {
    // Como o Mongoose, ids de filtro em texto casam com o ObjectId gravado.
    create: (doc: Doc) => create({ ...doc, _id: String(doc._id) }),
    // `updateMany` do Mongo informa quantos documentos mudaram (a trava contra envio duplo usa isso).
    updateMany: async (filter: Doc, update: Doc) => {
      const before = (await model.find(filter).lean()) as Doc[]
      for (const doc of before) await model.updateOne({ _id: doc._id }, update)
      return { modifiedCount: before.length }
    },
  })
  return { OpexFile: store.files, OpexSession: memoryModel(), OpexMessage: memoryModel(), OpexPendingAction: memoryModel() }
})
vi.mock('@/features/opex-agent/server/sessions', async () => {
  const { opexFileKind, opexFilePath } = await import('@/features/opex-agent/files')
  return {
    loadSession: async () => ({}),
    opexDb: async () => {},
    toFileDto: (file: { id: string; name: string; mediaType: string; size: number }) => ({ ...file, kind: opexFileKind(file.mediaType, file.name), url: opexFilePath(file.id) }),
  }
})

import {
  claimOpexFiles,
  cleanupPendingOpexFiles,
  completeOpexFile,
  deletePendingOpexFile,
  deleteSessionFiles,
  fileMarkers,
  reserveOpexFile,
  resolveFileMarkers,
} from '@/features/opex-agent/server/files'
import { historySize, selectHistory } from '@/features/opex-agent/history'
import { opexFileDelivery, opexFileKind } from '@/features/opex-agent/files'
import { checkFiles } from '@/features/opex-agent/hooks/useOpexUploads'
import { withDefaults } from '@/features/opex-agent/server/settings'
import { DEFAULT_OPEX_AGENT_SETTINGS, opexAgentSettingsSchema, sendOpexMessageSchema } from '@/features/opex-agent/schemas'

type Model = ReturnType<typeof memoryModel>
const files = () => store.files as Model
const SESSION = 'a'.repeat(24)
const OTHER = 'c'.repeat(24)
const limits = { maxPerMessage: 3, maxSizeMb: 1 }

/** Simula o navegador: reserva, PUT direto no "storage" e confirmação. */
async function upload(name: string, mediaType: string, content = 'conteúdo', session = SESSION) {
  const reservation = await reserveOpexFile(session, { name, size: Buffer.byteLength(content), mediaType }, limits)
  const doc = files().docs.find((item) => String(item._id) === reservation.id)!
  s3.objects.set(doc.uploadKey as string, content)
  return completeOpexFile(reservation.id, limits)
}

beforeEach(() => {
  vi.clearAllMocks()
  files().docs.splice(0)
  s3.objects.clear()
  s3.headFailure = null
  s3.headFile.mockImplementation(async (key: string) => {
    if (s3.headFailure) throw s3.headFailure
    const content = s3.objects.get(key)
    if (content === undefined) throw { kind: 'not_found' }
    return { contentLength: Buffer.byteLength(content), contentType: 'application/octet-stream' }
  })
  s3.copyFile.mockImplementation(async (from: string, to: string) => void s3.objects.set(to, s3.objects.get(from)!))
  s3.deleteFile.mockImplementation(async (key: string) => void s3.objects.delete(key))
  s3.getFileObject.mockImplementation(async (key: string) => ({ body: new Blob([s3.objects.get(key) ?? '']).stream(), contentLength: Buffer.byteLength(s3.objects.get(key) ?? '') }))
})

describe('tipos de arquivo e o que cada provedor lê', () => {
  it('classifica pelo MIME, com a extensão como reserva', () => {
    expect(opexFileKind('image/png', 'print.png')).toBe('image')
    expect(opexFileKind('', 'foto.JPG')).toBe('image')
    expect(opexFileKind('image/svg+xml', 'logo.svg')).toBe('other')
    expect(opexFileKind('application/pdf', 'x')).toBe('pdf')
    expect(opexFileKind('', 'erro.log')).toBe('text')
    expect(opexFileKind('audio/mpeg', 'a.mp3')).toBe('audio')
  })

  it('segue a tabela por provedor e vira referência acima do teto de conteúdo', () => {
    expect(opexFileDelivery('gemini', 'video')).toBe('content')
    expect(opexFileDelivery('anthropic', 'pdf')).toBe('content')
    expect(opexFileDelivery('openai', 'audio')).toBe('reference')
    expect(opexFileDelivery('deepseek', 'image')).toBe('reference')
    expect(opexFileDelivery('deepseek', 'text')).toBe('inline-text')
    expect(opexFileDelivery('anthropic', 'pdf', 50 * 1024 * 1024)).toBe('reference')
    expect(opexFileDelivery('openai', 'text', 6 * 1024 * 1024)).toBe('reference')
  })
})

describe('envio assinado ao S3', () => {
  it('reserva valida o limite e assina o PUT para uma chave temporária', async () => {
    await expect(reserveOpexFile(SESSION, { name: 'grande.zip', size: 1024 * 1024 + 1 }, limits)).rejects.toMatchObject({ status: 413, code: 'OPEX_FILE_TOO_LARGE' })
    const reservation = await reserveOpexFile(SESSION, { name: 'print.png', size: 3, mediaType: 'image/png' }, limits)
    expect(reservation).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/png' } })
    expect(s3.getUploadUrl).toHaveBeenCalledWith(`opex/tmp/${reservation.id}/print.png`, 'image/png', expect.any(Number), 'browser')
    expect(files().docs[0]).toMatchObject({ pending: true, ready: false, key: `opex/${SESSION}/${reservation.id}/print.png` })
  })

  it('confirmação confere o objeto, promove para a chave definitiva e é idempotente', async () => {
    const uploaded = await upload('print.png', 'image/png')
    expect(uploaded).toMatchObject({ name: 'print.png', kind: 'image', url: `/api/opex/files/${uploaded.id}` })
    const doc = files().docs[0]!
    expect(doc).toMatchObject({ ready: true, size: Buffer.byteLength('conteúdo') })
    expect(s3.objects.has(doc.key as string)).toBe(true)
    expect(s3.objects.has(doc.uploadKey as string)).toBe(false)
    await expect(completeOpexFile(uploaded.id, limits)).resolves.toMatchObject({ id: uploaded.id })
    expect(s3.copyFile).toHaveBeenCalledTimes(1)
  })

  it('tamanho real acima do limite descarta; falha do storage preserva a reserva (502)', async () => {
    const reservation = await reserveOpexFile(SESSION, { name: 'a.txt', size: 1 }, limits)
    const doc = files().docs[0]!
    s3.objects.set(doc.uploadKey as string, 'x'.repeat(1024 * 1024 + 5))
    await expect(completeOpexFile(reservation.id, limits)).rejects.toMatchObject({ status: 413, code: 'OPEX_FILE_TOO_LARGE' })
    expect(files().docs).toHaveLength(0)

    const second = await reserveOpexFile(SESSION, { name: 'b.txt', size: 1 }, limits)
    s3.headFailure = { kind: 'forbidden' }
    await expect(completeOpexFile(second.id, limits)).rejects.toMatchObject({ status: 502 })
    expect(files().docs).toHaveLength(1)
  })

  it('o arquivo confirmado vira da mensagem uma vez só; pendente não confirmado não entra', async () => {
    const uploaded = await upload('print.png', 'image/png')
    const notReady = await reserveOpexFile(SESSION, { name: 'x.txt', size: 1 }, limits)
    await expect(claimOpexFiles(SESSION, new Types.ObjectId(), [notReady.id], limits)).rejects.toMatchObject({ code: 'OPEX_FILE_NOT_FOUND' })

    const messageId = new Types.ObjectId()
    const refs = await claimOpexFiles(SESSION, messageId, [uploaded.id], limits)
    expect(refs).toEqual([{ id: uploaded.id, name: 'print.png', mediaType: 'image/png', size: uploaded.size }])
    await expect(claimOpexFiles(SESSION, new Types.ObjectId(), [uploaded.id], limits)).rejects.toMatchObject({ code: 'OPEX_FILE_NOT_FOUND' })
    await expect(deletePendingOpexFile(uploaded.id)).rejects.toMatchObject({ status: 409, code: 'OPEX_FILE_SENT' })
  })

  it('recusa arquivo de outra sessão e mais arquivos que o limite por mensagem', async () => {
    const other = await upload('a.txt', 'text/plain', 'oi', OTHER)
    await expect(claimOpexFiles(SESSION, new Types.ObjectId(), [other.id], limits)).rejects.toMatchObject({ status: 400 })
    const ids = ['1', '2', '3', '4'].map((n) => n.repeat(24))
    await expect(claimOpexFiles(SESSION, new Types.ObjectId(), ids, limits)).rejects.toMatchObject({ code: 'OPEX_TOO_MANY_FILES' })
  })
})

describe('limpeza', () => {
  it('a rotina apaga só pendentes com mais de 24 h (objeto e metadado)', async () => {
    const old = await upload('velho.txt', 'text/plain')
    const fresh = await upload('novo.txt', 'text/plain')
    const sent = await upload('enviado.txt', 'text/plain')
    await claimOpexFiles(SESSION, new Types.ObjectId(), [sent.id], limits)
    const dayAgo = new Date(Date.now() - 25 * 60 * 60 * 1000)
    for (const doc of files().docs) if (String(doc._id) !== fresh.id) doc.createdAt = dayAgo
    const oldKey = files().docs.find((doc) => String(doc._id) === old.id)!.key as string

    const message = await cleanupPendingOpexFiles()
    expect(message).toContain('1 arquivo(s)')
    expect(files().docs.map((doc) => String(doc._id)).sort()).toEqual([fresh.id, sent.id].sort())
    expect(s3.objects.has(oldKey)).toBe(false)
  })

  it('falha do storage mantém o metadado para a próxima execução', async () => {
    await upload('velho.txt', 'text/plain')
    files().docs[0]!.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000)
    s3.deleteFile.mockRejectedValue(new Error('fora do ar'))
    expect(await cleanupPendingOpexFiles()).toContain('com falha no storage')
    expect(files().docs).toHaveLength(1)
  })

  it('excluir a sessão apaga os objetos e os metadados dela', async () => {
    await upload('a.txt', 'text/plain')
    await upload('b.txt', 'text/plain', 'x', OTHER)
    await deleteSessionFiles(SESSION)
    expect(files().docs).toHaveLength(1)
    expect([...s3.objects.keys()].every((key) => key.includes(OTHER))).toBe(true)
  })
})

describe('arquivos no histórico do modelo', () => {
  async function stored(name: string, type: string, content = 'conteúdo') {
    const uploaded = await upload(name, type, content)
    const [ref] = await claimOpexFiles(SESSION, new Types.ObjectId(), [uploaded.id], limits)
    return [{ role: 'user', content: [{ type: 'text', text: 'Veja' }, ...fileMarkers([ref!])] }]
  }

  it('Gemini recebe a imagem baixada do S3 como parte do pedido, com a referência (fileId) antes', async () => {
    const messages = await stored('print.png', 'image/png')
    const [resolved] = (await resolveFileMarkers(messages, 'gemini')) as { content: { type: string; text?: string; mediaType?: string; image?: Uint8Array }[] }[]
    expect(resolved!.content.map((part) => part.type)).toEqual(['text', 'text', 'image'])
    expect(resolved!.content[1]!.text).toContain('fileId')
    expect(Buffer.from(resolved!.content[2]!.image!).toString()).toBe('conteúdo')
  })

  it('DeepSeek recebe só a referência da imagem (sem baixar); texto vai inline', async () => {
    const image = await stored('print.png', 'image/png')
    s3.getFileObject.mockClear()
    const [asReference] = (await resolveFileMarkers(image, 'deepseek')) as { content: { type: string; text?: string }[] }[]
    expect(asReference!.content.map((part) => part.type)).toEqual(['text', 'text'])
    expect(s3.getFileObject).not.toHaveBeenCalled()

    const text = await stored('erro.log', 'text/plain', 'TypeError: x is undefined')
    const [inline] = (await resolveFileMarkers(text, 'deepseek')) as { content: { type: string; text?: string }[] }[]
    expect(inline!.content[1]!.text).toContain('TypeError: x is undefined')
  })

  it('o histórico guarda só o marcador; o peso do arquivo conta no orçamento', async () => {
    const messages = await stored('print.png', 'image/png')
    expect(JSON.stringify(messages)).not.toContain('conteúdo')
    expect(historySize(messages)).toBeGreaterThan(JSON.stringify(messages).length + 7000)
    const turns = [{ role: 'user' as const, modelMessages: messages }, { role: 'assistant' as const, modelMessages: [{ role: 'assistant', content: 'ok' }] }, { role: 'user' as const, modelMessages: [{ role: 'user', content: 'e agora?' }] }]
    expect(selectHistory(turns, 'resumo', 1000).omitted).toBe(2)
  })
})

describe('limites e validação', () => {
  const file = (name: string, size: number) => new File(['x'.repeat(size)], name, { type: 'text/plain' })

  it('a fila separa arquivos grandes e os que passam do limite por mensagem', () => {
    const small = file('a.txt', 3)
    const big = file('b.txt', 1024 * 1024 + 1)
    expect(checkFiles([small, big, small, small], 1, limits)).toMatchObject({ accepted: [small, small], tooLarge: [big], overflow: 1 })
  })

  it('mensagem aceita só texto, só arquivos ou os dois, mas não vazia', () => {
    expect(sendOpexMessageSchema.safeParse({ text: 'oi' }).success).toBe(true)
    expect(sendOpexMessageSchema.safeParse({ fileIds: ['a'.repeat(24)] }).success).toBe(true)
    expect(sendOpexMessageSchema.safeParse({ text: '  ' }).success).toBe(false)
  })

  it('padrão 10 arquivos e 100 MB; configuração antiga recebe o padrão sem perder o resto', () => {
    const old: Record<string, unknown> = { ...DEFAULT_OPEX_AGENT_SETTINGS, instructions: 'Minhas instruções' }
    delete old.files
    const parsed = opexAgentSettingsSchema.parse(withDefaults(old))
    expect(parsed.instructions).toBe('Minhas instruções')
    expect(parsed.files).toEqual({ maxPerMessage: 10, maxSizeMb: 100 })
    expect(opexAgentSettingsSchema.safeParse({ ...DEFAULT_OPEX_AGENT_SETTINGS, files: { maxPerMessage: 51, maxSizeMb: 10 } }).success).toBe(false)
    expect(opexAgentSettingsSchema.safeParse({ ...DEFAULT_OPEX_AGENT_SETTINGS, files: { maxPerMessage: 10, maxSizeMb: 101 } }).success).toBe(false)
  })
})

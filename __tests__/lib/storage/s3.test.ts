import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  version: 'v1',
  send: vi.fn(),
  clients: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/integrations/config', () => ({ getIntegration: vi.fn(async () => ({ values: mocks.values, version: mocks.version })) }))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => ({ step: vi.fn(), error: vi.fn(), request: vi.fn(), success: vi.fn(), response: vi.fn() }),
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn(async () => 'https://assinada') }))
vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    constructor(public config: Record<string, unknown>) {
      mocks.clients.push(config)
    }
    send = (...args: unknown[]) => mocks.send(...args)
  }
  const command = (name: string) =>
    class {
      constructor(readonly input: Record<string, unknown>) {
        Object.assign(this, { name })
      }
    }
  return {
    S3Client,
    PutObjectCommand: command('PutObjectCommand'),
    GetObjectCommand: command('GetObjectCommand'),
    HeadObjectCommand: command('HeadObjectCommand'),
    HeadBucketCommand: command('HeadBucketCommand'),
    CopyObjectCommand: command('CopyObjectCommand'),
    DeleteObjectCommand: command('DeleteObjectCommand'),
  }
})

import { checkBucket, copyFile, deleteFile, getFileObject, getFileStream, getSignedUrlExpiresIn, headFile, uploadFile } from '@/lib/storage/s3'

const base = { endpoint: 'http://minio:9000', region: 'us-east-1', bucket: 'opex', signedUrlExpiresSeconds: 3600, accessKey: 'ak', secretKey: 'sk' }

const lastCommand = () => mocks.send.mock.calls[mocks.send.mock.calls.length - 1][0] as { name: string; input: Record<string, unknown> }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.clients.length = 0
  mocks.values = { ...base }
  mocks.version = String(Math.random())
  mocks.send.mockResolvedValue({})
})

describe('serviço de storage (S3)', () => {
  it('faz upload do objeto no bucket configurado e devolve o resultado do SDK', async () => {
    mocks.send.mockResolvedValue({ ETag: 'abc' })
    const result = await uploadFile('media/x.png', Buffer.from('x'), 'image/png')

    const command = lastCommand()
    expect(command.name).toBe('PutObjectCommand')
    expect(command.input).toMatchObject({ Bucket: 'opex', Key: 'media/x.png', ContentType: 'image/png' })
    expect(result).toEqual({ ETag: 'abc' })
  })

  it('propaga a falha do SDK no upload', async () => {
    mocks.send.mockRejectedValue(new Error('AccessDenied'))
    await expect(uploadFile('k', 'x')).rejects.toThrow('AccessDenied')
  })

  it('lê o arquivo como stream', async () => {
    mocks.send.mockResolvedValue({ Body: 'corpo' })
    expect(await getFileStream('media/x.bin')).toBe('corpo')
    expect(lastCommand().name).toBe('GetObjectCommand')
  })

  it('devolve o arquivo como stream web com tipo e tamanho', async () => {
    mocks.send.mockResolvedValue({ Body: { transformToWebStream: () => 'web-stream' }, ContentType: 'image/png', ContentLength: 3, LastModified: new Date('2026-01-01') })
    const file = await getFileObject('media/x.png')
    expect(file.body).toBe('web-stream')
    expect(file.contentType).toBe('image/png')
    expect(file.contentLength).toBe(3)
  })

  it('lê só os metadados (HeadObject)', async () => {
    mocks.send.mockResolvedValue({ ContentType: 'application/pdf', ContentLength: 10, LastModified: new Date('2026-01-02') })
    expect(await headFile('media/x.pdf')).toEqual({ contentType: 'application/pdf', contentLength: 10, lastModified: new Date('2026-01-02') })
    expect(lastCommand().name).toBe('HeadObjectCommand')
  })

  it('confere o bucket com HeadBucket', async () => {
    expect(await checkBucket()).toEqual({ bucket: 'opex' })
    const command = lastCommand()
    expect(command.name).toBe('HeadBucketCommand')
    expect(command.input).toEqual({ Bucket: 'opex' })
  })

  it('devolve a expiração configurada para as URLs assinadas', async () => {
    expect(await getSignedUrlExpiresIn()).toBe(3600)
    mocks.values = { ...base, signedUrlExpiresSeconds: 60 }
    expect(await getSignedUrlExpiresIn()).toBe(60)
  })

  it('sem endpoint ou credenciais, recusa a operação', async () => {
    mocks.values = { ...base, accessKey: undefined }
    await expect(checkBucket()).rejects.toThrow('S3 Client not initialized')
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('reutiliza os clientes e os recria quando a configuração muda', async () => {
    await checkBucket()
    const created = mocks.clients.length
    await checkBucket()
    expect(mocks.clients.length).toBe(created)

    mocks.version = String(Math.random())
    await checkBucket()
    expect(mocks.clients.length).toBe(created + 1)
  })

  it('com Endpoint público, cria um cliente para o interno e outro para o navegador', async () => {
    mocks.values = { ...base, publicEndpoint: 'https://reserva.exemplo.com/minio' }
    await checkBucket()
    expect(mocks.clients.map((config) => config.endpoint)).toEqual(['http://minio:9000', 'https://reserva.exemplo.com'])
    expect(mocks.clients.every((config) => config.forcePathStyle === true)).toBe(true)
  })

  it('promove um objeto temporário para a chave definitiva (cópia server-side)', async () => {
    await copyFile('attachments/tmp/1/foto.png', 'attachments/1/foto.png')

    const command = lastCommand()
    expect(command.name).toBe('CopyObjectCommand')
    expect(command.input).toEqual({ Bucket: 'opex', Key: 'attachments/1/foto.png', CopySource: 'opex/attachments/tmp/1/foto.png' })
  })

  it('propaga a falha da cópia', async () => {
    mocks.send.mockRejectedValue(new Error('NoSuchKey'))
    await expect(copyFile('a', 'b')).rejects.toThrow('NoSuchKey')
  })

  it('remove o objeto', async () => {
    await deleteFile('attachments/1/foto.png')

    const command = lastCommand()
    expect(command.name).toBe('DeleteObjectCommand')
    expect(command.input).toEqual({ Bucket: 'opex', Key: 'attachments/1/foto.png' })
  })

  it('pede só o trecho quando recebe Range (reprodução de mídia)', async () => {
    mocks.send.mockResolvedValue({ Body: { transformToWebStream: () => 'web-stream' }, ContentType: 'video/mp4', ContentLength: 100, ContentRange: 'bytes 0-99/1000', AcceptRanges: 'bytes' })

    const file = await getFileObject('attachments/1/clip.mp4', { range: 'bytes=0-99' })

    expect(lastCommand().input).toEqual({ Bucket: 'opex', Key: 'attachments/1/clip.mp4', Range: 'bytes=0-99' })
    expect(file.contentRange).toBe('bytes 0-99/1000')
  })
})

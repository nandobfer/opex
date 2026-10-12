import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ values: {} as Record<string, unknown>, version: 'v1' }))

vi.mock('@/lib/integrations/config', () => ({ getIntegration: vi.fn(async () => ({ values: mocks.values, version: mocks.version })) }))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => ({ step: vi.fn(), error: vi.fn(), request: vi.fn(), success: vi.fn(), response: vi.fn() }),
}))

import { getFileUrl, getUploadUrl } from '@/lib/storage/s3'

const base = { endpoint: 'http://minio:9000', region: 'us-east-1', bucket: 'opex', signedUrlExpiresSeconds: 3600, accessKey: 'ak', secretKey: 'sk' }

beforeEach(() => {
  mocks.version = String(Math.random())
})

describe('URLs assinadas do storage: navegador × servidor', () => {
  it('regressão: com Endpoint público, o navegador recebe URL com o host público e o servidor com o interno', async () => {
    mocks.values = { ...base, publicEndpoint: 'http://localhost:9000' }
    expect(new URL(await getUploadUrl('media/a/x.jpg', 'image/jpeg')).host).toBe('localhost:9000')
    expect(new URL(await getFileUrl('media/a/logo.jpg')).host).toBe('localhost:9000')
    expect(new URL(await getFileUrl('media/a/x.jpg', { audience: 'server' })).host).toBe('minio:9000')
    expect(new URL(await getUploadUrl('media/a/in.jpg', 'image/jpeg', 900, 'server')).host).toBe('minio:9000')
  })

  it('regressão: Endpoint público com subcaminho (proxy) assina sem o subcaminho e o põe só na URL', async () => {
    mocks.values = { ...base, publicEndpoint: 'https://reserva.exemplo.com/dev_automacao/minio-dev/' }
    const signed = new URL(await getUploadUrl('media/a/x.jpg', 'image/jpeg'))
    expect(signed.host).toBe('reserva.exemplo.com')
    expect(signed.pathname).toBe('/dev_automacao/minio-dev/opex/media/a/x.jpg')
    // Mesma assinatura que o MinIO calcula ao receber `/opex/...` (subcaminho removido pelo nginx).
    mocks.values = { ...base, publicEndpoint: 'https://reserva.exemplo.com' }
    mocks.version = 'sem-prefixo'
    const plain = new URL(await getUploadUrl('media/a/x.jpg', 'image/jpeg'))
    expect(plain.pathname).toBe('/opex/media/a/x.jpg')
    expect(signed.searchParams.get('X-Amz-Credential')).toBe(plain.searchParams.get('X-Amz-Credential'))
  })

  it('sem Endpoint público, todos usam o Endpoint (ex.: S3 na nuvem)', async () => {
    mocks.values = { ...base, endpoint: 'https://s3.amazonaws.com' }
    expect(new URL(await getFileUrl('k')).host).toBe('s3.amazonaws.com')
    expect(new URL(await getFileUrl('k', { audience: 'server' })).host).toBe('s3.amazonaws.com')
  })

  it('a expiração configurada entra na URL assinada; downloadName força o nome do arquivo', async () => {
    mocks.values = { ...base, signedUrlExpiresSeconds: 120 }
    const signed = new URL(await getFileUrl('media/a/x.pdf', { downloadName: 'relatório final.pdf' }))
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('120')
    expect(signed.searchParams.get('response-content-disposition')).toContain(encodeURIComponent('relatório final.pdf'))
  })

  it('sem endpoint ou credenciais, não gera URL assinada', async () => {
    mocks.values = { ...base, secretKey: undefined }
    await expect(getFileUrl('k')).rejects.toThrow('S3 Client not initialized')
    mocks.values = { ...base, endpoint: undefined }
    await expect(getUploadUrl('k', 'text/plain')).rejects.toThrow('S3 Client not initialized')
  })
})

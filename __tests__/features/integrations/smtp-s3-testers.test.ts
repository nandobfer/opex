import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getIntegrationConfig: vi.fn(),
  verifyConnection: vi.fn(),
  checkBucket: vi.fn(),
}))

vi.mock('@/lib/integrations/config', () => ({
  getIntegrationConfig: mocks.getIntegrationConfig,
  getInternalBaseUrl: vi.fn(async () => 'http://127.0.0.1:3100'),
}))
vi.mock('@/lib/email/mailer', () => ({ verifyConnection: mocks.verifyConnection }))
vi.mock('@/lib/storage/s3', () => ({ checkBucket: mocks.checkBucket }))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/db/models/CronJobState', () => ({ CronJobState: { find: () => ({ lean: async () => [] }) } }))
vi.mock('@/lib/db/models/ApiToken', () => ({ ApiToken: { countDocuments: vi.fn() } }))
vi.mock('@/lib/db/models/Orcamento', () => ({ OrcamentoClient: { countDocuments: vi.fn() } }))
vi.mock('@/lib/pusher/server', () => ({ getRawPusherServer: vi.fn() }))
vi.mock('@/features/ai/server/testers', () => ({ testAiHub: vi.fn(), testGemini: vi.fn(), testJev: vi.fn(), testOpencode: vi.fn() }))

import type { IntegrationId } from '@/lib/integrations/catalog'
import { INTEGRATION_TESTERS } from '@/features/integrations/testers/testers'

function run(id: IntegrationId, config: Record<string, unknown>) {
  mocks.getIntegrationConfig.mockResolvedValue(config)
  const events: Array<[string, string]> = []
  const promise = INTEGRATION_TESTERS[id]({ emit: (level, message) => events.push([level, message]), signal: new AbortController().signal })
  return { events, promise }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('teste de conexão do SMTP', () => {
  it('com host configurado, verifica o transporter e informa sucesso', async () => {
    mocks.verifyConnection.mockResolvedValue(undefined)
    const { events, promise } = run('smtp', { host: 'smtp.exemplo.com', port: 465 })

    await expect(promise).resolves.toBe('SMTP pronto para enviar e-mails')
    expect(mocks.verifyConnection).toHaveBeenCalledTimes(1)
    expect(events.some(([level, message]) => level === 'step' && message.includes('smtp.exemplo.com:465 (TLS)'))).toBe(true)
    expect(events.some(([level]) => level === 'success')).toBe(true)
  })

  it('sem host configurado, falha explicando que os envios estão em modo simulado', async () => {
    const { promise } = run('smtp', { port: 587 })
    await expect(promise).rejects.toThrow('Host SMTP não configurado (envios estão em modo simulado)')
    expect(mocks.verifyConnection).not.toHaveBeenCalled()
  })

  it('quando o servidor recusa, devolve a causa', async () => {
    mocks.verifyConnection.mockRejectedValue(new Error('ECONNREFUSED'))
    const { promise } = run('smtp', { host: 'smtp.exemplo.com', port: 587 })
    await expect(promise).rejects.toThrow('Servidor SMTP recusou: ECONNREFUSED')
  })
})

describe('teste de conexão do Storage S3', () => {
  it('com endpoint e credenciais, confere o bucket e informa sucesso', async () => {
    mocks.checkBucket.mockResolvedValue({ bucket: 'opex' })
    const { events, promise } = run('storage_s3', { endpoint: 'http://minio:9000', accessKey: 'ak', secretKey: 'sk', bucket: 'opex' })

    await expect(promise).resolves.toBe('Storage S3 acessível')
    expect(mocks.checkBucket).toHaveBeenCalledTimes(1)
    expect(events.some(([level, message]) => level === 'step' && message.includes('bucket "opex"'))).toBe(true)
  })

  it('sem endpoint ou credenciais, falha antes de tentar a conexão', async () => {
    const { promise } = run('storage_s3', { endpoint: 'http://minio:9000', bucket: 'opex' })
    await expect(promise).rejects.toThrow('Endpoint ou credenciais do Storage não configurados')
    expect(mocks.checkBucket).not.toHaveBeenCalled()
  })

  it('quando o bucket está inacessível, devolve a causa', async () => {
    mocks.checkBucket.mockRejectedValue(new Error('NoSuchBucket'))
    const { promise } = run('storage_s3', { endpoint: 'http://minio:9000', accessKey: 'ak', secretKey: 'sk', bucket: 'opex' })
    await expect(promise).rejects.toThrow('Bucket inacessível: NoSuchBucket')
  })
})

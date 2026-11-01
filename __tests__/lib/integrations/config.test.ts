import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'crypto'

const mocks = vi.hoisted(() => ({ loadStoredIntegration: vi.fn() }))

vi.mock('@/lib/integrations/store', () => ({
  loadStoredIntegration: mocks.loadStoredIntegration,
  loadStoredIntegrations: vi.fn(),
  invalidateStoredIntegrations: vi.fn(),
  INTEGRATION_CACHE_TTL_MS: 30_000,
}))

import { encryptSecret } from '@/lib/crypto/secretBox'
import { getIntegration, getIntegrationConfig, getInternalBaseUrl } from '@/lib/integrations/config'
import { DEFAULT_CRON_JOBS } from '@/lib/integrations/catalog'

const saved = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  delete process.env.PUSHER_URL
  delete process.env.PUSHER_SECRET
  delete process.env.PUSHER_DEBUG
})

afterEach(() => {
  process.env = { ...saved }
})

const stored = (overrides: Record<string, unknown> = {}) => ({
  integrationId: 'pusher',
  environment: 'interno',
  debugMode: true,
  publicValues: {},
  secretValues: {},
  ...overrides,
})

describe('getIntegrationConfig — precedência banco → .env → default', () => {
  it('sem documento no banco, usa o .env legado', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(null)
    process.env.PUSHER_URL = 'https://soketi.env'
    process.env.PUSHER_SECRET = 'secret-env'

    const integration = await getIntegration('pusher')
    expect(integration.values.url).toBe('https://soketi.env')
    expect(integration.values.secret).toBe('secret-env')
    expect(integration.secretSources.secret).toBe('env')
    expect(integration.environment).toBe('externo')
    expect(integration.stored).toBe(false)
  })

  it('o valor do banco vence o .env, e segredos são descriptografados', async () => {
    process.env.PUSHER_URL = 'https://soketi.env'
    process.env.PUSHER_SECRET = 'secret-env'
    mocks.loadStoredIntegration.mockResolvedValue(
      stored({ publicValues: { url: 'https://soketi.db' }, secretValues: { secret: encryptSecret('secret-db') } }),
    )

    const integration = await getIntegration('pusher')
    expect(integration.values.url).toBe('https://soketi.db')
    expect(integration.values.secret).toBe('secret-db')
    expect(integration.secretSources.secret).toBe('db')
    expect(integration.environment).toBe('interno')
    expect(integration.debugMode).toBe(true)
  })

  it('segredo limpo explicitamente (null) NÃO volta a usar o .env', async () => {
    process.env.PUSHER_SECRET = 'secret-env'
    mocks.loadStoredIntegration.mockResolvedValue(stored({ secretValues: { secret: null } }))

    const integration = await getIntegration('pusher')
    expect(integration.values.secret).toBeUndefined()
    expect(integration.secretSources.secret).toBe('none')
  })

  it('segredo ilegível (chave trocada) é sinalizado e cai no .env', async () => {
    const box = encryptSecret('secret-db')
    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    process.env.PUSHER_SECRET = 'secret-env'
    mocks.loadStoredIntegration.mockResolvedValue(stored({ secretValues: { secret: box } }))

    const integration = await getIntegration('pusher')
    expect(integration.values.secret).toBe('secret-env')
    expect(integration.secretErrors).toEqual(['secret'])
  })

  it('aplica defaults do código (modo, cluster, agendador e jobs)', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(null)
    expect((await getIntegrationConfig('pusher')).mode).toBe('cluster')
    expect((await getIntegrationConfig('pusher')).cluster).toBe('sa1')
    expect((await getIntegrationConfig('crons')).schedulerEnabled).toBe(true)
    expect((await getIntegrationConfig('crons')).jobs).toEqual(DEFAULT_CRON_JOBS)
  })

  it('SMTP e Storage S3: defaults do código, sem fallback do .env', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(null)
    const smtp = await getIntegrationConfig('smtp')
    expect(smtp.host).toBeUndefined()
    expect(smtp.port).toBe(587)

    const s3 = await getIntegrationConfig('storage_s3')
    expect(s3.endpoint).toBeUndefined()
    expect(s3.region).toBe('us-east-1')
    expect(s3.bucket).toBe('default')
    expect(s3.signedUrlExpiresSeconds).toBe(3600)
  })

  it('SMTP e Storage S3: o banco vence o default e os segredos vêm do banco', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(
      stored({
        integrationId: 'storage_s3',
        publicValues: { endpoint: 'http://minio:9000', bucket: 'arquivos' },
        secretValues: { accessKey: encryptSecret('ak'), secretKey: encryptSecret('sk') },
      }),
    )
    const s3 = await getIntegration('storage_s3')
    expect(s3.values.endpoint).toBe('http://minio:9000')
    expect(s3.values.bucket).toBe('arquivos')
    expect(s3.values.accessKey).toBe('ak')
    expect(s3.secretSources.accessKey).toBe('db')
  })

  it('API interna não tem campos nem segredos (documentação gerenciada)', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(null)
    const integration = await getIntegration('internal_api')
    expect(integration.values).toEqual({})
    expect(integration.secretSources).toEqual({})
    expect(integration.swaggerUrl).toMatch(/\/api\/openapi\.json$/)
  })

  it('Engramind: sem URL salva, a documentação é <URL base>/openapi.json; a URL salva vence', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(stored({ integrationId: 'engramind', environment: 'externo', publicValues: { baseUrl: 'http://engramind-api:8000' } }))
    expect((await getIntegration('engramind')).swaggerUrl).toBe('http://engramind-api:8000/openapi.json')
    mocks.loadStoredIntegration.mockResolvedValue(stored({ integrationId: 'engramind', environment: 'externo', publicValues: { baseUrl: 'http://engramind-api:8000' }, swaggerUrl: 'http://outro/docs' }))
    expect((await getIntegration('engramind')).swaggerUrl).toBe('http://outro/docs')
    mocks.loadStoredIntegration.mockResolvedValue(null)
    expect((await getIntegration('engramind')).swaggerUrl).toBeFalsy()
  })

  it('converte booleanos salvos como texto', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(stored({ integrationId: 'crons', publicValues: { schedulerEnabled: 'false' } }))
    expect((await getIntegrationConfig('crons')).schedulerEnabled).toBe(false)
  })

  it('banco indisponível não derruba a integração: usa o .env', async () => {
    mocks.loadStoredIntegration.mockRejectedValue(new Error('mongo down'))
    process.env.PUSHER_URL = 'https://soketi.env'
    expect((await getIntegrationConfig('pusher')).url).toBe('https://soketi.env')
  })

  it('a versão muda quando um valor efetivo muda', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(stored({ publicValues: { url: 'https://a' } }))
    const a = await getIntegration('pusher')
    mocks.loadStoredIntegration.mockResolvedValue(stored({ publicValues: { url: 'https://b' } }))
    const b = await getIntegration('pusher')
    expect(a.version).not.toBe(b.version)
  })

  it('URL interna padrão usa 127.0.0.1 na porta do processo', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(null)
    process.env.PORT = '3868'
    expect(await getInternalBaseUrl()).toBe('http://127.0.0.1:3868')
  })

  it('sem PORT, a URL interna usa a porta 3100', async () => {
    mocks.loadStoredIntegration.mockResolvedValue(null)
    delete process.env.PORT
    expect(await getInternalBaseUrl()).toBe('http://127.0.0.1:3100')
  })
})

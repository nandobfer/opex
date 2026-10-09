import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'crypto'

const mocks = vi.hoisted(() => ({ updateOne: vi.fn() }))

vi.mock('@/lib/db/models/Integration', () => ({ Integration: { collection: { updateOne: mocks.updateOne } } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { seedIntegrationsFromEnv } from '@/lib/db/migrations/seed-integrations-from-env'
import { decryptSecret } from '@/lib/crypto/secretBox'
import { INTEGRATIONS } from '@/lib/integrations/catalog'

const saved = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateOne.mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 })
  process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  process.env.PUSHER_APP_ID = 'app-env'
  process.env.PUSHER_SECRET = 'secret-env'
})

afterEach(() => {
  process.env = { ...saved }
})

function insertFor(id: string) {
  const call = mocks.updateOne.mock.calls.find(([filter, update]) => filter.integrationId === id && update.$setOnInsert)
  return call?.[1].$setOnInsert
}

describe('seedIntegrationsFromEnv', () => {
  it('cria um documento por integração, só na inserção ($setOnInsert)', async () => {
    await seedIntegrationsFromEnv()
    for (const def of INTEGRATIONS) expect(insertFor(def.id)).toBeDefined()

    const pusher = insertFor('pusher')
    expect(pusher.publicValues.appId).toBe('app-env')
    expect(pusher.environment).toBe('externo')
    expect(decryptSecret(pusher.secretValues.secret)).toBe('secret-env')
    expect(JSON.stringify(pusher)).not.toContain('secret-env')
  })

  it('leva os defaults do código, com debug desligado', async () => {
    await seedIntegrationsFromEnv()
    const pusher = insertFor('pusher')
    expect(pusher.publicValues).toMatchObject({ mode: 'cluster', cluster: 'sa1' })
    expect(pusher.debugMode).toBe(false)
    expect(insertFor('internal_api')).toMatchObject({ environment: 'interno', publicValues: {}, secretValues: {} })
    expect(insertFor('crons').publicValues.jobs[0].schedule).toEqual({ type: 'interval', minutes: 5 })
  })

  it('documento existente: completa só segredos nunca gravados', async () => {
    mocks.updateOne.mockResolvedValue({ upsertedCount: 0, modifiedCount: 0 })
    await seedIntegrationsFromEnv()
    const backfill = mocks.updateOne.mock.calls.find(
      ([filter]) => filter.integrationId === 'pusher' && 'secretValues.secret' in filter,
    )
    expect(backfill?.[0]['secretValues.secret']).toEqual({ $exists: false })
  })

  it('sem chave de criptografia não grava segredos (o .env continua valendo)', async () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY
    await seedIntegrationsFromEnv()
    expect(insertFor('pusher').secretValues).toEqual({})
  })
})

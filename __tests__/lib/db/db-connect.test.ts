import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connectMongo: vi.fn(async () => ({ name: 'conexão' })),
  runMigrations: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db/connection', () => ({ connectMongo: mocks.connectMongo }))
vi.mock('@/lib/db/migrations', () => ({ runMigrations: mocks.runMigrations }))
vi.mock('@/lib/audit/record', () => ({ AcaoAuditoria: {}, recordAudit: vi.fn() }))
vi.mock('@/lib/db/plugins/audit.plugin', () => ({ createAuditContext: vi.fn(), auditPlugin: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  mocks.connectMongo.mockClear()
  mocks.runMigrations.mockReset().mockResolvedValue(undefined)
})

describe('dbConnect: migrações sob demanda', () => {
  it('conecta e roda as migrações uma única vez por processo', async () => {
    const { dbConnect } = await import('@/lib/db')
    await expect(dbConnect()).resolves.toEqual({ name: 'conexão' })
    await dbConnect()
    expect(mocks.connectMongo).toHaveBeenCalledTimes(2)
    expect(mocks.runMigrations).toHaveBeenCalledTimes(1)
  })

  it('falha nas migrações propaga o erro e a próxima conexão tenta de novo', async () => {
    mocks.runMigrations.mockRejectedValueOnce(new Error('índice duplicado'))
    const { dbConnect } = await import('@/lib/db')
    await expect(dbConnect()).rejects.toThrow('índice duplicado')
    await expect(dbConnect()).resolves.toEqual({ name: 'conexão' })
    expect(mocks.runMigrations).toHaveBeenCalledTimes(2)
  })
})

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  usage: vi.fn(),
  consumption: vi.fn(),
}))

vi.mock('@/lib/db/models/Ai', () => ({ AiFeatureSetting: { deleteOne: mocks.settings }, AiUsageLog: { deleteMany: mocks.usage } }))
vi.mock('@/lib/db/models/AiConsumption', () => ({ AiConsumption: { deleteMany: mocks.consumption } }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

import { removeUnderstandTaskFeature } from '@/lib/db/migrations/remove-understand-task-feature'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.settings.mockResolvedValue({ deletedCount: 1 })
  mocks.usage.mockResolvedValue({ deletedCount: 3 })
  mocks.consumption.mockResolvedValue({ deletedCount: 2 })
})

describe('migração remove-understand-task-feature (OPE-122)', () => {
  it('apaga só a configuração, o uso e o consumo da feature "understand-task"', async () => {
    await removeUnderstandTaskFeature()
    expect(mocks.settings).toHaveBeenCalledWith({ feature: 'understand-task' })
    expect(mocks.usage).toHaveBeenCalledWith({ feature: 'understand-task' })
    expect(mocks.consumption).toHaveBeenCalledWith({ origin: 'understand-task' })
  })

  it('é idempotente: rodar de novo sem nada para apagar não falha', async () => {
    mocks.settings.mockResolvedValue({ deletedCount: 0 })
    mocks.usage.mockResolvedValue({ deletedCount: 0 })
    mocks.consumption.mockResolvedValue({ deletedCount: 0 })
    await expect(removeUnderstandTaskFeature()).resolves.toBeUndefined()
    await expect(removeUnderstandTaskFeature()).resolves.toBeUndefined()
  })
})

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

describe('remoção de "Entender tarefas"', () => {
  // Só sobram a migração que apaga os dados (e o registro dela) e o redirecionamento do link antigo da aba.
  const ALLOWED = ['remove-understand-task-feature.ts', 'migrations/registry.ts', 'features/ai/constants.ts']

  it('nenhum código do app referencia a feature (só a migração que a apaga e o redirecionamento do link antigo)', () => {
    const offenders = walk(join(process.cwd(), 'src'))
      .filter((file) => /\.(ts|tsx)$/.test(file) && !ALLOWED.some((allowed) => file.endsWith(allowed)))
      .filter((file) => /understand-task|UnderstandTask|entender-tarefas|understand_task|Entender tarefas/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})

describe('link antigo da aba', () => {
  it('?aba=entender-tarefas é o único resto e abre Provedores', async () => {
    const { AI_TAB_ALIASES } = await import('@/features/ai/constants')
    expect(AI_TAB_ALIASES['entender-tarefas']).toEqual({ tab: 'provedores' })
  })
})

import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ cron: vi.fn(), plugins: vi.fn(), engramind: vi.fn() }))

vi.mock('@/lib/integrations/scheduler', () => ({ startCronScheduler: mocks.cron }))
vi.mock('@/features/plugins/server/boot', () => ({ startPluginKernel: mocks.plugins }))
vi.mock('@/features/engramind/server/memory-network', () => ({ scheduleEngramindStartupCheck: mocks.engramind }))

import { register } from '@/instrumentation'

const previous = process.env.NEXT_RUNTIME

describe('instrumentation (register)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    if (previous === undefined) delete process.env.NEXT_RUNTIME
    else process.env.NEXT_RUNTIME = previous
  })

  it('no runtime Node sobe o agendador, o kernel de plugins e a checagem do Engramind', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    await register()
    expect(mocks.cron).toHaveBeenCalledTimes(1)
    expect(mocks.plugins).toHaveBeenCalledTimes(1)
    expect(mocks.engramind).toHaveBeenCalledTimes(1)
  })

  it('no runtime edge não sobe nada', async () => {
    process.env.NEXT_RUNTIME = 'edge'
    await register()
    expect(mocks.cron).not.toHaveBeenCalled()
    expect(mocks.plugins).not.toHaveBeenCalled()
  })

  // Regressão do build com Webpack: com `return` antecipado, o bundle edge seguia os `import()` e
  // falhava em `child_process`/`fs`. Os imports precisam estar dentro do `if` do runtime Node.
  it('os import() ficam dentro do bloco do runtime Node, sem return antecipado', () => {
    const source = readFileSync(new URL('../src/instrumentation.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/NEXT_RUNTIME !== "nodejs"\) return/)
    const block = source.indexOf('if (process.env.NEXT_RUNTIME === "nodejs") {')
    expect(block).toBeGreaterThan(-1)
    expect(source.indexOf('await import(')).toBeGreaterThan(block)
  })
})

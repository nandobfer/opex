import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnvironmentsBuilder } from '@/features/environments/schemas'

/** Builder do servidor: salvar (recriar, pendente ou nada), ações com confirmação, pendência, auditoria e tempo real. */

const mocks = vi.hoisted(() => ({
  doc: null as Record<string, unknown> | null,
  building: false,
  preview: false,
  exclusive: vi.fn(async <T,>(run: () => Promise<T>) => run()),
  audit: vi.fn(async () => undefined),
  publish: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({ recordAudit: mocks.audit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/instance', () => ({ isPreviewInstance: () => mocks.preview }))
vi.mock('@/features/agentic/server/build-queue', () => ({ isBuildActive: async () => mocks.building, runExclusiveBuild: mocks.exclusive }))
vi.mock('@/features/environments/server/models', () => ({
  environmentsDb: async () => {},
  EnvironmentsState: {
    findOne: () => ({ select: () => ({ lean: async () => mocks.doc }) }),
    updateOne: async (_query: unknown, update: { $set: Record<string, unknown> }) => {
      mocks.doc = { ...(mocks.doc ?? {}), ...update.$set }
    },
    // Atômico como no Mongo: confere e grava no mesmo passo (sem `await` no meio).
    findOneAndUpdate: (query: { builderPending?: unknown }, update: { $set: Record<string, unknown> }) => {
      const before = mocks.doc
      const matches = Boolean(before) && (!('builderPending' in query) || (before!.builderPending !== null && before!.builderPending !== undefined))
      if (matches) mocks.doc = { ...before, ...update.$set }
      return { lean: async () => (matches ? before : null) }
    },
  },
}))
vi.mock('@/features/environments/server/settings', () => ({ envLog: { info: vi.fn(), warn: vi.fn() }, publishEnvironment: mocks.publish, runEnvHost: vi.fn() }))

import { getBuilderStatus, runBuilderAction, runPendingBuilderRecreate, saveBuilderConfig } from '@/features/environments/server/builder'

const config = (overrides: Partial<EnvironmentsBuilder> = {}): EnvironmentsBuilder => ({ name: 'limited-builder', memoryGb: 24, cpus: 6, swapGb: 16, useAsDefault: true, allowNetworkHost: true, ...overrides })

/** Docker do host simulado: o estado do builder e os comandos que rodaram. */
function host(options: { exists?: boolean; driver?: string; state?: string; fail?: RegExp; dockerDown?: boolean; noContainer?: boolean } = {}) {
  const exists = options.exists ?? true
  const commands: string[] = []
  const status = [
    '@@opex-builder name limited-builder',
    '@@opex-builder inspect',
    ...(exists ? [`Driver:        ${options.driver ?? 'docker-container'}`, 'Status:                running', 'BuildKit daemon flags: --allow-insecure-entitlement=network.host'] : ['ERROR: no builder found']),
    `@@opex-builder inspect-exit ${exists ? 0 : 1}`,
    '@@opex-builder current',
    'limited-builder',
    '@@opex-builder container',
    ...(exists && !options.noContainer ? [`${options.state ?? 'running'}|25769803776|42949672960|6000000000|0|0`] : []),
    '@@opex-builder stats',
    ...(exists && !options.noContainer ? ['1.50%|2GiB / 24GiB|8.33%'] : []),
    '@@opex-builder host',
    ...(options.dockerDown ? [] : ['8|33648398336']),
    `@@opex-builder docker-exit ${options.dockerDown ? 1 : 0}`,
  ].join('\n')
  const run = vi.fn(async (command: string) => {
    if (command.includes('@@opex-builder')) return { exitCode: 0, output: status }
    commands.push(command)
    if (options.fail?.test(command)) return { exitCode: 1, output: 'ERROR: failed to create\n' }
    return { exitCode: 0, output: '' }
  })
  return { run, commands }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.doc = null
  mocks.building = false
  mocks.preview = false
})

describe('estado', () => {
  it('sem configuração: mostra o builder atual como não gerenciado, com a sugestão lida do host', async () => {
    const dto = await getBuilderStatus(host().run)
    expect(dto).toMatchObject({ managed: false, name: 'limited-builder', status: 'running', isHostDefault: true, applied: { memoryGb: 24, swapGb: 16, cpus: 6 }, container: 'buildx_buildkit_limited-builder0' })
    expect(dto.suggested).toEqual(config())
    expect(dto.usage).toMatchObject({ cpuPercent: 1.5 })
  })

  it('Docker do servidor fora do ar: "Sem resposta" com o erro (nunca "Não existe"), e salvar recusa sem gravar', async () => {
    const { run, commands } = host({ exists: false, dockerDown: true })
    const dto = await getBuilderStatus(run)
    expect(dto.status).toBe('unknown')
    expect(dto.error).toContain('O Docker do servidor não respondeu')
    await expect(saveBuilderConfig(config(), 'local', run)).rejects.toMatchObject({ status: 502, code: 'BUILDER_DOCKER_FAILED' })
    expect(mocks.doc).toBeNull()
    expect(commands).toEqual([])
  })

  it('builder do driver docker: sem container, a sugestão é um builder novo do Opex', async () => {
    const dto = await getBuilderStatus(host({ driver: 'docker' }).run)
    expect(dto.status).toBe('unmanageable')
    expect(dto.suggested.name).toBe('opex-builder')
  })
})

describe('salvar a configuração', () => {
  it('mesmos limites (assumir o builder de hoje): só salva, nada é recriado', async () => {
    const { run, commands } = host()
    const result = await saveBuilderConfig(config(), 'local', run)
    expect(commands).toEqual([])
    expect(mocks.doc?.builder).toEqual(config())
    expect(result.message).toContain('já estavam aplicados')
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'Ambiente', entidadeId: 'builder', acao: 'CRIAR' }))
    expect(mocks.publish).toHaveBeenCalledWith(null, 'builder')
  })

  it('limites novos sem build: recria com --keep-state na vez da fila global do build', async () => {
    const { run, commands } = host()
    const result = await saveBuilderConfig(config({ memoryGb: 16, swapGb: 8 }), 'local', run)
    expect(mocks.exclusive).toHaveBeenCalledTimes(1)
    expect(commands[0]).toContain('docker buildx rm --keep-state limited-builder')
    expect(commands[0]).toContain('--driver-opt memory=16384m')
    expect(result.message).toContain('recriado com os novos limites')
    expect(mocks.doc?.builderPending).toBeNull()
  })

  it('limites novos com build em andamento: docker update agora e a recriação fica pendente', async () => {
    mocks.building = true
    const { run, commands } = host()
    const result = await saveBuilderConfig(config({ memoryGb: 16, swapGb: 8 }), 'local', run)
    expect(commands).toEqual(['docker update --memory 16384m --memory-swap 24576m --cpus 6 buildx_buildkit_limited-builder0 >/dev/null'])
    expect(mocks.exclusive).not.toHaveBeenCalled()
    expect(mocks.doc?.builderPending).toMatchObject({ reason: expect.any(String) })
    expect(result.message).toContain('roda quando o build terminar')
  })

  it('instância no buildx sem o container: salvar recria com os limites novos e a linha avisa', async () => {
    mocks.doc = { builder: config() }
    const { run, commands } = host({ noContainer: true })
    expect((await getBuilderStatus(run)).containerMissing).toBe(true)
    const result = await saveBuilderConfig(config({ memoryGb: 16, swapGb: 8 }), 'local', run)
    expect(commands[0]).toContain('docker buildx rm --keep-state limited-builder')
    expect(commands[0]).toContain('--driver-opt memory=16384m')
    expect(result.message).not.toContain('já estavam aplicados')
  })

  it('instância sem container com build em andamento: sem docker update (não há container), recriação pendente', async () => {
    mocks.building = true
    const { run, commands } = host({ noContainer: true })
    const result = await saveBuilderConfig(config({ memoryGb: 16, swapGb: 8 }), 'local', run)
    expect(commands).toEqual([])
    expect(mocks.doc?.builderPending).toBeTruthy()
    expect(result.message).toContain('roda quando o build terminar')
  })

  it('builder inexistente: só salva e a linha oferece Criar', async () => {
    const { run, commands } = host({ exists: false })
    const result = await saveBuilderConfig(config(), 'local', run)
    expect(commands).toEqual([])
    expect(result.message).toContain('use Criar')
  })

  it('mais CPUs que o servidor: recusa sem gravar', async () => {
    await expect(saveBuilderConfig(config({ cpus: 12 }), 'local', host().run)).rejects.toMatchObject({ status: 422 })
    expect(mocks.doc).toBeNull()
  })

  it('falha ao recriar: erro 502 com a última linha e a falha fica na linha', async () => {
    const { run } = host({ fail: /buildx rm --keep-state/ })
    await expect(saveBuilderConfig(config({ memoryGb: 16, swapGb: 8 }), 'local', run)).rejects.toMatchObject({ status: 502, code: 'BUILDER_FAILED' })
    expect(mocks.doc?.builderLastAction).toMatchObject({ ok: false, message: expect.stringContaining('ERROR: failed to create') })
    expect(mocks.publish).toHaveBeenCalledWith(null, 'builder')
  })
})

describe('ações', () => {
  beforeEach(() => {
    mocks.doc = { builder: config() }
  })

  it('sem configuração: pede para gerenciar antes', async () => {
    mocks.doc = null
    await expect(runBuilderAction({ action: 'start' }, 'local', host().run)).rejects.toMatchObject({ status: 409, code: 'BUILDER_NOT_CONFIGURED' })
  })

  it('criar o builder que sumiu: cria com os limites salvos, audita e publica', async () => {
    const { run, commands } = host({ exists: false })
    const result = await runBuilderAction({ action: 'create' }, 'local', run)
    expect(commands[0]).toContain('docker buildx create --name limited-builder')
    expect(result.message).toBe('Builder limited-builder criado com os limites salvos.')
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'CRIAR', depois: expect.objectContaining({ acao: 'create' }) }))
    expect(mocks.publish).toHaveBeenCalledWith(null, 'builder')
  })

  it('apagar exige confirmação; com build em andamento exige force', async () => {
    const { run, commands } = host()
    await expect(runBuilderAction({ action: 'delete' }, 'local', run)).rejects.toMatchObject({ status: 409, code: 'BUILDER_CONFIRM_REQUIRED' })
    mocks.building = true
    await expect(runBuilderAction({ action: 'delete', confirm: true }, 'local', run)).rejects.toMatchObject({ status: 409, code: 'BUILDER_BUILD_RUNNING' })
    await expect(runBuilderAction({ action: 'stop' }, 'local', run)).rejects.toMatchObject({ status: 409, code: 'BUILDER_BUILD_RUNNING' })
    expect(commands).toEqual([])
    await runBuilderAction({ action: 'delete', confirm: true, force: true }, 'local', run)
    expect(commands).toEqual(['docker buildx rm limited-builder'])
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'EXCLUIR', depois: expect.objectContaining({ forcado: true }) }))
  })

  it('recriar com build em andamento fica pendente; sem build recria na vez da fila', async () => {
    mocks.building = true
    const { run, commands } = host()
    expect((await runBuilderAction({ action: 'recreate' }, 'local', run)).message).toContain('roda quando ele terminar')
    expect(commands).toEqual([])
    expect(mocks.doc?.builderPending).toBeTruthy()
    mocks.building = false
    await runBuilderAction({ action: 'recreate' }, 'local', run)
    expect(mocks.exclusive).toHaveBeenCalledTimes(1)
    expect(commands[0]).toContain('--keep-state')
    expect(mocks.doc?.builderPending).toBeNull()
  })

  it('levantar um builder que não existe: pede Criar', async () => {
    await expect(runBuilderAction({ action: 'start' }, 'local', host({ exists: false }).run)).rejects.toMatchObject({ status: 409, code: 'BUILDER_MISSING' })
  })
})

describe('recriação pendente', () => {
  it('roda só sem build, tira a pendência e audita como sistema', async () => {
    mocks.doc = { builder: config(), builderPending: { requestedAt: new Date(), reason: 'x' } }
    const { run, commands } = host()
    mocks.building = true
    expect(await runPendingBuilderRecreate(run)).toBe(false)
    expect(commands).toEqual([])
    mocks.building = false
    expect(await runPendingBuilderRecreate(run)).toBe(true)
    expect(commands[0]).toContain('docker buildx rm --keep-state limited-builder')
    expect(mocks.doc?.builderPending).toBeNull()
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'system' }))
  })

  it('dois chamadores ao mesmo tempo (tick e motor da fila): uma única recriação', async () => {
    mocks.doc = { builder: config(), builderPending: { requestedAt: new Date(), reason: 'x' } }
    const { run, commands } = host()
    const results = await Promise.all([runPendingBuilderRecreate(run), runPendingBuilderRecreate(run)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(commands.filter((command) => command.includes('--keep-state'))).toHaveLength(1)
    expect(mocks.audit).toHaveBeenCalledTimes(1)
  })

  it('recriação pendente que falha: a pendência não volta e a falha fica na linha', async () => {
    mocks.doc = { builder: config(), builderPending: { requestedAt: new Date(), reason: 'x' } }
    const { run } = host({ fail: /--keep-state/ })
    expect(await runPendingBuilderRecreate(run)).toBe(false)
    expect(mocks.doc?.builderPending).toBeNull()
    expect(mocks.doc?.builderLastAction).toMatchObject({ ok: false })
    expect(await runPendingBuilderRecreate(run)).toBe(false)
  })

  it('sem pendência ou na prévia de uma mesa: não faz nada', async () => {
    mocks.doc = { builder: config() }
    const { run, commands } = host()
    expect(await runPendingBuilderRecreate(run)).toBe(false)
    mocks.doc = { builder: config(), builderPending: { requestedAt: new Date(), reason: 'x' } }
    mocks.preview = true
    expect(await runPendingBuilderRecreate(run)).toBe(false)
    expect(commands).toEqual([])
  })
})

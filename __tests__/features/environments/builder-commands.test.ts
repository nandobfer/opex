import { describe, expect, it } from 'vitest'
import {
  appliedLimits,
  builderCreateCommand,
  builderDeleteCommand,
  builderDeployEnsureCommand,
  builderEnsureCommand,
  builderRecreateCommand,
  builderStatusCommand,
  builderStopCommand,
  builderUpdateCommand,
  cpuModeOf,
  limitsDiffer,
  needsRecreate,
  parseBuilderStatus,
  unknownFlags,
} from '@/features/environments/builder-commands'
import { builderConfirmText, builderNotices, limitsText } from '@/features/environments/builder-view'
import { buildCommand, upCommand, type ComposePlan, type DockerTarget } from '@/features/environments/commands'
import { deploySteps } from '@/features/environments/pipeline'
import { DEFAULT_ENVIRONMENTS_SETTINGS, environmentsBuilderSchema, type EnvironmentsBuilder, type Machine } from '@/features/environments/schemas'
import type { EnvironmentsBuilderDto } from '@/features/environments/types'

/** Builder do buildx do servidor: comandos, leitura do estado, limites e o build dos deploys. */

const config = (overrides: Partial<EnvironmentsBuilder> = {}): EnvironmentsBuilder => ({ name: 'limited-builder', memoryGb: 24, cpus: 6, swapGb: 16, useAsDefault: true, allowNetworkHost: true, ...overrides })

/** Saída real do `builderStatusCommand` no host (limites aplicados por `docker update`). */
const HOST_OUTPUT = [
  '@@opex-builder name limited-builder',
  '@@opex-builder inspect',
  'Name:          limited-builder',
  'Driver:        docker-container',
  'Last Activity: 2026-11-24 16:55:19 +0000 UTC',
  '',
  'Nodes:',
  'Name:                  limited-builder0',
  'Endpoint:              rootless',
  'Driver Options:        default-load="true"',
  'Status:                running',
  'BuildKit daemon flags: --allow-insecure-entitlement=network.host',
  'BuildKit version:      v0.32.2',
  '',
  '@@opex-builder inspect-exit 0',
  '@@opex-builder current',
  'limited-builder',
  '@@opex-builder container',
  'running|25769803776|42949672960|6000000000|0|0',
  '@@opex-builder stats',
  '0.00%|2.589GiB / 24GiB|10.79%',
  '@@opex-builder host',
  '8|33648398336',
  '@@opex-builder docker-exit 0',
].join('\n')

describe('comandos do builder', () => {
  it('criar: docker-container, default-load, RAM em MiB, memory-swap = RAM + swap, CPU por quota, flag e --use', () => {
    const command = builderCreateCommand(config())
    expect(command).toContain('docker buildx create --name limited-builder --driver docker-container')
    expect(command).toContain('--driver-opt default-load=true')
    expect(command).toContain('--driver-opt memory=24576m')
    expect(command).toContain('--driver-opt memory-swap=40960m')
    expect(command).toContain('--driver-opt cpu-period=100000 --driver-opt cpu-quota=600000')
    expect(command).toContain("--buildkitd-flags '--allow-insecure-entitlement=network.host'")
    expect(command).toContain(' --use')
  })

  it('sem limites: só default-load; swap vazio usa o padrão do Docker; sem flag nem --use', () => {
    const command = builderCreateCommand(config({ memoryGb: null, cpus: null, swapGb: null, useAsDefault: false, allowNetworkHost: false }))
    expect(command.match(/--driver-opt/g)).toHaveLength(1)
    expect(command).not.toContain('--buildkitd-flags')
    expect(command).not.toContain('--use')
    expect(builderCreateCommand(config({ swapGb: null }))).not.toContain('memory-swap')
    expect(builderCreateCommand(config({ swapGb: 0 }))).toContain('memory-swap=24576m')
  })

  it('recriar mantém o estado (--keep-state) e volta a ser o builder do host', () => {
    const command = builderRecreateCommand(config())
    expect(command).toMatch(/^\{ docker buildx rm --keep-state limited-builder/)
    expect(command).toContain('docker buildx inspect --bootstrap limited-builder')
    expect(command).toContain('docker buildx use limited-builder')
  })

  it('garantir só cria quando falta; derrubar e apagar', () => {
    expect(builderEnsureCommand(config())).toMatch(/docker buildx inspect limited-builder >\/dev\/null 2>&1 \|\| docker buildx create/)
    expect(builderStopCommand(config())).toBe('docker buildx stop limited-builder')
    expect(builderDeleteCommand(config())).toBe('docker buildx rm limited-builder')
  })

  it('docker update segue o modo de CPU do container e não tira limite', () => {
    expect(builderUpdateCommand(config(), 'nano')).toBe('docker update --memory 24576m --memory-swap 40960m --cpus 6 buildx_buildkit_limited-builder0 >/dev/null')
    expect(builderUpdateCommand(config({ swapGb: null }), 'quota')).toContain('--memory-swap 49152m --cpu-period 100000 --cpu-quota 600000')
    expect(builderUpdateCommand(config({ memoryGb: null, swapGb: null, cpus: null }), 'nano')).toBeNull()
  })

  it('o estado roda com o nome salvo ou, sem ele, descobre o builder atual do host', () => {
    expect(builderStatusCommand('limited-builder')).toContain("n='limited-builder'")
    expect(builderStatusCommand(null)).toContain("n=$(docker buildx inspect 2>/dev/null | awk '/^Name:/{print $2; exit}')")
  })
})

describe('leitura do estado', () => {
  it('saída real do host: 24 GiB, swap +16 GiB, 6 CPUs (NanoCpus), flag conhecida, uso e host', () => {
    const parsed = parseBuilderStatus(HOST_OUTPUT)
    expect(parsed).toMatchObject({ name: 'limited-builder', exists: true, driver: 'docker-container', nodeStatus: 'running', current: 'limited-builder', driverOpts: { 'default-load': 'true' } })
    expect(appliedLimits(parsed.container!)).toEqual({ memoryGb: 24, swapGb: 16, cpus: 6 })
    expect(cpuModeOf(parsed.container)).toBe('nano')
    expect(parsed.usage).toEqual({ cpuPercent: 0, memoryUsage: '2.589GiB / 24GiB', memoryPercent: 10.79 })
    expect(parsed.host).toEqual({ cpus: 8, memoryGb: 31.34 })
    expect(unknownFlags(parsed.flags)).toEqual([])
  })

  it('CPU por quota/período, builder inexistente e flags desconhecidas', () => {
    expect(appliedLimits({ state: 'running', memoryBytes: 0, memorySwapBytes: 0, nanoCpus: 0, cpuPeriod: 100000, cpuQuota: 250000 })).toEqual({ memoryGb: null, swapGb: null, cpus: 2.5 })
    const missing = parseBuilderStatus(['@@opex-builder name sumiu', '@@opex-builder inspect', 'ERROR: no builder "sumiu" found', '', '@@opex-builder inspect-exit 1', '@@opex-builder current', 'rootless', '@@opex-builder container', '@@opex-builder stats', '@@opex-builder host', '8|33648398336', '@@opex-builder docker-exit 0'].join('\n'))
    expect(missing).toMatchObject({ name: 'sumiu', exists: false, container: null, current: 'rootless' })
    expect(unknownFlags(['--allow-insecure-entitlement=network.host', '--debug'])).toEqual(['--debug'])
  })

  it('limites salvos x aplicados: iguais não recriam; diferentes ou flag trocada recriam', () => {
    const parsed = parseBuilderStatus(HOST_OUTPUT)
    expect(needsRecreate(config(), parsed)).toBe(false)
    expect(needsRecreate(config({ memoryGb: 16 }), parsed)).toBe(true)
    expect(needsRecreate(config({ allowNetworkHost: false }), parsed)).toBe(true)
    expect(limitsDiffer(config({ swapGb: null }), { memoryGb: 24, swapGb: 24, cpus: 6 })).toBe(false)
    expect(limitsDiffer(config({ cpus: null }), { memoryGb: 24, swapGb: 16, cpus: 6 })).toBe(true)
  })

  it('Docker fora do ar: o inspect falha, mas dockerOk=false impede ler como "não existe"', () => {
    const down = parseBuilderStatus(['@@opex-builder name limited-builder', '@@opex-builder inspect', 'ERROR: Cannot connect to the Docker daemon', '', '@@opex-builder inspect-exit 1', '@@opex-builder current', '@@opex-builder container', '@@opex-builder stats', '@@opex-builder host', '', '@@opex-builder docker-exit 1'].join('\n'))
    expect(down).toMatchObject({ dockerOk: false, exists: false })
    expect(parseBuilderStatus(HOST_OUTPUT).dockerOk).toBe(true)
    expect(builderStatusCommand('x')).toContain("docker-exit %s")
  })

  it('instância no buildx sem o container: os limites precisam ser aplicados (recriar)', () => {
    const parsed = parseBuilderStatus(HOST_OUTPUT)
    expect(needsRecreate(config(), { ...parsed, container: null })).toBe(true)
    expect(needsRecreate(config(), { ...parsed, exists: false, container: null })).toBe(false)
  })

  it('swap exige a RAM no schema', () => {
    expect(environmentsBuilderSchema.safeParse(config({ memoryGb: null })).success).toBe(false)
    expect(environmentsBuilderSchema.safeParse(config({ name: '-x' })).success).toBe(false)
  })
})

describe('build dos ambientes no servidor', () => {
  const plan: ComposePlan = { projectName: 'loja', dir: '"$HOME/opex-envs/loja"', filesOn: 'server', composeFiles: ['docker-compose.yml'], services: [] }
  const server = (serverBuilder: EnvironmentsBuilder | null): DockerTarget => ({ machine: 'server', context: 'opex-local', builder: 'opex-local-builder', serverBuilder })
  const steps = (serverBuilder: EnvironmentsBuilder | null) =>
    deploySteps({ settings: DEFAULT_ENVIRONMENTS_SETTINGS, plan, buildOn: 'server', runOn: 'server', targets: { server: server(serverBuilder), pc: { machine: 'pc', context: 'opex-local', builder: 'opex-local-builder' } } as Record<Machine, DockerTarget>, buildServices: ['app'], ports: [], healthUrl: null })

  it('com builder configurado: BUILDX_BUILDER no build, cria quando falta e o log diz qual builder', () => {
    const build = steps(config())[0]!
    expect(build.command).toContain(builderDeployEnsureCommand(config()))
    expect(build.command).toContain('BUILDX_BUILDER=limited-builder docker compose')
    expect(build.command).toContain('Builder limited-builder não existia: criando com os limites salvos.')
    expect(build.note).toBe('Build com o builder do buildx "limited-builder" (BUILDX_BUILDER).')
    expect(build.lock).toBe('server')
  })

  it('sem configuração: o build é o de antes (padrão do host) e só o log avisa', () => {
    const build = steps(null)[0]!
    expect(build.command).toBe(buildCommand(plan, server(null)))
    expect(build.command).not.toContain('BUILDX_BUILDER')
    expect(build.note).toBe('Build com o builder padrão do host.')
  })

  it('BUILDX_BUILDER só entra quando há build', () => {
    expect(upCommand(plan, server(config()), true)).toContain('BUILDX_BUILDER=limited-builder')
    expect(upCommand(plan, server(config()), false)).not.toContain('BUILDX_BUILDER')
  })
})

describe('textos da linha', () => {
  const dto = (overrides: Partial<EnvironmentsBuilderDto> = {}): EnvironmentsBuilderDto => ({
    config: config(), name: 'limited-builder', managed: true, status: 'running', driver: 'docker-container', container: 'buildx_buildkit_limited-builder0', containerMissing: false, isHostDefault: true,
    applied: { memoryGb: 24, swapGb: 16, cpus: 6 }, limitsDiffer: false, flags: [], unknownFlags: [], usage: null, host: null, suggested: config(), pending: null, lastAction: null, buildRunning: false, error: null, checkedAt: '',
    ...overrides,
  })

  it('limites, confirmação e avisos', () => {
    expect(limitsText({ memoryGb: 24, swapGb: 16, cpus: 6 })).toBe('RAM 24 GiB · swap +16 GiB · 6 CPUs')
    expect(limitsText({ memoryGb: null, swapGb: null, cpus: null })).toBe('RAM sem limite · CPU sem limite')
    expect(builderConfirmText('delete', dto({ buildRunning: true })).description).toContain('as prévias das mesas usam o builder padrão do Docker')
    expect(builderConfirmText('delete', dto({ buildRunning: true })).description).toContain('Há um build em andamento')
    expect(builderNotices(dto({ limitsDiffer: true, pending: { requestedAt: '', reason: '' }, lastAction: { action: 'recreate', ok: false, message: 'Não foi possível recriar', at: '' } })).map((item) => item.tone)).toEqual(['error', 'warning', 'warning'])
  })
})

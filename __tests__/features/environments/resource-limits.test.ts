import { describe, expect, it } from 'vitest'
import { initialLimits, limitsPendingDeploy, mergeComposeServices, orphanServices, switchLimitMode } from '@/features/environments/limits-form'
import {
  appliedEnvironmentLimits,
  appliedLimitsText,
  environmentLimitsDiffer,
  environmentLimitsText,
  environmentLimitsOf,
  limitsForService,
  NO_LIMITS,
  unknownLimitServices,
  type ResourceLimits,
} from '@/features/environments/resource-limits'
import type { EnvironmentLimits } from '@/features/environments/schemas'

/** Limites de recursos dos ambientes (OPE-193): aplicados x salvos, textos e as regras do formulário. */

const L = (memoryGb: number | null, cpus: number | null = null, swapGb: number | null = null): ResourceLimits => ({ memoryGb, swapGb, cpus })
const svc = (service: string, limits: ResourceLimits | null) => ({ service, limits })
const shared = (limits: ResourceLimits): EnvironmentLimits => ({ mode: 'shared', ...limits })

describe('aplicados no host', () => {
  it('iguais em todos os serviços = modo único; diferentes = por serviço; sem limite ou sem leitura = null', () => {
    expect(appliedEnvironmentLimits([svc('app', L(4, 2)), svc('db', L(4, 2))])).toEqual(shared(L(4, 2)))
    expect(appliedEnvironmentLimits([svc('app', L(4)), svc('db', L(1)), svc('app', L(4))])).toEqual({ mode: 'service', services: [{ service: 'app', ...L(4) }, { service: 'db', ...L(1) }] })
    expect(appliedEnvironmentLimits([svc('app', NO_LIMITS)])).toBeNull()
    expect(appliedEnvironmentLimits([svc('app', null)])).toBeNull()
    expect(appliedEnvironmentLimits([])).toBeNull()
  })

  it('textos: modo único, por serviço e "sem limite"', () => {
    expect(environmentLimitsText(shared(L(4, 2)))).toBe('RAM 4 GiB · swap padrão · 2 CPUs')
    expect(environmentLimitsText(shared(NO_LIMITS))).toBe('sem limite')
    expect(environmentLimitsText({ mode: 'service', services: [{ service: 'app', ...L(2, null, 0) }, { service: 'db', ...NO_LIMITS }] })).toBe('app: RAM 2 GiB · sem swap · CPU sem limite')
    expect(appliedLimitsText([svc('app', NO_LIMITS)])).toBe('sem limite')
    expect(appliedLimitsText([svc('app', null)])).toBeNull()
  })

  it('limites por serviço no deploy e linhas que não existem no compose', () => {
    const perService: EnvironmentLimits = { mode: 'service', services: [{ service: 'app', ...L(2) }, { service: 'velho', ...L(1) }, { service: 'db', ...NO_LIMITS }] }
    expect(limitsForService(perService, 'app')).toEqual(L(2))
    expect(limitsForService(perService, 'db')).toBeNull()
    expect(limitsForService(shared(L(3)), 'qualquer')).toEqual(L(3))
    expect(limitsForService(shared(NO_LIMITS), 'app')).toBeNull()
    expect(unknownLimitServices(perService, ['app', 'db'])).toEqual(['velho'])
    expect(environmentLimitsOf(null)).toEqual(shared(NO_LIMITS))
  })
})

describe('salvos x aplicados', () => {
  it('só conta serviço com limite salvo; swap salvo vazio aceita o padrão do Docker', () => {
    expect(environmentLimitsDiffer(shared(L(4, 2)), [svc('app', L(4, 2))])).toBe(false)
    expect(environmentLimitsDiffer(shared(L(4, 2)), [svc('app', L(4, 2, 4))])).toBe(false)
    expect(environmentLimitsDiffer(shared(L(8, 2)), [svc('app', L(4, 2))])).toBe(true)
    // Sem limite salvo, o que o compose declara não é divergência.
    expect(environmentLimitsDiffer(shared(NO_LIMITS), [svc('app', L(4))])).toBe(false)
    expect(environmentLimitsDiffer({ mode: 'service', services: [{ service: 'db', ...L(1) }] }, [svc('app', L(4)), svc('db', L(1))])).toBe(false)
    expect(environmentLimitsDiffer(shared(L(4)), [svc('app', null)])).toBe(false)
  })

  it('a linha só avisa em ambiente implantado', () => {
    const env = { limits: shared(L(8)), services: [{ service: 'app', limits: L(4) }] }
    expect(limitsPendingDeploy({ ...env, deployedOn: { buildOn: 'server', runOn: 'server' } })).toBe(true)
    expect(limitsPendingDeploy({ ...env, deployedOn: null })).toBe(false)
  })
})

describe('formulário', () => {
  it('Editar: salvos > aplicados no host > vazio', () => {
    expect(initialLimits(null)).toEqual(shared(NO_LIMITS))
    expect(initialLimits({ limits: shared(L(8)), services: [{ service: 'app', limits: L(4) }] })).toEqual(shared(L(8)))
    expect(initialLimits({ limits: shared(NO_LIMITS), services: [{ service: 'app', limits: L(4) }] })).toEqual(shared(L(4)))
    expect(initialLimits({ limits: shared(NO_LIMITS), services: [] })).toEqual(shared(NO_LIMITS))
  })

  it('troca de modo: copia os valores para os serviços; volta com os valores quando iguais', () => {
    const perService = switchLimitMode(shared(L(2, 1)), 'service', ['app', 'db'])
    expect(perService).toEqual({ mode: 'service', services: [{ service: 'app', ...L(2, 1) }, { service: 'db', ...L(2, 1) }] })
    expect(switchLimitMode(perService, 'shared', [])).toEqual(shared(L(2, 1)))
    expect(switchLimitMode({ mode: 'service', services: [{ service: 'app', ...L(2) }, { service: 'db', ...L(1) }] }, 'shared', [])).toEqual(shared(NO_LIMITS))
    expect(switchLimitMode(shared(L(2)), 'shared', ['app'])).toEqual(shared(L(2)))
  })

  it('"Ler compose": por serviço acrescenta os novos com os declarados; no modo único preenche só o vazio e só quando iguais', () => {
    const read = { services: [{ name: 'app', hasBuild: true, declared: L(1, 0.5) }, { name: 'db', hasBuild: false, declared: L(1, 0.5) }] }
    const merged = mergeComposeServices({ mode: 'service', services: [{ service: 'app', ...L(4) }] }, read)
    expect(merged.limits).toEqual({ mode: 'service', services: [{ service: 'app', ...L(4) }, { service: 'db', ...L(1, 0.5) }] })
    expect(mergeComposeServices(shared(L(null, 3)), read)).toEqual({ limits: shared(L(1, 3)), differs: false, filled: true })
    const different = { services: [read.services[0]!, { ...read.services[1]!, declared: L(2) }] }
    expect(mergeComposeServices(shared(NO_LIMITS), different)).toEqual({ limits: shared(NO_LIMITS), differs: true, filled: false })
    expect(mergeComposeServices(shared(NO_LIMITS), { services: [{ name: 'app', hasBuild: false, declared: NO_LIMITS }] }).filled).toBe(false)
  })

  it('linhas órfãs: só depois de ler o compose (ou com os serviços do host)', () => {
    const limits: EnvironmentLimits = { mode: 'service', services: [{ service: 'app', ...L(1) }, { service: 'velho', ...L(1) }] }
    expect(orphanServices(limits, ['app'])).toEqual(['velho'])
    expect(orphanServices(limits, null)).toEqual([])
    expect(orphanServices(shared(L(1)), ['app'])).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { parseUrlFilters } from '@/hooks/useUrlFilters'
import { DEFAULT_ENVIRONMENT_FILTERS, ENVIRONMENT_FILTER_SCHEMA, filterEnvironmentList, hasActiveEnvironmentFilters, type EnvironmentFilters } from '@/features/environments/filters'
import type { EnvironmentDto, UnmanagedProjectDto } from '@/features/environments/types'

/** Filtros da lista `/ambientes` (OPE-211): busca, porta exata, máquina, situação e origem. */

const service = (overrides: Partial<EnvironmentDto['services'][number]> = {}): EnvironmentDto['services'][number] => ({
  service: 'app',
  container: 'loja-app-1',
  state: 'running',
  status: 'Up',
  ports: '',
  listen: [{ container: 3000, protocol: 'tcp', published: 4100, hostIp: null, reach: 'link' }],
  cpu: null,
  memory: null,
  version: null,
  limits: null,
  usage: { cpuPercent: null, memoryBytes: null, swapBytes: null, diskBytes: null, volumes: [], diskCheckedAt: null },
  ...overrides,
})

const env = (overrides: Partial<EnvironmentDto> = {}): EnvironmentDto =>
  ({
    id: 'e1',
    name: 'Loja Pública',
    slug: 'loja',
    source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' },
    envKeys: [],
    ports: [],
    healthUrl: null,
    buildOn: 'server',
    runOn: 'server',
    deployedOn: { buildOn: 'server', runOn: 'server' },
    services: [service()],
    ...overrides,
  }) as EnvironmentDto

const minio = env({ id: 'e2', name: 'MinIO', slug: 'minio', source: { kind: 'managed', projectName: 'minio', services: ['minio'], composeVersion: 2 }, runOn: 'pc', deployedOn: { buildOn: 'pc', runOn: 'pc' }, services: [service({ service: 'minio', container: 'minio-minio-1', state: 'exited', listen: [{ container: 9000, protocol: 'tcp', published: 30001, hostIp: null, reach: 'link' }] })] })
const adopted = env({ id: 'e3', name: 'Blog', slug: 'blog', source: { kind: 'adopted', machine: 'server', workingDir: '/srv/blog', configFiles: ['/srv/blog/compose.yml'], projectName: 'blog', git: true, pullOnRedeploy: false }, services: [], deployedOn: null })
const unmanaged: UnmanagedProjectDto = { machine: 'server', projectName: 'grafana', workingDir: '/opt/grafana', configFiles: [], git: false, containers: 2, running: 1, services: ['grafana', 'loki'], ports: [3000, 3100] }

const list = { items: [env(), minio, adopted], unmanaged: [unmanaged] }
const run = (filters: Partial<EnvironmentFilters>) => {
  const result = filterEnvironmentList(list, { ...DEFAULT_ENVIRONMENT_FILTERS, ...filters })
  return { items: result.items.map((item) => item.slug), unmanaged: result.unmanaged.map((item) => item.projectName) }
}

describe('filterEnvironmentList', () => {
  it('sem filtros: tudo', () => {
    expect(run({})).toEqual({ items: ['loja', 'minio', 'blog'], unmanaged: ['grafana'] })
    expect(hasActiveEnvironmentFilters(DEFAULT_ENVIRONMENT_FILTERS)).toBe(false)
  })

  it('busca: nome (sem acento), slug, serviço, container e pasta', () => {
    expect(run({ q: 'publica' })).toEqual({ items: ['loja'], unmanaged: [] })
    expect(run({ q: 'MINIO-minio' })).toEqual({ items: ['minio'], unmanaged: [] })
    expect(run({ q: '/srv/blog' })).toEqual({ items: ['blog'], unmanaged: [] })
    expect(run({ q: 'loki' })).toEqual({ items: [], unmanaged: ['grafana'] })
    expect(run({ q: 'grafana' }).unmanaged).toEqual(['grafana'])
  })

  it('porta: igualdade com a interna ou a publicada (3000 não casa com 30001)', () => {
    expect(run({ q: '3000' })).toEqual({ items: ['loja'], unmanaged: ['grafana'] })
    expect(run({ q: '4100' }).items).toEqual(['loja'])
    expect(run({ q: ':4100' }).items).toEqual(['loja'])
    expect(run({ q: '30001' }).items).toEqual(['minio'])
    expect(run({ q: '300' })).toEqual({ items: [], unmanaged: [] })
  })

  it('máquina, situação e origem: E entre os filtros, OU dentro de cada um', () => {
    expect(run({ machines: ['pc'] })).toEqual({ items: ['minio'], unmanaged: [] })
    expect(run({ healths: ['stopped', 'never'] }).items).toEqual(['minio', 'blog'])
    expect(run({ healths: ['partial'] })).toEqual({ items: [], unmanaged: ['grafana'] })
    expect(run({ origins: ['managed', 'adopted'] })).toEqual({ items: ['minio', 'blog'], unmanaged: [] })
    expect(run({ origins: ['managed'], machines: ['server'] }).items).toEqual([])
  })

  it('"Não gerenciado" deixa só a lista dos não gerenciados', () => {
    expect(run({ origins: ['unmanaged'] })).toEqual({ items: [], unmanaged: ['grafana'] })
    expect(run({ origins: ['unmanaged', 'central'] })).toEqual({ items: ['loja'], unmanaged: ['grafana'] })
  })

  it('URL: valores inválidos voltam ao padrão', () => {
    const parsed = parseUrlFilters('?machines=pc,lua&healths=running,xpto&origins=unmanaged&q=loja', DEFAULT_ENVIRONMENT_FILTERS, ENVIRONMENT_FILTER_SCHEMA)
    expect(parsed).toEqual({ q: 'loja', machines: ['pc'], healths: ['running'], origins: ['unmanaged'] })
  })
})

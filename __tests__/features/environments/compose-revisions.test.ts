import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Compose gerenciado (OPE-191): revisões versionadas — criar, salvar, restaurar e as recusas. */

const mocks = vi.hoisted(() => ({ publish: vi.fn(async () => {}), audit: vi.fn(async () => undefined) }))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.audit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/crypto/secretBox', () => ({ encryptSecret: (plain: string) => ({ v: 1, c: plain }), decryptSecret: (box: { c: string }) => box.c }))
vi.mock('@/features/environments/server/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { Environment: memoryModel(), EnvironmentDeploy: memoryModel(), EnvironmentComposeVersion: memoryModel(), EnvironmentsState: memoryModel(), environmentsDb: async () => {} }
})
vi.mock('@/features/environments/server/settings', () => ({ envLog: { info: vi.fn(), warn: vi.fn() }, runEnvHost: vi.fn(), publishEnvironment: mocks.publish }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticWorkbench: {} }))
vi.mock('@/features/local-docker/server/models', () => ({ LocalDockerPreview: {} }))

import { Environment, EnvironmentComposeVersion } from '@/features/environments/server/models'
import { getComposeRevision, listComposeRevisions, restoreComposeRevision, saveComposeRevision } from '@/features/environments/server/compose-revisions'
import { createEnvironment, updateEnvironment } from '@/features/environments/server/service'
import type { EnvironmentInput } from '@/features/environments/schemas'

const envs = Environment as unknown as { docs: Record<string, unknown>[] }
const revisions = EnvironmentComposeVersion as unknown as { docs: Record<string, unknown>[] }

const V1 = 'services:\n  soketi:\n    image: quay.io/soketi/soketi:1.6-16-debian\n'
const V2 = `${V1}    ports:\n      - "6001:6001"\n`

const input = (overrides: Partial<EnvironmentInput> = {}): EnvironmentInput => ({
  name: 'Soketi',
  slug: 'soketi',
  source: { kind: 'managed', projectName: 'soketi', services: [], composeVersion: 1 },
  compose: V1,
  env: [],
  ports: [6001],
  healthUrl: '',
  buildOn: 'server',
  runOn: 'server',
  ...overrides,
})

const create = async () => String((await createEnvironment(input(), 'local'))._id)
const sourceOf = () => envs.docs[0]!.source as { composeVersion: number; composeUpdatedAt?: string }

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: { status?: number; code?: string; message: string; details?: unknown }) => error,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  envs.docs.length = 0
  revisions.docs.length = 0
})

describe('revisões do compose gerenciado', () => {
  it('criar grava a v1 (o compose não vira campo do ambiente)', async () => {
    const id = await create()
    expect(sourceOf().composeVersion).toBe(1)
    expect(envs.docs[0]).not.toHaveProperty('compose')
    expect(revisions.docs).toEqual([expect.objectContaining({ environmentId: id, version: 1, content: V1, authorId: 'local', deployedAt: null })])
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('soketi:1.6')
  })

  it('criar gerenciado sem compose é recusado e nada é gravado (decisão do dono: sempre nasce com a v1)', async () => {
    const error = await rejection(createEnvironment(input({ compose: undefined }), 'local'))
    expect(error).toMatchObject({ status: 422, code: 'ENVIRONMENT_COMPOSE_INVALID' })
    expect(envs.docs).toHaveLength(0)
  })

  it('salvar cria a v2 e preserva a v1; a vigente vai para o ambiente e o tempo real avisa', async () => {
    const id = await create()
    const saved = await saveComposeRevision(id, { content: V2, note: 'porta' }, 'local')
    expect(saved).toMatchObject({ version: 2, content: V2, note: 'porta' })
    expect(revisions.docs.map((item) => [item.version, item.content])).toEqual([[1, V1], [2, V2]])
    expect(sourceOf().composeVersion).toBe(2)
    expect(sourceOf().composeUpdatedAt).toEqual(expect.any(String))
    expect(mocks.publish).toHaveBeenCalledWith(id, 'compose')
    const list = await listComposeRevisions(id)
    expect(list.current).toMatchObject({ version: 2, content: V2 })
    expect(list.revisions.map((item) => item.version)).toEqual([2, 1])
    expect(list.revisions[0]).not.toHaveProperty('content')
    expect(list.deployedVersion).toBeNull()
  })

  it('conteúdo igual ao da vigente é recusado (422)', async () => {
    const id = await create()
    expect(await rejection(saveComposeRevision(id, { content: V1 }, 'local'))).toMatchObject({ status: 422, code: 'ENVIRONMENT_COMPOSE_UNCHANGED' })
    expect(revisions.docs).toHaveLength(1)
  })

  it('YAML inválido é recusado com a linha (422)', async () => {
    const id = await create()
    const error = await rejection(saveComposeRevision(id, { content: 'services:\n  app:\n    image: x\n  bad: [\n' }, 'local'))
    expect(error).toMatchObject({ status: 422, code: 'ENVIRONMENT_COMPOSE_INVALID', details: { line: 5 } })
    expect(error?.message).toMatch(/^YAML inválido na linha 5/)
  })

  it('restaurar a v1 cria a v3 com o conteúdo dela, sem apagar o histórico', async () => {
    const id = await create()
    await saveComposeRevision(id, { content: V2 }, 'local')
    const restored = await restoreComposeRevision(id, 1, 'local')
    expect(restored).toMatchObject({ version: 3, content: V1, note: 'Restaurada da v1' })
    expect(revisions.docs.map((item) => item.version)).toEqual([1, 2, 3])
    expect(sourceOf().composeVersion).toBe(3)
    expect((await getComposeRevision(id, 2)).content).toBe(V2)
    // Restaurar a própria vigente não muda nada.
    expect(await rejection(restoreComposeRevision(id, 1, 'local'))).toMatchObject({ code: 'ENVIRONMENT_COMPOSE_UNCHANGED' })
    expect(await rejection(getComposeRevision(id, 9))).toMatchObject({ status: 404 })
  })

  it('ambiente de outra origem não tem revisões', async () => {
    const env = await createEnvironment(input({ slug: 'loja', compose: undefined, source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' } }), 'local')
    expect(await rejection(listComposeRevisions(String(env._id)))).toMatchObject({ status: 422, code: 'ENVIRONMENT_NOT_MANAGED' })
  })
})

describe('editar ambiente gerenciado', () => {
  it('troca projeto e serviços, mas não volta a revisão vigente (o número é do servidor)', async () => {
    const id = await create()
    await saveComposeRevision(id, { content: V2 }, 'local')
    await updateEnvironment(id, input({ compose: undefined, source: { kind: 'managed', projectName: 'soketi-2', services: ['soketi'], composeVersion: 1 } }), 'local')
    expect(envs.docs[0]!.source).toMatchObject({ kind: 'managed', projectName: 'soketi-2', services: ['soketi'], composeVersion: 2 })
  })

  it('não troca a origem depois de criado', async () => {
    const id = await create()
    const error = await rejection(updateEnvironment(id, input({ source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'soketi' } }), 'local'))
    expect(error).toMatchObject({ status: 422, code: 'ENVIRONMENT_SOURCE_LOCKED' })
  })
})

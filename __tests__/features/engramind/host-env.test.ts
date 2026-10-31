import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ENV_MASK_SET } from '@/features/engramind/constants'

/** Variáveis de ambiente pelo host: sem Ambiente, arquivo mudou, gravação auditada só com as chaves e o aplicar. */

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, string | undefined>,
  state: null as null | { pendingApply: { keys: string[]; at: Date; previous: Record<string, string> } | null },
  audits: [] as Record<string, unknown>[],
  commands: [] as { command: string; options: Record<string, unknown> }[],
  masked: '',
  hash: 'a'.repeat(64),
  writeExit: 0,
  applyExit: 0,
}))

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => mocks.config }))
vi.mock('@/lib/integrations/debug', () => ({ integrationDebug: () => ({}) }))
vi.mock('@/features/local-docker/server/shell', () => ({ createHostRunner: () => vi.fn() }))
vi.mock('@/features/environments/server/service', () => ({
  resolveEnvironmentRef: async () => ({ _id: 'env1', name: 'Engramind', slug: 'engramind', source: { kind: 'adopted', machine: 'server', workingDir: '/home/engramind', configFiles: ['/home/engramind/docker-compose.yml', '/home/engramind/docker-compose.deploy.yml'], projectName: 'engramind-8000', git: false, pullOnRedeploy: false } }),
  composePlanOf: () => ({ projectName: 'engramind-8000', dir: "'/home/engramind'", filesOn: 'server', composeFiles: ['/home/engramind/docker-compose.yml', '/home/engramind/docker-compose.deploy.yml'], services: [] }),
}))
vi.mock('@/features/environments/server/settings', () => ({ loadEnvironmentsSettings: async () => ({}), publishEnvironment: vi.fn() }))
vi.mock('@/features/environments/server/models', () => ({ environmentsDb: async () => {}, Environment: { updateOne: vi.fn() } }))
vi.mock('@/features/engramind/server/models', () => ({
  ENGRAMIND_STATE_ID: 'engramind',
  engramindDb: async () => {},
  EngramindState: {
    findById: () => ({ lean: async () => mocks.state }),
    updateOne: async (_filter: unknown, update: { $set: { pendingApply: unknown } }) => {
      mocks.state = { pendingApply: update.$set.pendingApply as never }
    },
  },
}))
vi.mock('@/features/engramind/server/shared', () => ({
  AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXECUTAR: 'EXECUTAR' },
  auditEngramind: async (_actor: string, id: string, _acao: string, depois: Record<string, unknown>) => {
    mocks.audits.push({ id, ...depois })
  },
  engramindLog: { info: vi.fn(), warn: vi.fn() },
  publishEngramind: vi.fn(),
}))
vi.mock('@/features/engramind/server/client', () => ({ engramindReady: async () => ({ ready: true, detail: 'ready' }) }))

import { applyEngramindEnv, readEngramindEnv, setEngramindHostRunner, updateEngramindEnv } from '@/features/engramind/server/host-env'
import { resetApplyHub } from '@/features/engramind/server/apply-hub'

const runner = vi.fn(async (command: string, _timeout?: number, options: Record<string, unknown> = {}) => {
  mocks.commands.push({ command, options })
  if (command.includes('base64 -w0')) return { exitCode: 0, output: `HASH:${mocks.hash}\n${Buffer.from(mocks.masked).toString('base64')}` }
  if (command.includes('mktemp')) return { exitCode: mocks.writeExit, output: `HASH:${'b'.repeat(64)}` }
  if (command.includes('docker compose')) return { exitCode: mocks.applyExit, output: 'recriado' }
  return { exitCode: 0, output: '' }
})

describe('variáveis de ambiente do Engramind', () => {
  beforeEach(() => {
    mocks.config = { environmentId: 'env1', baseUrl: 'http://engramind:8000' }
    mocks.state = null
    mocks.audits = []
    mocks.commands = []
    mocks.masked = `APP_PORT=8000\nCONTAINER_NAME=engramind-api\nTOKEN_PEPPER=${ENV_MASK_SET}\nLITESTREAM_SECRET_ACCESS_KEY=${ENV_MASK_SET}\n`
    mocks.writeExit = 0
    mocks.applyExit = 0
    runner.mockClear()
    setEngramindHostRunner(runner)
    resetApplyHub()
  })

  it('sem Ambiente vinculado: erro claro (a aba mostra o estado vazio)', async () => {
    mocks.config = {}
    await expect(readEngramindEnv()).rejects.toMatchObject({ code: 'ENGRAMIND_NO_ENVIRONMENT' })
  })

  it('a leitura roda no host, sem registrar o conteúdo, e devolve as sensíveis só como configuradas', async () => {
    const file = await readEngramindEnv()
    expect(mocks.commands[0]!.options).toMatchObject({ quiet: true })
    expect(file.entries.find((entry) => entry.key === 'TOKEN_PEPPER')).toEqual({ key: 'TOKEN_PEPPER', kind: 'read-only', configured: true })
    expect(file.environment.dir).toBe('/home/engramind')
  })

  it('arquivo mudou entre a leitura e a gravação: "recarregue"', async () => {
    await expect(updateEngramindEnv({ hash: 'c'.repeat(64), changes: { APP_PORT: '8001' } }, 'local')).rejects.toMatchObject({ status: 409, code: 'ENGRAMIND_ENV_CHANGED' })
    mocks.writeExit = 42
    await expect(updateEngramindEnv({ hash: mocks.hash, changes: { APP_PORT: '8001' } }, 'local')).rejects.toMatchObject({ code: 'ENGRAMIND_ENV_CHANGED' })
  })

  it('grava só as alteradas, audita os nomes (nunca os valores) e marca a pendência com o valor anterior da porta', async () => {
    await updateEngramindEnv({ hash: mocks.hash, changes: { APP_PORT: '8001' }, litestreamSecret: 'segredo-s3' }, 'local')
    const write = mocks.commands.find((item) => item.command.includes('mktemp'))!
    expect(String(write.options.redactedAs)).not.toContain('segredo-s3')
    expect(JSON.stringify(mocks.audits)).not.toContain('segredo-s3')
    expect(mocks.audits[0]).toMatchObject({ id: 'env', chaves: ['APP_PORT', 'LITESTREAM_SECRET_ACCESS_KEY'] })
    expect(mocks.state?.pendingApply).toMatchObject({ keys: ['APP_PORT', 'LITESTREAM_SECRET_ACCESS_KEY'], previous: { APP_PORT: '8000' } })
  })

  it('aplicar com a porta trocada derruba o projeto antigo, recria e confere a saúde', async () => {
    mocks.masked = `APP_PORT=8001\nCONTAINER_NAME=engramind-api\n`
    mocks.state = { pendingApply: { keys: ['APP_PORT'], at: new Date(), previous: { APP_PORT: '8000' } } }
    await applyEngramindEnv('local')
    await vi.waitFor(() => expect(mocks.audits.some((audit) => audit.id === 'env-apply')).toBe(true))
    const apply = mocks.commands.find((item) => item.command.includes('docker compose'))!
    expect(apply.options).toMatchObject({ detached: true })
    expect(apply.command).toContain("-p 'engramind-8000' down")
    expect(apply.command).toContain('up -d --no-build --pull never')
    expect(mocks.state?.pendingApply).toBeNull()
    expect(mocks.audits.at(-1)).toMatchObject({ projetoRecriado: true })
  })

  it('falha no compose mantém a pendência e registra o erro', async () => {
    mocks.state = { pendingApply: { keys: ['RUST_LOG'], at: new Date(), previous: {} } }
    mocks.applyExit = 1
    await applyEngramindEnv('local')
    await vi.waitFor(() => expect(mocks.audits.some((audit) => audit.id === 'env-apply')).toBe(true))
    expect(mocks.state?.pendingApply).not.toBeNull()
    expect(String(mocks.audits.at(-1)!.erro)).toContain('código 1')
  })
})

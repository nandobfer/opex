import { describe, expect, it } from 'vitest'
import {
  DeployError,
  architectureForPlatform,
  readConfig,
  runDeploy,
  shellQuote,
  type DeployConfig,
  type Exec,
  type ExecResult,
} from '../../scripts/deploy-production'

interface Call {
  file: string
  args: string[]
}

interface Harness {
  exec: Exec
  calls: Call[]
  sleeps: number[]
  run: (overrides?: Partial<DeployConfig>) => ReturnType<typeof runDeploy>
}

const IMAGE = 'opex:abc123'
const CONTAINER = 'container123'

function baseConfig(overrides: Partial<DeployConfig> = {}): DeployConfig {
  return {
    host: 'deploy.example.com',
    user: 'deploy',
    port: 22,
    sshKeyPath: '/tmp/opex-key',
    knownHostsPath: '/tmp/opex-known-hosts',
    remoteDir: '/srv/opex',
    projectName: 'opex-3100',
    service: 'app',
    imageRepository: 'opex',
    imageTag: 'abc123',
    imageArchive: '/tmp/opex-image.tar.gz',
    imageSha256: 'a'.repeat(64),
    platform: 'linux/amd64',
    expectedArchitecture: 'x86_64',
    healthcheckUrl: 'http://127.0.0.1:3100/login',
    healthcheckRetries: 3,
    healthcheckIntervalMs: 500,
    healthcheckTimeoutSeconds: 10,
    composeFiles: ['docker-compose.yml', 'docker-compose.deploy.yml'],
    requiredNetworks: ['mongodb-network', 'soketi-network'],
    cleanupArchive: true,
    ...overrides,
  }
}

function remoteCommand(call: Call): string {
  return call.args[call.args.length - 1] ?? ''
}

function createHarness(override?: (call: Call) => ExecResult | undefined): Harness {
  const calls: Call[] = []
  const sleeps: number[] = []

  const exec: Exec = (file, args) => {
    const call: Call = { file, args }
    calls.push(call)

    const custom = override?.(call)
    if (custom) return custom

    if (file === 'ssh') {
      const command = remoteCommand(call)
      if (command.includes('docker info')) return { status: 0, stdout: 'x86_64\n', stderr: '' }
      if (command.includes('docker image inspect')) return { status: 0, stdout: 'sha256:loaded\n', stderr: '' }
      if (command.includes('docker inspect --format')) return { status: 0, stdout: `${IMAGE}\n`, stderr: '' }
      if (command.includes('ps -q')) return { status: 0, stdout: `${CONTAINER}\n`, stderr: '' }
      return { status: 0, stdout: '', stderr: '' }
    }

    return { status: 0, stdout: '', stderr: '' }
  }

  const run = (overrides: Partial<DeployConfig> = {}): ReturnType<typeof runDeploy> =>
    runDeploy(baseConfig(overrides), {
      exec,
      log: () => {},
      sleep: (ms) => sleeps.push(ms),
      exists: () => true,
    })

  return { exec, calls, sleeps, run }
}

function commands(calls: Call[]): string[] {
  return calls.filter((call) => call.file === 'ssh').map(remoteCommand)
}

function findCommand(calls: Call[], needle: string): string | undefined {
  return commands(calls).find((command) => command.includes(needle))
}

describe('readConfig', () => {
  const baseEnv = {
    DEPLOY_HOST: 'deploy.example.com',
    DEPLOY_SSH_USER: 'deploy',
    DEPLOY_SSH_KEY: '/tmp/key',
    DEPLOY_KNOWN_HOSTS: '/tmp/known_hosts',
    DEPLOY_REMOTE_DIR: '/srv/opex',
    DEPLOY_PROJECT_NAME: 'opex-3100',
    DEPLOY_IMAGE_TAG: 'abc123',
    DEPLOY_IMAGE_ARCHIVE: '/tmp/opex-image.tar.gz',
    DEPLOY_IMAGE_SHA256: 'a'.repeat(64),
    DEPLOY_HEALTHCHECK_URL: 'http://127.0.0.1:3100/login',
  } as const

  it('preenche defaults e deriva a arquitetura da plataforma', () => {
    const config = readConfig({ ...baseEnv })
    expect(config.port).toBe(22)
    expect(config.service).toBe('app')
    expect(config.imageRepository).toBe('opex')
    expect(config.platform).toBe('linux/amd64')
    expect(config.expectedArchitecture).toBe('x86_64')
    expect(config.composeFiles).toEqual(['docker-compose.yml', 'docker-compose.deploy.yml'])
    expect(config.requiredNetworks).toEqual(['mongodb-network', 'soketi-network'])
    expect(config.cleanupArchive).toBe(true)
  })

  it('recusa variável obrigatória ausente', () => {
    const env = { ...baseEnv, DEPLOY_IMAGE_TAG: '' }
    expect(() => readConfig(env)).toThrowError(DeployError)
  })

  it('recusa tag ou diretório remoto inválidos', () => {
    expect(() => readConfig({ ...baseEnv, DEPLOY_IMAGE_TAG: 'tag com espaço' })).toThrowError(DeployError)
    expect(() => readConfig({ ...baseEnv, DEPLOY_REMOTE_DIR: 'relativo/opex' })).toThrowError(DeployError)
  })

  it('mapeia plataforma para arquitetura', () => {
    expect(architectureForPlatform('linux/amd64')).toBe('x86_64')
    expect(architectureForPlatform('linux/arm64')).toBe('aarch64')
    expect(() => architectureForPlatform('linux/386')).toThrowError(DeployError)
  })
})

describe('shellQuote', () => {
  it('encerra o valor entre aspas simples e escapa aspas internas', () => {
    expect(shellQuote('/srv/opex')).toBe("'/srv/opex'")
    expect(shellQuote("a'b")).toBe("'a'\\''b'")
  })
})

describe('runDeploy', () => {
  it('executa o caminho feliz na ordem esperada', () => {
    const harness = createHarness()
    const result = harness.run()

    expect(result.image).toBe(IMAGE)
    expect(result.steps).toEqual([
      'Pré-verificações no servidor',
      'Verificando a arquitetura do servidor',
      'Preparando o diretório de release',
      'Transferindo imagem e arquivos de configuração',
      'Conferindo o checksum da imagem',
      'Importando a imagem (docker load)',
      'Confirmando a imagem importada',
      'Atualizando o serviço',
      'Confirmando a imagem do container',
      'Verificando a disponibilidade (healthcheck)',
      'Removendo temporários remotos',
    ])

    // O SCP leva a imagem e os dois arquivos de compose para o diretório remoto.
    const scp = harness.calls.find((call) => call.file === 'scp')
    expect(scp).toBeDefined()
    expect(scp?.args).toContain('/tmp/opex-image.tar.gz')
    expect(scp?.args).toContain('docker-compose.yml')
    expect(scp?.args).toContain('docker-compose.deploy.yml')
    expect(scp?.args[scp.args.length - 1]).toBe('deploy@deploy.example.com:/srv/opex/')

    // O compose é atualizado sem build e sem pull, com a imagem do commit.
    const up = findCommand(harness.calls, 'up -d')
    expect(up).toContain('--no-build')
    expect(up).toContain('--pull never')
    expect(up).toContain(`OPEX_IMAGE='${IMAGE}'`)
    expect(up).toContain('-p \'opex-3100\'')

    // O checksum referencia o hash esperado e recusa desabilitar a verificação.
    const checksum = findCommand(harness.calls, 'sha256sum -c')
    expect(checksum).toContain('a'.repeat(64))

    // O healthcheck foi executado uma única vez (sucesso imediato).
    const curls = commands(harness.calls).filter((command) => command.includes('curl -fsS'))
    expect(curls).toHaveLength(1)

    // Os temporários remotos foram removidos ao final.
    expect(findCommand(harness.calls, 'rm -f')).toContain('/srv/opex/opex-image.tar.gz')
  })

  it('interrompe antes de qualquer comando remoto quando falta arquivo local', () => {
    const harness = createHarness()
    expect(() =>
      runDeploy(baseConfig(), {
        exec: harness.exec,
        log: () => {},
        sleep: () => {},
        exists: () => false,
      }),
    ).toThrowError(DeployError)
    expect(harness.calls).toHaveLength(0)
  })

  it('recusa arquitetura divergente antes de transferir', () => {
    const harness = createHarness((call) => {
      if (call.file === 'ssh' && remoteCommand(call).includes('docker info')) {
        return { status: 0, stdout: 'aarch64\n', stderr: '' }
      }
      return undefined
    })

    expect(() => harness.run()).toThrowError(DeployError)
    expect(harness.calls.some((call) => call.file === 'scp')).toBe(false)
  })

  it('não importa nem atualiza quando o checksum falha', () => {
    const harness = createHarness((call) => {
      if (call.file === 'ssh' && remoteCommand(call).includes('sha256sum -c')) {
        return { status: 1, stdout: '', stderr: 'checksum divergente' }
      }
      return undefined
    })

    expect(() => harness.run()).toThrowError(DeployError)
    expect(findCommand(harness.calls, 'docker load')).toBeUndefined()
    expect(findCommand(harness.calls, 'up -d')).toBeUndefined()
  })

  it('não atualiza o serviço quando o SCP falha', () => {
    const harness = createHarness((call) =>
      call.file === 'scp' ? { status: 1, stdout: '', stderr: 'conexão recusada' } : undefined,
    )

    expect(() => harness.run()).toThrowError(DeployError)
    expect(findCommand(harness.calls, 'up -d')).toBeUndefined()
  })

  it('não atualiza o serviço quando o docker load falha', () => {
    const harness = createHarness((call) => {
      if (call.file === 'ssh' && remoteCommand(call).includes('docker load')) {
        return { status: 1, stdout: '', stderr: 'formato inválido' }
      }
      return undefined
    })

    expect(() => harness.run()).toThrowError(DeployError)
    expect(findCommand(harness.calls, 'up -d')).toBeUndefined()
  })

  it('falha quando o container não usa a imagem recém-importada', () => {
    const harness = createHarness((call) => {
      if (call.file === 'ssh' && remoteCommand(call).includes('docker inspect --format')) {
        return { status: 0, stdout: 'opex:antiga\n', stderr: '' }
      }
      return undefined
    })

    expect(() => harness.run()).toThrowError(DeployError)
  })

  it('esgota as tentativas do healthcheck e falha', () => {
    const harness = createHarness((call) => {
      if (call.file === 'ssh' && remoteCommand(call).includes('curl -fsS')) {
        return { status: 1, stdout: '', stderr: 'sem resposta' }
      }
      return undefined
    })

    expect(() => harness.run()).toThrowError(DeployError)
    expect(harness.sleeps).toHaveLength(2)
  })

  it('mantém o deploy bem-sucedido mesmo se a limpeza falhar', () => {
    const harness = createHarness((call) => {
      if (call.file === 'ssh' && remoteCommand(call).includes('rm -f')) {
        return { status: 1, stdout: '', stderr: 'permissão negada' }
      }
      return undefined
    })

    const result = harness.run()
    expect(result.image).toBe(IMAGE)
  })

  it('inclui a imagem anterior na mensagem de falha para rollback', () => {
    const harness = createHarness((call) => {
      if (call.file === 'ssh' && remoteCommand(call).includes('up -d')) {
        return { status: 1, stdout: '', stderr: 'erro ao recriar' }
      }
      return undefined
    })

    const config = baseConfig()
    let message = ''
    try {
      harness.run()
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain('Imagem anterior')
    expect(message).toContain(`${IMAGE}`)
    expect(config.service).toBe('app')
  })
})

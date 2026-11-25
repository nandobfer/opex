import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { centralCheckoutCommand, cleanTreeCommand, composeCommand, ensureEnvFilesCommand, envFilesConfigCommand, parseCreatedEnvFiles, parseEnvFiles, containerVersionsCommand, downCommand, ensureRegistryCommand, envFileContent, envFileFromProject, packageVersionCommand, parseCommit, parseContainerVersions, parseGitDirs, parsePackageVersion, parseSnapshot, parseSnapshotHost, registryImage, snapshotCommand, centralComposeConfigCommand, writeFileCommand, type ComposePlan, type DockerTarget } from '@/features/environments/commands'
import { composeBytes, limitLines, overrideYaml, parseComposeConfig, runOnPcProblem, selectServices } from '@/features/environments/compose-config'
import { deploySteps, executionSteps, moveOrder } from '@/features/environments/pipeline'
import { DEFAULT_ENVIRONMENT_LIMITS, DEFAULT_ENVIRONMENTS_SETTINGS, environmentInputSchema, environmentLimitsSchema, placementProblem, type Machine } from '@/features/environments/schemas'
import { NO_LIMITS } from '@/features/environments/resource-limits'
import { groupUnmanaged } from '@/features/environments/server/service'
import { repositoryOwner, tagsToDelete } from '@/features/environments/server/registry'
import { pcPortsOf } from '@/features/environments/server/forwards'

/** Ambientes: comandos puros, as 4 combinações de build/execução, override, descoberta e regras. */

vi.mock('@/features/environments/server/models', () => ({ Environment: {}, EnvironmentDeploy: {}, environmentsDb: async () => {} }))
vi.mock('@/features/local-docker/server/models', () => ({ LocalDockerPreview: {} }))

const settings = DEFAULT_ENVIRONMENTS_SETTINGS
const plan: ComposePlan = { projectName: 'loja', dir: '"$HOME/opex-envs/loja"', filesOn: 'server', composeFiles: ['docker-compose.yml'], services: [] }
const targets: Record<Machine, DockerTarget> = { server: { machine: 'server', context: 'opex-local', builder: 'opex-local-builder' }, pc: { machine: 'pc', context: 'opex-local', builder: 'opex-local-builder' } }
const base = { settings, plan, targets, buildServices: ['app'], ports: [4100], healthUrl: null }
const labels = (buildOn: Machine, runOn: Machine) => deploySteps({ ...base, buildOn, runOn }).map((step) => step.label)

describe('as 4 combinações de build e execução', () => {
  it('Servidor → Servidor: build na fila global e sobe, sem registry', () => {
    const steps = deploySteps({ ...base, buildOn: 'server', runOn: 'server' })
    expect(steps.map((step) => step.label)).toEqual(['Build no servidor', 'Sobe no servidor'])
    expect(steps[0]!.lock).toBe('server')
    expect(steps[0]!.command).not.toContain('DOCKER_CONTEXT')
    expect(steps[1]!.command).toContain('up -d --no-build')
  })

  it('PC → PC: build com o builder do PC (trava própria), sobe no PC e repassa as portas', () => {
    const steps = deploySteps({ ...base, buildOn: 'pc', runOn: 'pc' })
    expect(steps.map((step) => step.label)).toEqual(['Build no PC', 'Sobe no PC', 'Repasse das portas para o servidor'])
    expect(steps[0]!.lock).toBe('pc')
    expect(steps[0]!.command).toContain('DOCKER_CONTEXT=opex-local BUILDX_BUILDER=opex-local-builder docker compose')
    expect(steps[2]!.command).toMatch(/-O forward -L \S*4100:\S*:4100/)
  })

  it('PC → Servidor: build no PC, registry, repasse -R, push no PC, fecha o repasse, pull e sobe no servidor', () => {
    expect(labels('pc', 'server')).toEqual(['Build no PC', 'Registry no servidor', 'Repasse do registry para o PC', 'Push das imagens no PC', 'Fecha o repasse do registry', 'Pull no servidor', 'Sobe no servidor'])
    const steps = deploySteps({ ...base, buildOn: 'pc', runOn: 'server' })
    expect(steps.find((step) => step.label === 'Repasse do registry para o PC')!.command).toContain('-O forward -R 5050:localhost:5050')
    expect(steps.find((step) => step.label === 'Fecha o repasse do registry')!.always).toBe(true)
  })

  it('Servidor → PC: build, push no servidor, repasse -R, pull no PC, sobe no PC e repassa as portas', () => {
    expect(labels('server', 'pc')).toEqual(['Build no servidor', 'Registry no servidor', 'Push das imagens no servidor', 'Repasse do registry para o PC', 'Pull no PC', 'Fecha o repasse do registry', 'Sobe no PC', 'Repasse das portas para o servidor'])
  })

  it('sem serviço com build: sem registry, só pull + up na execução; saúde no fim', () => {
    expect(deploySteps({ ...base, buildServices: [], buildOn: 'server', runOn: 'pc', healthUrl: 'http://localhost:4100/health' }).map((step) => step.label)).toEqual(['Pull no PC', 'Sobe no PC', 'Repasse das portas para o servidor', 'Saúde'])
  })
})

describe('compose', () => {
  const config = JSON.stringify({
    services: {
      app: { build: { context: '.' }, volumes: [{ type: 'bind', source: '/srv/app', target: '/app' }], develop: { watch: [{ path: 'src' }] } },
      db: { image: 'mongo:7', volumes: [{ type: 'volume', source: 'data', target: '/data/db' }] },
    },
  })

  it('lê o config, bloqueia bind mount e develop.watch para executar no PC', () => {
    const services = parseComposeConfig(`aviso\n${config}`)!
    expect(services).toEqual([
      { name: 'app', hasBuild: true, bindMounts: ['/srv/app:/app'], hasWatch: true, declared: NO_LIMITS, limitStyle: { memory: 'deploy', cpus: 'deploy' } },
      { name: 'db', hasBuild: false, bindMounts: [], hasWatch: false, declared: NO_LIMITS, limitStyle: { memory: 'deploy', cpus: 'deploy' } },
    ])
    expect(runOnPcProblem(services)).toContain('bind mount em app (/srv/app:/app) e develop.watch em app')
    expect(runOnPcProblem(selectServices(services, ['db']))).toBeNull()
  })

  it('variáveis com $ chegam literais (escapadas como $$); env_file relativo à pasta do compose', () => {
    expect(envFileContent([{ key: 'SENHA', value: 'p@$$w0rd' }, { key: 'HASH', value: '$2y$10$abc' }])).toBe('SENHA="p@$$$$w0rd"\nHASH="$$2y$$10$$abc"\n')
    expect(envFileFromProject({ composeFiles: ['docker-compose.yml'] })).toBe('.env.opex')
    expect(envFileFromProject({ composeFiles: ['deploy/docker/compose.yml'] })).toBe('../../.env.opex')
    expect(envFileFromProject({ composeFiles: ['/home/u/app/compose.yml'] })).toBe('.env.opex')
    expect(overrideYaml({ services: [{ name: 'app', hasBuild: false, bindMounts: [], hasWatch: false }], images: {}, withEnvFile: true, envFilePath: '../.env.opex' })).toContain('- "../.env.opex"')
  })

  it('override fixa a imagem do registry e o env_file', () => {
    const services = parseComposeConfig(config)!
    const yaml = overrideYaml({ services, images: { app: registryImage(settings, 'loja', 'app', 'abc1234') }, withEnvFile: true })
    expect(yaml).toContain('"app":\n    image: "localhost:5050/opex-env/loja-app:abc1234"\n    env_file:\n      - ".env.opex"')
    expect(yaml).toContain('"db":\n    env_file:')
    expect(overrideYaml({ services, images: {}, withEnvFile: false })).toContain('services: {}')
  })

  it('comandos do compose com o override; projeto adotado do PC roda pela conexão mestra', () => {
    expect(composeCommand(plan, targets.server, 'ps')).toBe('cd "$HOME/opex-envs/loja" && docker compose -p loja $( [ -f .env ] && echo --env-file .env ) $( [ -f .env.opex ] && echo --env-file .env.opex ) -f \'docker-compose.yml\' $( [ -f docker-compose.opex.yml ] && echo -f docker-compose.opex.yml ) ps')
    const adopted = composeCommand({ ...plan, filesOn: 'pc', dir: "'/home/u/app'" }, targets.pc, 'up -d')
    expect(adopted.startsWith('ssh -S "$HOME/.ssh/opex-local.ctl" opex-local ')).toBe(true)
    expect(writeFileCommand(plan, '.env.opex', 'A="1"\n')).toContain("printf %s 'QT0iMSIK' | base64 -d > \"$HOME/opex-envs/loja\"/.env.opex")
  })

  it('código da central: resolve branch remota, tag ou commit (nessa ordem) e usa o sha no worktree/checkout', () => {
    const command = centralCheckoutCommand(settings, '/home/u/loja', 'loja', 'v1.4.0')
    expect(command).toContain("git -C '/home/u/loja' fetch origin --prune --tags")
    expect(command).toContain("rev-parse --verify --quiet 'origin/v1.4.0^{commit}' || git -C '/home/u/loja' rev-parse --verify --quiet 'refs/tags/v1.4.0^{commit}' || git -C '/home/u/loja' rev-parse --verify --quiet 'v1.4.0^{commit}'")
    expect(command).toContain('worktree add --detach "$HOME/opex-envs/loja" "$sha"')
    expect(command).toContain('checkout --detach "$sha"')
    expect(command).not.toContain("'origin/v1.4.0' ")
    expect(parseCommit('From github\n * branch main\nabc123def456\n')).toBe('abc123def456')
    expect(ensureRegistryCommand(settings)).toContain('-p 127.0.0.1:5050:5000')
  })
})

describe('descoberta e adoção', () => {
  const snapshot = [
    ['loja', 'app', 'loja-app-1', 'running', 'Up 2 hours', '0.0.0.0:4100->3000/tcp', '/home/u/loja', '/home/u/loja/docker-compose.yml'].join('\t'),
    ['loja', 'db', 'loja-db-1', 'exited', 'Exited (0)', '', '/home/u/loja', '/home/u/loja/docker-compose.yml'].join('\t'),
    ['scratch', 'web', 'scratch-web-1', 'running', 'Up', '', '/tmp/scratch', '/tmp/scratch/compose.yml'].join('\t'),
    ['app-go-1', 'app', 'app-go-1-app-1', 'running', 'Up', '', '/w/go-1', '/w/go-1/docker-compose.yml'].join('\t'),
    '---',
    ['loja-app-1', '1.50%', '120MiB / 8GiB'].join('\t'),
  ].join('\n')

  it('agrupa por projeto com e sem git e deixa de fora prévias e ambientes', () => {
    const containers = parseSnapshot(snapshot)
    expect(containers[0]).toMatchObject({ project: 'loja', cpu: '1.50%', memory: '120MiB / 8GiB', configFiles: ['/home/u/loja/docker-compose.yml'] })
    const git = parseGitDirs('yes\t/home/u/loja\n')
    expect(groupUnmanaged('server', containers, new Set(['app-go-1']), git)).toEqual([
      { machine: 'server', projectName: 'loja', workingDir: '/home/u/loja', configFiles: ['/home/u/loja/docker-compose.yml'], git: true, containers: 2, running: 1 },
      { machine: 'server', projectName: 'scratch', workingDir: '/tmp/scratch', configFiles: ['/tmp/scratch/compose.yml'], git: false, containers: 1, running: 1 },
    ])
  })

  it('o snapshot traz o id de cada container (a versão é cacheada por ele)', () => {
    const line = ['loja', 'app', 'loja-app-1', 'running', 'Up', '', '/home/u/loja', '/home/u/loja/docker-compose.yml', '3f2a1b9c8d7e'].join('\t')
    expect(parseSnapshot(line)[0]).toMatchObject({ id: '3f2a1b9c8d7e', name: 'loja-app-1' })
    expect(parseSnapshot(snapshot)[0]!.id).toBe('')
  })

  it('projeto adotado do PC fica no PC (build e execução)', () => {
    expect(placementProblem({ kind: 'adopted', machine: 'pc' }, 'server', 'pc')).toContain('ficam no PC')
    expect(placementProblem({ kind: 'adopted', machine: 'server' }, 'pc', 'server')).toBeNull()
  })
})

describe('versão do app', () => {
  it('lê o version do package.json; sem arquivo, JSON inválido ou versão estranha dá null', () => {
    expect(parsePackageVersion('{"name":"opex","version":"1.44.0"}')).toBe('1.44.0')
    expect(parsePackageVersion('{"version": "2.0.0-beta.1", "scripts": {')).toBe('2.0.0-beta.1')
    expect(parsePackageVersion('')).toBeNull()
    expect(parsePackageVersion('{"name":"x"}')).toBeNull()
    expect(parsePackageVersion('{"version":"$(rm -rf /)"}')).toBeNull()
  })

  it('package.json da pasta do ambiente (no PC, pela conexão mestra)', () => {
    expect(packageVersionCommand(plan)).toBe('head -c 200000 "$HOME/opex-envs/loja"/package.json 2>/dev/null; true')
    expect(packageVersionCommand({ dir: "'/home/u/loja'", filesOn: 'pc' })).toContain('ssh')
  })

  it('um docker exec por container (ids validados) e um bloco por id na saída', () => {
    const command = containerVersionsCommand('pc', 'opex-local', ['3f2a1b9c8d7e', 'x; rm -rf /', 'aaaaaa111111'])
    expect(command).toContain('for c in 3f2a1b9c8d7e aaaaaa111111;')
    expect(command).toContain('docker --context opex-local exec "$c" head -c 200000 package.json')
    expect(command).not.toContain('rm -rf')
    expect(containerVersionsCommand('server', 'ctx', ['nada valido'])).toBe('true')
    const output = '\n@@opex-version 3f2a1b9c8d7e\n{"version":"1.44.0"}\n@@opex-version aaaaaa111111\n'
    expect(parseContainerVersions(output)).toEqual(new Map([['3f2a1b9c8d7e', '1.44.0'], ['aaaaaa111111', null]]))
  })
})

describe('fase de execução (retomável)', () => {
  it('redeploy: só os passos do deploy, na mesma ordem (o índice gravado aponta o mesmo passo)', () => {
    const steps = executionSteps({ ...base, buildOn: 'server', runOn: 'server', from: 'server', down: downCommand })
    expect(steps.map((step) => step.label)).toEqual(['Build no servidor', 'Sobe no servidor'])
  })

  it('mover com a mesma porta: derruba a origem antes, com a explicação', () => {
    const steps = executionSteps({ ...base, buildOn: 'server', runOn: 'pc', from: 'server', down: downCommand })
    expect(steps[0]).toMatchObject({ label: 'Derruba no servidor', note: expect.stringContaining('A porta é a mesma') })
  })

  it('mover sem portas: derruba a origem só com o deploy concluído (nada roda depois de uma falha)', () => {
    const steps = executionSteps({ ...base, ports: [], buildOn: 'pc', runOn: 'pc', from: 'server', down: downCommand })
    const teardown = steps.slice(-1)[0]!
    expect(teardown).toMatchObject({ label: 'Derruba no servidor', note: expect.stringContaining('No ar no destino') })
    expect(teardown.always).toBeFalsy()
  })

})

describe('regras', () => {
  it('mover: mesma porta derruba antes; sem porta sobe antes; sem mudança é redeploy', () => {
    expect(moveOrder({ fromRun: 'server', toRun: 'pc', ports: [4100] })).toBe('down-first')
    expect(moveOrder({ fromRun: 'pc', toRun: 'server', ports: [] })).toBe('up-first')
    expect(moveOrder({ fromRun: 'server', toRun: 'server', ports: [4100] })).toBe('redeploy')
    expect(moveOrder({ fromRun: null, toRun: 'pc', ports: [4100] })).toBe('redeploy')
  })

  it('schema: slug, portas e variáveis repetidas, ref e caminho do compose', () => {
    const input = { name: 'Loja', slug: 'loja', source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' }, env: [], ports: [4100], healthUrl: '', buildOn: 'server', runOn: 'server', limits: DEFAULT_ENVIRONMENT_LIMITS }
    expect(environmentInputSchema.safeParse(input).success).toBe(true)
    expect(environmentInputSchema.safeParse({ ...input, slug: 'Loja!' }).success).toBe(false)
    expect(environmentInputSchema.safeParse({ ...input, ports: [4100, 4100] }).success).toBe(false)
    expect(environmentInputSchema.safeParse({ ...input, env: [{ key: 'A', value: '1' }, { key: 'A', value: '2' }] }).success).toBe(false)
    expect(environmentInputSchema.safeParse({ ...input, source: { ...input.source, composeFile: '../x.yml' } }).success).toBe(false)
    expect(environmentInputSchema.safeParse({ ...input, source: { ...input.source, ref: 'main; rm -rf /' } }).success).toBe(false)
  })

  it('registry mantém as N últimas tags; repasses só dos ambientes no PC', () => {
    expect(tagsToDelete(['a', 'b', 'c', 'd'], ['d', 'c', 'b'], 2)).toEqual(['a', 'b'])
    // Regressão: a imagem implantada e a do deploy em andamento nunca saem; sem deploy de sucesso conhecido, nada sai.
    expect(tagsToDelete(['a', 'b', 'c', 'd'], ['d', 'c'], 1, ['a', 'b'])).toEqual(['c'])
    expect(tagsToDelete(['a', 'b'], [], 5)).toEqual([])
    expect(tagsToDelete(['a', 'b'], [], 5, ['a'])).toEqual([])
    // Regressão: slugs com prefixo comum (`crm` e `crm-hml`) — a limpeza de um não apaga as tags do outro.
    expect(repositoryOwner('opex-env/crm-app', ['crm', 'crm-hml'])).toBe('crm')
    expect(repositoryOwner('opex-env/crm-hml-web', ['crm', 'crm-hml'])).toBeNull()
    expect(repositoryOwner('opex-env/crm-hml-web', ['crm-hml'])).toBe('crm-hml')
    expect(repositoryOwner('opex-env/loja-app', ['crm', 'crm-hml'])).toBeNull()
    // Com o registro exato dos deploys não há ambiguidade.
    expect(repositoryOwner('opex-env/crm-hml-web', ['crm', 'crm-hml'], new Map([['opex-env/crm-hml-web', 'crm-hml']]))).toBe('crm-hml')
    expect(pcPortsOf([{ deployedOn: { buildOn: 'pc', runOn: 'pc' }, ports: [4100, 4101] }, { deployedOn: { buildOn: 'pc', runOn: 'server' }, ports: [5000] }, { deployedOn: null, ports: [6000] }])).toEqual([4100, 4101])
  })
})

describe('arquivos de variáveis do compose (OPE-175)', () => {
  it('lê os env_file sem resolver nem interpolar, sem o override', () => {
    const command = envFilesConfigCommand(plan, targets.server)
    expect(command).toContain('config --no-env-resolution --no-interpolate --format json')
    expect(command).not.toContain('docker-compose.opex.yml')
  })

  it('só os obrigatórios, sem repetir, sem caminho com $ e sem o .env.opex; aceita aviso antes do JSON', () => {
    const output = 'WARN algo\n' + JSON.stringify({
      services: {
        app: { env_file: [{ path: '/srv/loja/.env', required: true }, { path: '/srv/loja/opt.env', required: false }, { path: '/srv/loja/${STAGE}.env', required: true }] },
        web: { env_file: '/srv/loja/.env' },
        worker: { env_file: ['/srv/loja/worker.env', { path: '/srv/loja/.env.opex' }] },
        db: { image: 'mongo:7' },
      },
    })
    expect(parseEnvFiles(output)).toEqual(['/srv/loja/.env', '/srv/loja/worker.env'])
    expect(parseEnvFiles('erro sem JSON')).toEqual([])
  })

  it('cria só o que falta: nunca trunca nem sobrescreve; no PC vai pela conexão mestra', () => {
    const command = ensureEnvFilesCommand(plan, ['/srv/loja/.env'])
    expect(command).toContain('[ ! -e "$f" ]')
    expect(command).toContain(': >> "$f"')
    expect(command).not.toMatch(/[^>]> "\$f"/)
    expect(ensureEnvFilesCommand(plan, [])).toBe('true')
    expect(ensureEnvFilesCommand({ ...plan, dir: "'/home/u/loja'", filesOn: 'pc' }, ['/home/u/loja/.env'])).toContain('ssh -S')
    expect(parseCreatedEnvFiles('@@opex-env-file-created .env\r\nlixo\n@@opex-env-file-created /etc/app.env\n')).toEqual(['.env', '/etc/app.env'])
  })

  it('no shell: cria a pasta e o arquivo vazios uma vez e mantém o conteúdo do que já existe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opex-envfiles-'))
    try {
      writeFileSync(join(dir, '.env'), 'A=1\n')
      const command = ensureEnvFilesCommand({ dir: `'${dir}'`, filesOn: 'server' }, [join(dir, '.env'), join(dir, 'deploy/app.env')])
      expect(parseCreatedEnvFiles(execSync(command, { shell: '/bin/sh' }).toString())).toEqual(['deploy/app.env'])
      expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('A=1\n')
      expect(existsSync(join(dir, 'deploy/app.env'))).toBe(true)
      expect(readFileSync(join(dir, 'deploy/app.env'), 'utf8')).toBe('')
      expect(parseCreatedEnvFiles(execSync(command, { shell: '/bin/sh' }).toString())).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('pasta limpa no shell (repositório git real): vazio não rastreado = limpa; com conteúdo, rastreado alterado ou outro arquivo = suja', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opex-cleantree-'))
    const sh = (command: string) => execSync(command, { shell: '/bin/sh', cwd: dir }).toString().trim()
    try {
      sh('git init -q && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m i')
      const files = [join(dir, '.env'), join(dir, 'deploy/app.env'), '/etc/opex-fora-da-pasta.env']
      const check = () => sh(cleanTreeCommand({ dir: `'${dir}'`, filesOn: 'server' }, files))
      writeFileSync(join(dir, '.env'), '')
      expect(check()).toBe('clean')
      writeFileSync(join(dir, '.env'), 'A=1\n')
      expect(check()).toBe('dirty')
      writeFileSync(join(dir, '.env'), '')
      sh('git add .env && git -c user.email=t@t -c user.name=t commit -q -m env')
      writeFileSync(join(dir, '.env'), 'B=2\n')
      expect(check()).toBe('dirty')
      sh('git checkout -q -- .env')
      expect(check()).toBe('clean')
      writeFileSync(join(dir, 'outro.txt'), 'x')
      expect(check()).toBe('dirty')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('pasta limpa: sem arquivos declarados o comando é o de antes; com eles, ignora só os vazios não rastreados de dentro da pasta', () => {
    expect(cleanTreeCommand(plan)).toBe(cleanTreeCommand(plan, []))
    const command = cleanTreeCommand(plan, ['/srv/loja/.env'])
    expect(command).toContain('[ ! -s "$f" ]')
    expect(command).toContain('git ls-files --error-unmatch')
    expect(command).toContain('"$PWD"/*)')
  })
})

describe('limites de recursos (OPE-193)', () => {
  const declaredConfig = JSON.stringify({
    services: {
      app: { image: 'app', mem_limit: '1g', memswap_limit: '1536m', cpus: 1 },
      worker: { image: 'w', deploy: { resources: { limits: { memory: '536870912', cpus: '0.5' } } } },
      db: { image: 'mongo:7', mem_limit: '${DB_MEM}' },
    },
  })

  it('lê os limites declarados no compose (bytes ou unidades) e a forma usada', () => {
    const [app, worker, db] = parseComposeConfig(declaredConfig)!
    expect(app).toMatchObject({ declared: { memoryGb: 1, swapGb: 0.5, cpus: 1 }, limitStyle: { memory: 'service', cpus: 'service' } })
    expect(worker).toMatchObject({ declared: { memoryGb: 0.5, swapGb: null, cpus: 0.5 }, limitStyle: { memory: 'deploy', cpus: 'deploy' } })
    // Sem interpolação, `${VAR}` não é um valor: fica vazio (a forma continua a do serviço).
    expect(db).toMatchObject({ declared: NO_LIMITS, limitStyle: { memory: 'service', cpus: 'deploy' } })
    expect(composeBytes('2gb')).toBe(2 * 1024 ** 3)
    expect(composeBytes(1024)).toBe(1024)
    expect(composeBytes('abc')).toBeNull()
  })

  it('override: só chaves dos valores preenchidos, na forma do compose; swap = RAM + swap (0 = igual à RAM)', () => {
    const services = parseComposeConfig(declaredConfig)!
    const yaml = overrideYaml({
      services,
      images: {},
      withEnvFile: false,
      limits: { app: { memoryGb: 2, swapGb: 1, cpus: 2.5 }, worker: { memoryGb: 4, swapGb: 0, cpus: 1.5 }, db: null },
    })
    expect(yaml).toContain('"app":\n    mem_limit: "2048m"\n    memswap_limit: "3072m"\n    cpus: 2.5')
    expect(yaml).toContain('"worker":\n    memswap_limit: "4096m"\n    deploy:\n      resources:\n        limits:\n          memory: "4096m"\n          cpus: "1.5"')
    expect(yaml).not.toContain('"db"')
    const plain = { limitStyle: { memory: 'deploy', cpus: 'deploy' } as const, declared: NO_LIMITS }
    expect(limitLines({ memoryGb: 1, swapGb: null, cpus: null }, plain)).toEqual(['    deploy:', '      resources:', '        limits:', '          memory: "1024m"'])
    expect(limitLines(NO_LIMITS, plain)).toEqual([])
    // Sem limites: o override é o de antes.
    expect(overrideYaml({ services, images: {}, withEnvFile: false, limits: { app: null, worker: null, db: null } })).toContain('services: {}')
  })

  it('regressão: RAM nova com swap vazio reescreve o memswap_limit declarado no compose (RAM nova + swap declarado)', () => {
    // O compose declara mem_limit 1g + memswap_limit 1536m: sem reescrever, o total ficaria abaixo da RAM nova e o Docker recusaria o container.
    const [app] = parseComposeConfig(declaredConfig)!
    expect(limitLines({ memoryGb: 4, swapGb: null, cpus: null }, app!)).toEqual(['    mem_limit: "4096m"', '    memswap_limit: "4608m"'])
    // Swap salvo continua valendo sobre o declarado; sem RAM no override, o declarado fica como está.
    expect(limitLines({ memoryGb: 4, swapGb: 0, cpus: null }, app!)).toEqual(['    mem_limit: "4096m"', '    memswap_limit: "4096m"'])
    expect(limitLines({ memoryGb: null, swapGb: null, cpus: 1 }, app!)).toEqual(['    cpus: 1'])
  })

  it('snapshot: limites aplicados por container (docker inspect) e a capacidade da máquina', () => {
    const output = [
      ['loja', 'app', 'loja-app-1', 'running', 'Up', '', '/home/u/loja', '/home/u/loja/docker-compose.yml', 'abc123'].join('\t'),
      ['loja', 'db', 'loja-db-1', 'running', 'Up', '', '/home/u/loja', '/home/u/loja/docker-compose.yml', 'def456'].join('\t'),
      '---',
      ['loja-app-1', '1.00%', '100MiB / 4GiB'].join('\t'),
      '---',
      ['/loja-app-1', String(4 * 1024 ** 3), String(6 * 1024 ** 3), '2000000000', '0', '0'].join('\t'),
      ['/loja-db-1', '0', '0', '0', '0', '0'].join('\t'),
      '---',
      `8|${16 * 1024 ** 3}`,
    ].join('\n')
    const [app, db] = parseSnapshot(output)
    expect(app!.limits).toEqual({ memoryGb: 4, swapGb: 2, cpus: 2 })
    expect(db!.limits).toEqual(NO_LIMITS)
    expect(parseSnapshotHost(output)).toEqual({ cpus: 8, memoryGb: 16 })
    expect(parseSnapshotHost('a\n---\nb')).toBeNull()
    const command = snapshotCommand('pc', 'opex-local')
    expect(command).toContain("docker --context opex-local ps -aq --filter label=com.docker.compose.project | xargs -r docker --context opex-local inspect -f '{{.Name}}")
    expect(command).toContain("docker --context opex-local info --format '{{.NCPU}}|{{.MemTotal}}'")
  })

  it('schema: swap sem RAM, serviços repetidos e os dois modos', () => {
    expect(environmentLimitsSchema.safeParse({ mode: 'shared', memoryGb: 4, swapGb: 0, cpus: 2.5 }).success).toBe(true)
    const noRam = environmentLimitsSchema.safeParse({ mode: 'shared', memoryGb: null, swapGb: 1, cpus: null })
    expect(noRam.success).toBe(false)
    expect(noRam.error?.issues[0]).toMatchObject({ path: ['swapGb'], message: 'Defina a RAM para limitar o swap' })
    const row = { service: 'app', memoryGb: null, swapGb: 2, cpus: null }
    expect(environmentLimitsSchema.safeParse({ mode: 'service', services: [row] }).error?.issues[0]?.path).toEqual(['services', 0, 'swapGb'])
    const ok = { service: 'app', memoryGb: 1, swapGb: null, cpus: null }
    expect(environmentLimitsSchema.safeParse({ mode: 'service', services: [ok, ok] }).error?.issues[0]?.message).toBe('Serviços repetidos')
    expect(environmentLimitsSchema.safeParse({ mode: 'shared', memoryGb: 0.1, swapGb: null, cpus: null }).success).toBe(false)
  })

  it('"Ler compose" da central: só os YAML da ref numa pasta temporária, apagada no fim', () => {
    const command = centralComposeConfigCommand('/home/u/loja', 'main', 'deploy/compose.yml')
    expect(command).toContain("git -C '/home/u/loja' fetch origin --prune --tags")
    expect(command).toContain(`archive "$sha" -- 'deploy/compose.yml' ':(glob)**/*.y*ml' | tar -x -C "$tmp"`)
    expect(command).toContain("docker compose -p opex-read -f 'deploy/compose.yml' config --no-env-resolution --no-interpolate --format json")
    expect(command).toContain('rm -rf "$tmp"; exit $rc')
  })

  it('"Ler compose" da central no shell (repositório git real, docker de mentira): lê o compose da ref e apaga a pasta', () => {
    const root = mkdtempSync(join(tmpdir(), 'ope193-'))
    try {
      const repo = join(root, 'repo')
      const bin = join(root, 'bin')
      execSync(`mkdir -p ${repo}/deploy ${bin} && git -C ${repo} init -q -b main && git -C ${repo} remote add origin ${repo}`)
      writeFileSync(join(repo, 'deploy/compose.yml'), 'services:\n  app:\n    image: alpine\n')
      writeFileSync(join(repo, 'README.md'), 'fora do archive')
      execSync(`git -C ${repo} add -A && git -C ${repo} -c user.email=t@t -c user.name=t commit -qm init`)
      // O docker de mentira grava a pasta onde rodou e o que havia nela, e imprime um JSON.
      writeFileSync(join(bin, 'docker'), `#!/bin/sh\npwd > ${root}/cwd\nfind . -type f | sort > ${root}/files\necho '{"services":{"app":{"image":"alpine"}}}'\n`, { mode: 0o755 })
      const output = execSync(centralComposeConfigCommand(repo, 'main', 'deploy/compose.yml'), { shell: '/bin/bash', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }).toString()
      expect(parseComposeConfig(output)!.map((service) => service.name)).toEqual(['app'])
      const cwd = readFileSync(join(root, 'cwd'), 'utf8').trim()
      expect(readFileSync(join(root, 'files'), 'utf8').trim()).toBe('./deploy/compose.yml')
      expect(existsSync(cwd)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

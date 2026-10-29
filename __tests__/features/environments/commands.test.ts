import { describe, expect, it, vi } from 'vitest'
import { centralCheckoutCommand, composeCommand, containerVersionsCommand, downCommand, ensureRegistryCommand, envFileContent, envFileFromProject, packageVersionCommand, parseCommit, parseContainerVersions, parseGitDirs, parsePackageVersion, parseSnapshot, registryImage, writeFileCommand, type ComposePlan, type DockerTarget } from '@/features/environments/commands'
import { overrideYaml, parseComposeConfig, runOnPcProblem, selectServices } from '@/features/environments/compose-config'
import { deploySteps, executionSteps, moveOrder } from '@/features/environments/pipeline'
import { DEFAULT_ENVIRONMENTS_SETTINGS, environmentInputSchema, placementProblem, type Machine } from '@/features/environments/schemas'
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
      { name: 'app', hasBuild: true, bindMounts: ['/srv/app:/app'], hasWatch: true },
      { name: 'db', hasBuild: false, bindMounts: [], hasWatch: false },
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
    const input = { name: 'Loja', slug: 'loja', source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' }, env: [], ports: [4100], healthUrl: '', buildOn: 'server', runOn: 'server' }
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

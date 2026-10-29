import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  aliasRunCommand,
  bootstrapScript,
  builderDriverOpts,
  builderEnsureCommand,
  cancelForwardCommand,
  cleanupSteps,
  connectionProblem,
  dockerPrefix,
  forwardPortCommand,
  importKeyCommand,
  manualSteps,
  openTunnelCommand,
  parseContainers,
  parseFingerprint,
  parseListeningPorts,
  parseMachineInfo,
  parseStats,
  planAliasReconcile,
  previewDeleteCommand,
  previewRecreateCommand,
  writeComposeOverrideCommand,
  tlsIssuerCommand,
  removeComposeOverrideCommand,
  parseOverridePath,
  parseIssuer,
  parseComposeInspect,
  composeOverridePath,
  composeInspectCommand,
  caOverrideYaml,
  caBundleCheckCommand,
  publicKeyOf,
  quote,
  remoteCommand,
  sshTarget,
  teardownCommand,
  type PcContainer,
} from '@/features/local-docker/commands'
import { DEFAULT_LOCAL_DOCKER_SETTINGS, localDockerSettingsSchema, type LocalDockerSettings } from '@/features/local-docker/schemas'

const settings: LocalDockerSettings = { ...DEFAULT_LOCAL_DOCKER_SETTINGS, pcUser: 'alfredopetri', serverAddress: '192.168.0.64' }

describe('comandos da máquina local', () => {
  it('túnel de controle conecta no localhost do servidor; direto, no IP do PC', () => {
    expect(sshTarget(settings)).toEqual({ host: 'localhost', port: 2222, user: 'alfredopetri' })
    expect(sshTarget({ ...settings, mode: 'direct', pcHost: '192.168.100.24', pcSshPort: 2200 })).toEqual({ host: '192.168.100.24', port: 2200, user: 'alfredopetri' })
    expect(remoteCommand(settings, 'true')).toContain('-p 2222 alfredopetri@localhost')
  })

  it('aponta o que falta para conectar', () => {
    expect(connectionProblem({ ...settings, pcUser: '' })).toBe('Informe o usuário do PC (WSL)')
    expect(connectionProblem({ ...settings, mode: 'direct', pcHost: '' })).toBe('Informe o IP do PC para a conexão direta')
    expect(connectionProblem(settings)).toBeNull()
  })

  it('abrir não duplica a conexão mestra e falha se o ssh falhar (o contexto não mascara o erro)', () => {
    const command = openTunnelCommand(settings)
    expect(command.startsWith('if ssh -S "$HOME/.ssh/opex-local.ctl" -O check')).toBe(true)
    expect(command).toContain('-f -N -M -S "$HOME/.ssh/opex-local.ctl"')
    expect(command).toContain('-L "$HOME/.opex-local-docker.sock":/var/run/docker.sock alfredopetri@localhost')
    expect(command).toMatch(/fi && \{ docker context inspect opex-local .* \|\| docker context create opex-local .*; \}$/)
  })

  it('repasse da porta da prévia escuta em todas as interfaces do servidor', () => {
    expect(forwardPortCommand(4005)).toContain('-O forward -L 0.0.0.0:4005:localhost:4005')
    expect(cancelForwardCommand(4005)).toContain('-O cancel -L 0.0.0.0:4005:localhost:4005')
  })

  it('lê as portas em escuta do ss e as informações do Docker', () => {
    const ss = ['LISTEN 0 4096 0.0.0.0:4001 0.0.0.0:*', 'LISTEN 0 128 [::]:4099 [::]:*', 'LISTEN 0 128 *:22 *:*', ''].join('\n')
    expect([...parseListeningPorts(ss)].sort()).toEqual([22, 4001, 4099])
    expect(parseMachineInfo('29.5.1|sipcurnot354|12|8326840320')).toEqual({ version: '29.5.1', name: 'sipcurnot354', cpus: 12, memoryBytes: 8326840320 })
    expect(parseMachineInfo('erro')).toBeNull()
  })

  it('derrubar a prévia não precisa do arquivo do compose e cita o projeto', () => {
    expect(teardownCommand('opex-local', 'portal-go-dev-1')).toContain("docker --context opex-local ps -aq --filter 'label=com.docker.compose.project=portal-go-dev-1'")
    expect(teardownCommand(null, 'x')).toContain('ids=$(docker ps -aq')
    expect(quote("a'b")).toBe("'a'\\''b'")
  })

  it('prefixo do Docker das prévias no PC', () => {
    expect(dockerPrefix(settings)).toBe('DOCKER_CONTEXT=opex-local BUILDX_BUILDER=opex-local-builder')
  })

  it('script do WSL: chave, serviço do túnel de controle e rede espelhada opcional', () => {
    const script = bootstrapScript(settings, 'ssh-ed25519 AAAA opex', { mirrored: true })
    expect(script).toContain("PUBKEY='ssh-ed25519 AAAA opex'")
    expect(script).toContain('openssh-server autossh')
    // Regressão: `update && install` com `set -e` pulava a instalação em silêncio quando o update falhava.
    expect(script).not.toMatch(/apt-get update[^\n]*&&/)
    expect(script).toContain('sudo apt-get update -qq || echo')
    expect(script).toContain('test -x /usr/sbin/sshd && command -v autossh >/dev/null || {')
    expect(script).toContain('-R $CONTROL_PORT:localhost:22 $SERVER')
    expect(script).toContain("SERVER='dev-server'")
    expect(script).toContain('wslset networkingMode mirrored')
    const direct = bootstrapScript({ ...settings, mode: 'direct', pcHost: '10.0.0.2' }, 'ssh-ed25519 AAAA', { mirrored: false })
    expect(direct).not.toContain('autossh')
    expect(direct).not.toContain('networkingMode')
    // Direto: o PC não precisa acessar o servidor (sem passo de acesso nem SERVER).
    expect(direct).toContain('==> 4/4')
    expect(direct).not.toContain('SERVER=')
  })

  it('passo a passo manual segue o modo (túnel de controle só no reverso)', () => {
    expect(manualSteps(settings, 'ssh-ed25519 AAAA', { mirrored: false }).map((step) => step.title)).toEqual(['Pacotes', 'Chave do servidor', 'Docker sem sudo', 'WSL', 'Acesso ao servidor', 'Túnel de controle'])
    const direct = manualSteps({ ...settings, mode: 'direct', pcHost: '10.0.0.2' }, null, { mirrored: true })
    expect(direct.map((step) => step.title)).toEqual(['Pacotes', 'Chave do servidor', 'Docker sem sudo', 'WSL', 'SSH'])
    expect(direct[3]!.description).toContain('networkingMode=mirrored')
    expect(direct[1]!.commands[1]).toContain('<gere a chave do servidor primeiro>')
  })
})

describe('chave do servidor', () => {
  it('importar grava a privada por base64 (sem aspas da chave no comando) e deriva a pública', () => {
    const key = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc'def\n-----END OPENSSH PRIVATE KEY-----"
    const command = importKeyCommand(key)
    expect(command).not.toContain('abc')
    expect(command).toContain(Buffer.from(`${key}\n`).toString('base64'))
    expect(command).toContain('ssh-keygen -y -P "" -f "$HOME/.ssh/opex_local_ed25519".tmp')
    expect(command).toContain('Chave inválida ou protegida por senha')
  })

  it('lê a chave pública e a impressão digital', () => {
    expect(publicKeyOf('lixo\nssh-ed25519 AAAAC3 opex-local@srv\n')).toBe('ssh-ed25519 AAAAC3 opex-local@srv')
    expect(publicKeyOf('ecdsa-sha2-nistp256 AAAA x')).toBe('ecdsa-sha2-nistp256 AAAA x')
    expect(publicKeyOf('nada')).toBeNull()
    expect(parseFingerprint('256 SHA256:q1rKDY0R2XTtvimLocRowcgdklA/fMzN/o0KoUWVBK4 opex-local@srv (ED25519)')).toBe('SHA256:q1rKDY0R2XTtvimLocRowcgdklA/fMzN/o0KoUWVBK4 (ED25519)')
    expect(parseFingerprint('erro')).toBeNull()
  })
})

const container = (overrides: Partial<PcContainer>): PcContainer => ({ name: 'x', state: 'running', status: 'Up', image: 'alpine/socat', composeProject: '', composeService: '', role: '', alias: '', target: '', network: '', ports: '', ...overrides })
const aliasOf = (name: string, port: number, overrides: Partial<PcContainer> = {}) =>
  container({ name: `opex-alias-${name}`, role: 'alias', alias: name, target: `192.168.0.64:${port}`, network: 'docker_default', ...overrides })

describe('preparo por diferença (só os containers de ambiente)', () => {
  it('apelido igual e rodando é mantido; parado é levantado; alterado é recriado', () => {
    const plan = planAliasReconcile(settings, [aliasOf('devteam-mongo', 27017), aliasOf('devteam-soketi', 6001, { state: 'exited' })])
    expect(plan.map((item) => [item.name, item.kind])).toEqual([
      ['opex-alias-devteam-mongo', 'keep'],
      ['opex-alias-devteam-soketi', 'start'],
    ])
    const changed = planAliasReconcile({ ...settings, aliases: [{ name: 'devteam-mongo', port: 27018 }] }, [aliasOf('devteam-mongo', 27017)])
    expect(changed.map((item) => item.kind)).toEqual(['create'])
  })

  it('novo apelido sobe sozinho sem mexer nos demais; o tirado da lista sai', () => {
    const next = { ...settings, aliases: [...settings.aliases.filter((alias) => alias.name !== 'devteam-soketi'), { name: 'devteam-minio', port: 9000 }] }
    const plan = planAliasReconcile(next, [aliasOf('devteam-mongo', 27017), aliasOf('devteam-soketi', 6001)])
    expect(plan.map((item) => [item.name, item.kind])).toEqual([
      ['opex-alias-devteam-mongo', 'keep'],
      ['opex-alias-devteam-minio', 'create'],
      ['opex-alias-devteam-soketi', 'remove'],
    ])
  })

  it('prévias e containers de outra origem nunca entram no plano; o formato antigo (sem label) é migrado', () => {
    const plan = planAliasReconcile(settings, [
      container({ name: 'gosipal-GO-DEV-717', composeProject: 'go-sipal-go-dev-717', image: 'sipal/painel' }),
      container({ name: 'outro-app' }),
      container({ name: 'opex-alias-devteam-mongo' }),
    ])
    expect(plan.map((item) => [item.name, item.kind])).toEqual([
      ['opex-alias-devteam-mongo', 'create'],
      ['opex-alias-devteam-soketi', 'create'],
    ])
  })

  it('prefixo personalizado: containers com o prefixo antigo e label são renomeados (remove + cria)', () => {
    const plan = planAliasReconcile({ ...settings, aliasPrefix: 'bm-', aliases: [{ name: 'devteam-mongo', port: 27017 }] }, [aliasOf('devteam-mongo', 27017)])
    expect(plan.map((item) => [item.name, item.kind])).toEqual([
      ['bm-devteam-mongo', 'create'],
      ['opex-alias-devteam-mongo', 'remove'],
    ])
  })

  it('o apelido é criado com os labels que o identificam', () => {
    const command = aliasRunCommand(settings, { name: 'devteam-mongo', port: 27017 })
    expect(command).toContain('--label opex.builder-machine=env --label opex.builder-machine.role=alias --label opex.builder-machine.alias=devteam-mongo --label opex.builder-machine.target=192.168.0.64:27017')
    expect(command).toContain('--network docker_default --network-alias devteam-mongo alpine/socat TCP-LISTEN:27017,fork,reuseaddr TCP:192.168.0.64:27017')
  })

  it('lê a lista de containers separada por tab', () => {
    const [item] = parseContainers('opex-alias-a\trunning\tUp 2h\talpine/socat\t\t\talias\ta\t192.168.0.64:1\tdocker_default\t\n')
    expect(item).toMatchObject({ name: 'opex-alias-a', role: 'alias', target: '192.168.0.64:1' })
  })
})

describe('builder dedicado com limites', () => {
  it('sem limites só carrega a imagem no Docker do PC; com limites usa memória (MiB) e quota de CPU', () => {
    expect(builderDriverOpts({ memoryGb: null, cpus: null })).toEqual(['default-load=true'])
    expect(builderDriverOpts({ memoryGb: 4.5, cpus: 2.5 })).toEqual(['default-load=true', 'memory=4608m', 'cpu-period=100000', 'cpu-quota=250000'])
  })

  it('recriar mantém o estado (cache); garantir não recria o que existe', () => {
    const limited = { ...settings, builderMemoryGb: 6, builderCpus: 4 }
    expect(builderEnsureCommand(limited, true)).toMatch(/^\{ docker buildx rm --keep-state opex-local-builder .*docker buildx create --name opex-local-builder --driver docker-container --driver-opt default-load=true --driver-opt memory=6144m --driver-opt cpu-period=100000 --driver-opt cpu-quota=400000 opex-local/)
    expect(builderEnsureCommand(settings, false)).toContain('docker buildx inspect opex-local-builder >/dev/null 2>&1 || docker buildx create')
  })
})

describe('containers e limpeza', () => {
  it('CPU e memória do docker stats', () => {
    const stats = parseStats('opex-alias-a\t0.15%\t1.2MiB / 7.7GiB\t0.02%\nbuildx_buildkit_b0\t--\t0B / 0B\t0.00%')
    expect(stats.get('opex-alias-a')).toEqual({ cpuPercent: 0.15, memoryUsage: '1.2MiB / 7.7GiB', memoryPercent: 0.02 })
    expect(stats.get('buildx_buildkit_b0')?.cpuPercent).toBe(0)
  })

  it('apagar a prévia leva containers, volumes, rede e imagens do projeto; recriar não faz build', () => {
    const command = previewDeleteCommand(settings, 'go-sipal-go-dev-717')
    for (const part of ['rm -f -v $ids', 'volume rm $vols', 'network rm $nets', 'image rm $imgs']) expect(command).toContain(part)
    expect(command).toContain("--filter 'label=com.docker.compose.project=go-sipal-go-dev-717'")
    expect(previewRecreateCommand(settings, { worktreePath: '/w/go-dev-717', composeProject: 'go-sipal-go-dev-717', service: 'app', port: 5003 })).toBe(
      "cd '/w/go-dev-717' && PORT=5003 DOCKER_CONTEXT=opex-local docker compose -p 'go-sipal-go-dev-717' up -d --force-recreate --no-build 'app'",
    )
  })

  it('limpeza: imagens órfãs e o cache do builder acima do teto', () => {
    expect(cleanupSteps({ ...settings, builderCacheKeepGb: 30 }).map((step) => step.command)).toEqual(['docker --context opex-local image prune -f', 'docker buildx prune --builder opex-local-builder -f --max-used-space 30gb'])
  })
})

describe('validação da configuração', () => {
  it('o padrão exige o usuário do WSL e o endereço do servidor já ao salvar', () => {
    const result = localDockerSettingsSchema.safeParse(DEFAULT_LOCAL_DOCKER_SETTINGS)
    expect(result.success ? [] : result.error.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['pcUser', 'Informe o usuário do WSL (ex.: alfredopetri)'],
      ['serverAddress', 'Informe o endereço do servidor (destino dos apelidos de rede)'],
    ])
    expect(localDockerSettingsSchema.safeParse(settings).success).toBe(true)
  })

  it('sem apelidos de rede o endereço do servidor é opcional', () => {
    expect(localDockerSettingsSchema.safeParse({ ...settings, serverAddress: '', aliases: [] }).success).toBe(true)
  })

  it('conexão direta exige o IP; apelidos não se repetem; nomes não aceitam caracteres de shell', () => {
    const issues = (value: Partial<LocalDockerSettings>) => {
      const result = localDockerSettingsSchema.safeParse({ ...settings, ...value })
      return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
    }
    expect(issues({ mode: 'direct', pcHost: '' })).toEqual(['pcHost'])
    expect(issues({ aliases: [{ name: 'a', port: 1 }, { name: 'a', port: 2 }] })).toEqual(['aliases.1.name'])
    expect(issues({ contextName: 'x; rm -rf /' })).toEqual(['contextName'])
    expect(issues({ pcUser: 'a b' })).toEqual(['pcUser'])
    expect(issues({ aliasPrefix: 'x;' })).toEqual(['aliasPrefix'])
    expect(issues({ builderMemoryGb: 0 })).toEqual(['builderMemoryGb'])
  })

  it('cada modo exige só os próprios campos', () => {
    const issues = (value: Partial<LocalDockerSettings>) => {
      const result = localDockerSettingsSchema.safeParse({ ...settings, ...value })
      return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
    }
    expect(issues({ serverSshHost: '' })).toEqual(['serverSshHost'])
    expect(issues({ mode: 'direct', pcHost: '10.0.0.2', serverSshHost: '' })).toEqual([])
    expect(issues({ builderMemoryGb: null, builderCpus: null })).toEqual([])
  })
})

describe('certificados do PC: override do compose', () => {
  const sh = (command: string, env: Record<string, string> = {}) => execFileSync('bash', ['-c', command], { encoding: 'utf8', env: { ...process.env, ...env } })

  /** Worktree temporário com arquivos do compose e um `docker` falso que imprime os argumentos como serviços. */
  function worktree(files: string[]) {
    const dir = mkdtempSync(join(tmpdir(), 'mt-compose-'))
    for (const file of files) writeFileSync(join(dir, file), 'services: {}\n')
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'docker'), '#!/bin/sh\necho "port=$PORT"\nfor a in "$@"; do echo "$a"; done\n', { mode: 0o755 })
    return { dir, env: { PATH: `${bin}:${process.env.PATH}` } }
  }

  it('descobre o arquivo-base e o override padr\u00e3o do compose e lista os servi\u00e7os', () => {
    const wt = worktree(['docker-compose.yml', 'docker-compose.override.yml'])
    const output = sh(composeInspectCommand({ worktreePath: wt.dir, composeFile: '', portEnvVar: 'PORT', port: 4003 }), wt.env)
    const parsed = parseComposeInspect(output)
    expect(parsed.files).toEqual(['docker-compose.yml', 'docker-compose.override.yml'])
    expect(parsed.services).toEqual(['port=4003', 'compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.override.yml', 'config', '--services'])
  })

  it('compose.yaml tem prioridade; o composeFile da central substitui a descoberta', () => {
    const wt = worktree(['compose.yaml', 'docker-compose.yml'])
    expect(parseComposeInspect(sh(composeInspectCommand({ worktreePath: wt.dir, composeFile: '', portEnvVar: 'PORT', port: 4003 }), wt.env)).files).toEqual(['compose.yaml'])
    expect(parseComposeInspect(sh(composeInspectCommand({ worktreePath: wt.dir, composeFile: 'docker/prod.yml', portEnvVar: 'APP_PORT', port: 4010 }), wt.env)).files).toEqual(['docker/prod.yml'])
  })

  it('sem arquivo do compose no worktree: falha com mensagem', () => {
    const wt = worktree([])
    expect(() => sh(composeInspectCommand({ worktreePath: wt.dir, composeFile: '', portEnvVar: 'PORT', port: 4003 }), wt.env)).toThrow()
  })

  it('override monta o bundle s\u00f3 leitura, sem criar pasta no PC, e aponta Node/OpenSSL/Python para ele', () => {
    const yaml = caOverrideYaml({ pcCaBundlePath: '/usr/local/share/ca.pem' }, ['app', 'worker'])
    expect(yaml).toContain('  "app":\n    volumes:\n      - type: bind\n        source: "/usr/local/share/ca.pem"\n        target: "/etc/opex/ca-bundle.pem"\n        read_only: true\n        bind:\n          create_host_path: false')
    expect(yaml).toContain('  "worker":')
    for (const name of ['NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE']) expect(yaml).toContain(`      ${name}: "/etc/opex/ca-bundle.pem"`)
  })

  it('grava o override no $HOME do host e imprime o caminho absoluto; remover apaga o arquivo', () => {
    const home = mkdtempSync(join(tmpdir(), 'mt-home-'))
    const output = sh(writeComposeOverrideCommand('portal-mt-18', 'services:\n  "app": {}\n'), { HOME: home })
    const path = parseOverridePath(output)
    expect(path).toBe(join(home, '.opex-local/compose/portal-mt-18.ca.yml'))
    expect(readFileSync(path!, 'utf8')).toBe('services:\n  "app": {}\n')
    sh(removeComposeOverrideCommand('portal-mt-18'), { HOME: home })
    expect(existsSync(path!)).toBe(false)
    expect(() => composeOverridePath('x"; rm -rf /')).toThrow()
  })

  it('recriar com os arquivos do build repete os -f; sem a lista, o comando antigo', () => {
    expect(previewRecreateCommand(settings, { worktreePath: '/w', composeProject: 'p', service: 'app', port: 4001, files: ['compose.yaml', '/h/p.ca.yml'] })).toBe("cd '/w' && PORT=4001 DOCKER_CONTEXT=opex-local docker compose -p 'p' -f 'compose.yaml' -f '/h/p.ca.yml' up -d --force-recreate --no-build 'app'")
    expect(previewRecreateCommand(settings, { worktreePath: '/w', composeProject: 'p', service: 'app', port: 4001, files: [] })).not.toContain(' -f ')
  })

  it('emissor do certificado: OpenSSL 1.1 e 3.x normalizados; sem openssl = n\u00e3o verificado', () => {
    expect(parseIssuer('issuer=CN = FortiGate SubCA Global\n')).toBe('CN=FortiGate SubCA Global')
    expect(parseIssuer('issuer=C=US, O=Google Trust Services, CN=WE1')).toBe('C=US, O=Google Trust Services, CN=WE1')
    expect(parseIssuer('NO_OPENSSL')).toBeNull()
    expect(caBundleCheckCommand({ pcCaBundlePath: '/etc/ssl/certs/ca-certificates.crt' })).toContain("test -r '\\''/etc/ssl/certs/ca-certificates.crt'\\''")
    expect(tlsIssuerCommand('api.clerk.com')).toContain('-connect api.clerk.com:443 -servername api.clerk.com')
  })

  it('schema: caminho do bundle precisa ser absoluto', () => {
    expect(localDockerSettingsSchema.safeParse({ ...settings, pcCaBundlePath: 'certs/ca.pem' }).success).toBe(false)
    expect(localDockerSettingsSchema.safeParse({ ...settings, pcCaBundlePath: '/etc/ssl/cert.pem' }).success).toBe(true)
  })
})

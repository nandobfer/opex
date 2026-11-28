import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { overrideYaml, parseComposeConfig, parseComposeYaml, runOnPcProblem, withOverrideMounts } from '@/features/environments/compose-config'
import { registryImage } from '@/features/environments/commands'
import { COMPOSE_TAGS, overrideYamlProblem } from '@/features/environments/override-yaml'
import { composeOverridesSchema, DEFAULT_ENVIRONMENTS_SETTINGS, type ComposeOverrides, type ServiceOverride } from '@/features/environments/schemas'
import { composeOverridesPendingDeploy, composeOverridesShortText, composeOverridesText, EMPTY_SERVICE_VALUES, normalizeServiceValues, ownImageServices, sameComposeOverrides } from '@/features/environments/service-overrides'
import { addOverrideService, composeFieldText, initialFieldValue, removeOverrideService, setOverrideField, shadowedEnvKeys, unforwardedPorts } from '@/features/environments/services-form'

/** Serviços do compose (OPE-211): leitura do compose, override, YAML avançado, resumo e formulário. */

const override = (service: string, values: Partial<ServiceOverride> = {}): ServiceOverride => ({ service, ...EMPTY_SERVICE_VALUES, ...values })
const overrides = (services: ServiceOverride[], yaml = ''): ComposeOverrides => ({ services, yaml })
const parsed = (text: string) => parse(text, { customTags: COMPOSE_TAGS }) as { services: Record<string, Record<string, unknown>>; volumes?: Record<string, unknown> }

describe('leitura dos dados do serviço no compose', () => {
  it('JSON do config (forma longa): imagem, command, environment, portas, volumes, healthcheck e depends_on', () => {
    const config = JSON.stringify({
      services: {
        app: {
          image: 'loja:1',
          command: ['npm', 'start'],
          environment: { NODE_ENV: 'production', URL: '${PUBLIC_URL}' },
          labels: { 'traefik.enable': 'true' },
          ports: [{ mode: 'ingress', target: 3000, published: '4100', protocol: 'tcp', host_ip: '127.0.0.1' }],
          volumes: [{ type: 'bind', source: '/srv/dados', target: '/dados', read_only: true }, { type: 'volume', source: 'cache', target: '/cache' }],
          restart: 'unless-stopped',
          healthcheck: { test: ['CMD-SHELL', 'curl -f http://localhost:3000'], interval: '30s', retries: 3 },
          depends_on: { db: { condition: 'service_healthy', restart: true, required: true } },
        },
      },
    })
    const [app] = parseComposeConfig(config)!
    expect(app!.values).toEqual({
      image: 'loja:1',
      command: ['npm', 'start'],
      entrypoint: null,
      environment: [{ key: 'NODE_ENV', value: 'production' }, { key: 'URL', value: '${PUBLIC_URL}' }],
      labels: [{ key: 'traefik.enable', value: 'true' }],
      ports: [{ target: 3000, published: '4100', protocol: 'tcp', hostIp: '127.0.0.1' }],
      volumes: [{ type: 'bind', source: '/srv/dados', target: '/dados', readOnly: true }, { type: 'volume', source: 'cache', target: '/cache', readOnly: false }],
      restart: 'unless-stopped',
      healthcheck: { mode: 'shell', test: ['curl -f http://localhost:3000'], interval: '30s', timeout: '', startPeriod: '', retries: 3 },
      dependsOn: [{ service: 'db', condition: 'service_healthy', restart: true }],
    })
  })

  it('YAML bruto do compose gerenciado (formas curtas): portas com IP e intervalo, volumes :ro, environment em lista, command em texto', () => {
    const [minio] = parseComposeYaml(`services:
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=admin
      - VAZIA
    ports:
      - "127.0.0.1:9000:9000"
      - "9100-9101:9100-9101/udp"
      - 9001
    volumes:
      - ./dados:/data:ro
      - cache:/cache
      - /tmp/anon
    depends_on:
      - db
    healthcheck:
      disable: true
`)!
    expect(minio!.values.command).toEqual(['server', '/data', '--console-address', ':9001'])
    expect(minio!.values.environment).toEqual([{ key: 'MINIO_ROOT_USER', value: 'admin' }, { key: 'VAZIA', value: '' }])
    expect(minio!.values.ports).toEqual([
      { target: 9000, published: '9000', protocol: 'tcp', hostIp: '127.0.0.1' },
      { target: 9100, published: '9100-9101', protocol: 'udp', hostIp: '' },
      { target: 9001, published: '', protocol: 'tcp', hostIp: '' },
    ])
    expect(minio!.values.volumes).toEqual([
      { type: 'bind', source: './dados', target: '/data', readOnly: true },
      { type: 'volume', source: 'cache', target: '/cache', readOnly: false },
      { type: 'volume', source: '', target: '/tmp/anon', readOnly: false },
    ])
    expect(minio!.values.dependsOn).toEqual([{ service: 'db', condition: 'service_started', restart: false }])
    expect(minio!.values.healthcheck).toEqual({ mode: 'disable' })
  })

  it('regressão: ${VAR:-padrão} nas formas curtas fica inteiro; o que não dá para ler é sinalizado, nunca some calado', () => {
    const [app] = parseComposeYaml(`services:
  app:
    image: app
    ports:
      - "\${PORT:-3000}:3000"
      - "\${PORT}:80"
      - "8080:\${ALVO}"
    volumes:
      - "\${DIR:-./d}:/x:ro"
      - "dados:\${DESTINO}"
`)!
    expect(app!.values.ports).toEqual([
      { target: 3000, published: '${PORT:-3000}', protocol: 'tcp', hostIp: '' },
      { target: 80, published: '${PORT}', protocol: 'tcp', hostIp: '' },
    ])
    expect(app!.values.volumes).toEqual([
      { type: 'bind', source: '${DIR:-./d}', target: '/x', readOnly: true },
      { type: 'volume', source: 'dados', target: '${DESTINO}', readOnly: false },
    ])
    expect(app!.unreadable).toEqual({ ports: ['8080:${ALVO}'], volumes: [] })
    // O que foi lido passa na mesma validação da tela (ligar "Personalizar" e salvar não dá erro).
    expect(composeOverridesSchema.safeParse(overrides([override('app', { ports: app!.values.ports, volumes: [app!.values.volumes![0]!] })])).success).toBe(true)
  })

  it('o que o compose não declara fica null', () => {
    expect(normalizeServiceValues({ image: 'mongo:7' })).toEqual({ ...EMPTY_SERVICE_VALUES, image: 'mongo:7' })
  })
})

describe('override com os ajustes dos serviços', () => {
  const services = parseComposeConfig(JSON.stringify({ services: { app: { build: { context: '.' } }, db: { image: 'mongo:7' } } }))!
  const settings = DEFAULT_ENVIRONMENTS_SETTINGS

  it('sem ajustes o override é o de antes', () => {
    expect(overrideYaml({ services, images: {}, withEnvFile: false, overrides: null })).toContain('services: {}')
    expect(overrideYaml({ services, images: {}, withEnvFile: false, overrides: overrides([override('app')]) })).toContain('services: {}')
  })

  it('imagem própria: não recebe a imagem do registry e ganha build: !reset null', () => {
    const yaml = overrideYaml({ services, images: { app: registryImage(settings, 'loja', 'app', 'abc') }, withEnvFile: false, overrides: overrides([override('app', { image: 'ghcr.io/loja/app:2' })]) })
    expect(yaml).not.toContain('opex-env/loja-app')
    expect(yaml).toContain('    image: ghcr.io/loja/app:2\n    build: !reset null')
    expect(parsed(yaml).services.app).toEqual({ image: 'ghcr.io/loja/app:2', build: null })
    expect(ownImageServices(overrides([override('app', { image: 'x' })], 'db:\n  image: mongo:8\n'))).toEqual(['app', 'db'])
  })

  it('listas e mapas substituem os do compose (!override); command vazio volta o da imagem (!reset); $ vai literal; volume nomeado no topo', () => {
    const yaml = overrideYaml({
      services,
      images: {},
      withEnvFile: false,
      overrides: overrides([
        override('db', {
          command: [],
          environment: [{ key: 'SENHA', value: 'p@$$w0rd ${X}' }],
          ports: [{ target: 27017, published: '27018', protocol: 'tcp', hostIp: '127.0.0.1' }],
          volumes: [{ type: 'volume', source: 'dados', target: '/data/db', readOnly: false }],
          restart: 'always',
          healthcheck: { mode: 'exec', test: ['mongosh', '--eval', 'db.ping()'], interval: '10s', timeout: '', startPeriod: '', retries: null },
          dependsOn: [{ service: 'app', condition: 'service_started', restart: false }],
          labels: [{ key: 'dono', value: 'opex' }],
        }),
      ]),
    })
    expect(yaml).toContain('    command: !reset null')
    expect(yaml).toContain('    environment: !override\n      SENHA: p@$$w0rd ${X}')
    expect(yaml).toContain('    ports: !override\n')
    expect(yaml).toContain('    volumes: !override\n')
    expect(yaml).toContain('volumes:\n  "dados": {}')
    const db = parsed(yaml).services.db!
    expect(db.ports).toEqual([{ target: 27017, published: '27018', protocol: 'tcp', host_ip: '127.0.0.1' }])
    expect(db.volumes).toEqual([{ type: 'volume', source: 'dados', target: '/data/db' }])
    expect(db.healthcheck).toEqual({ test: ['CMD', 'mongosh', '--eval', 'db.ping()'], interval: '10s' })
    expect(db.depends_on).toEqual({ app: { condition: 'service_started', restart: false } })
    expect(db.restart).toBe('always')
    expect(db.labels).toEqual({ dono: 'opex' })
  })

  it('YAML avançado entra por último no serviço (com as tags) e serviço fora do compose fica de fora', () => {
    const yaml = overrideYaml({ services, images: {}, withEnvFile: true, overrides: overrides([], 'app:\n  stop_grace_period: 30s\n  ulimits: !override\n    nofile: 65536\nantigo:\n  restart: always\n') })
    expect(yaml).toContain('"app":\n    env_file:\n      - ".env.opex"\n    stop_grace_period: 30s\n    ulimits: !override\n      nofile: 65536')
    expect(yaml).not.toContain('antigo')
  })

  it('executar no PC: pasta (bind) dos ajustes bloqueia; volumes personalizados substituem os do compose', () => {
    const withBind = parseComposeConfig(JSON.stringify({ services: { app: { image: 'a', volumes: [{ type: 'bind', source: '/srv', target: '/srv' }] } } }))!
    expect(runOnPcProblem(withOverrideMounts(withBind, overrides([override('app', { volumes: [] })])))).toBeNull()
    expect(runOnPcProblem(withOverrideMounts(services, overrides([override('db', { volumes: [{ type: 'bind', source: './x', target: '/x', readOnly: false }] })])))).toContain('bind mount em db (./x:/x)')
  })

  it('regressão: volumes do YAML avançado com !override ou !reset substituem os binds do compose; sem tag, somam', () => {
    const withBind = parseComposeConfig(JSON.stringify({ services: { app: { image: 'a', volumes: [{ type: 'bind', source: '/srv/app', target: '/app' }] } } }))!
    expect(runOnPcProblem(withOverrideMounts(withBind, overrides([], 'app:\n  volumes: !override\n    - dados:/data\n')))).toBeNull()
    expect(runOnPcProblem(withOverrideMounts(withBind, overrides([], 'app:\n  volumes: !reset []\n')))).toBeNull()
    expect(runOnPcProblem(withOverrideMounts(withBind, overrides([], 'app:\n  volumes: !reset null\n')))).toBeNull()
    expect(runOnPcProblem(withOverrideMounts(withBind, overrides([], 'app:\n  volumes:\n    - dados:/data\n')))).toContain('bind mount em app (/srv/app:/app)')
    // Com !override, um bind no próprio YAML continua bloqueando.
    expect(runOnPcProblem(withOverrideMounts(withBind, overrides([], 'app:\n  volumes: !override\n    - ./x:/x\n')))).toContain('bind mount em app (./x:/x)')
  })

  it('regressão: image: !reset null no YAML avançado não é imagem própria (o build do compose continua)', () => {
    const value = overrides([], 'app:\n  image: !reset null\n')
    expect(ownImageServices(value)).toEqual([])
    expect(ownImageServices(overrides([], 'app:\n  image: ""\n'))).toEqual([])
    const yaml = overrideYaml({ services, images: { app: registryImage(settings, 'loja', 'app', 'abc') }, withEnvFile: false, overrides: value })
    expect(yaml).not.toContain('build: !reset')
    expect(yaml).toContain('image: !reset null')
  })
})

describe('YAML avançado e validação', () => {
  it('YAML inválido com a linha; chave do Opex recusada; vazio vale', () => {
    expect(overrideYamlProblem('')).toBeNull()
    expect(overrideYamlProblem('app:\n  restart: always\n  ports: [1\n')).toMatchObject({ message: expect.stringMatching(/^YAML inválido na linha \d+/) })
    expect(overrideYamlProblem('app:\n  env_file: x\n')?.message).toContain('app.env_file não pode ir no YAML avançado')
    expect(overrideYamlProblem('app:\n  deploy: {}\n')?.message).toContain('app.deploy')
    expect(overrideYamlProblem('- lista\n')?.message).toContain('mapa de serviços')
    expect(overrideYamlProblem('app:\n  command: !reset null\n')).toBeNull()
  })

  it('a mesma chave no bloco guiado e no YAML avançado é recusada; labels com.docker.compose.* também', () => {
    const clash = composeOverridesSchema.safeParse(overrides([override('app', { image: 'a:1' })], 'app:\n  image: b:2\n'))
    expect(clash.success ? null : clash.error.issues[0]?.message).toBe('app.image está no bloco guiado e no YAML avançado: deixe em um só')
    const label = composeOverridesSchema.safeParse(overrides([override('app', { labels: [{ key: 'com.docker.compose.project', value: 'x' }] })]))
    expect(label.success ? null : label.error.issues[0]?.message).toContain('com.docker.compose.*')
    const repeated = composeOverridesSchema.safeParse(overrides([override('app'), override('app')]))
    expect(repeated.success).toBe(false)
    expect(composeOverridesSchema.safeParse(overrides([override('app', { dependsOn: [{ service: 'app', condition: 'service_started', restart: false }] })])).success).toBe(false)
  })
})

describe('resumo e divergência', () => {
  const saved = overrides([override('app', { image: 'nginx:1.27', ports: [{ target: 80, published: '8080', protocol: 'tcp', hostIp: '' }] }), override('db', { environment: [{ key: 'A', value: 'segredo' }, { key: 'B', value: 'x' }] })], 'worker:\n  stop_signal: SIGINT\n')

  it('texto com as chaves do environment (nunca os valores)', () => {
    const text = composeOverridesText(saved)
    expect(text).toBe('app imagem nginx:1.27, ports (1); db environment (2: A, B); YAML avançado: worker')
    expect(text).not.toContain('segredo')
    expect(composeOverridesShortText(saved)).toBe('app imagem nginx:1.27 · 4 ajustes')
    expect(composeOverridesText(null)).toBe('')
  })

  it('salvo × implantado: serviço vazio e ordem não contam; null equivale a sem ajustes; só em ambiente implantado', () => {
    expect(sameComposeOverrides(null, overrides([override('app')]))).toBe(true)
    expect(sameComposeOverrides(saved, { services: [...saved.services].reverse(), yaml: `${saved.yaml}\n` })).toBe(true)
    expect(composeOverridesPendingDeploy({ composeOverrides: saved, deployedComposeOverrides: null, deployedOn: { buildOn: 'server', runOn: 'server' } })).toBe(true)
    expect(composeOverridesPendingDeploy({ composeOverrides: saved, deployedComposeOverrides: saved, deployedOn: { buildOn: 'server', runOn: 'server' } })).toBe(false)
    expect(composeOverridesPendingDeploy({ composeOverrides: saved, deployedComposeOverrides: null, deployedOn: null })).toBe(false)
  })
})

describe('regras do formulário', () => {
  it('adicionar, trocar um campo e remover um serviço', () => {
    let value = addOverrideService(overrides([]), 'app')
    expect(addOverrideService(value, 'app')).toBe(value)
    value = setOverrideField(value, 'app', 'restart', 'always')
    expect(value.services[0]!.restart).toBe('always')
    expect(removeOverrideService(value, 'app').services).toEqual([])
  })

  it('ligar "Personalizar" começa com o valor do compose (cópia) ou o campo vazio', () => {
    const compose = { ...EMPTY_SERVICE_VALUES, ports: [{ target: 80, published: '8080', protocol: 'tcp' as const, hostIp: '' }] }
    const copy = initialFieldValue('ports', compose)
    expect(copy).toEqual(compose.ports)
    expect(copy).not.toBe(compose.ports)
    expect(initialFieldValue('image', null)).toBe('')
    expect(initialFieldValue('healthcheck', compose)).toMatchObject({ mode: 'shell' })
    expect(composeFieldText('ports', compose)).toBe('8080:80/tcp')
    expect(composeFieldText('image', compose)).toBeNull()
  })

  it('avisos: environment que sobrepõe Variáveis extras e porta publicada fora de Portas ao executar no PC', () => {
    const item = override('app', { environment: [{ key: 'TOKEN', value: '' }, { key: 'X', value: '' }], ports: [{ target: 80, published: '8080', protocol: 'tcp', hostIp: '' }] })
    expect(shadowedEnvKeys(item, ['TOKEN'])).toEqual(['TOKEN'])
    expect(unforwardedPorts(item, [4100], 'pc')).toEqual(['8080'])
    expect(unforwardedPorts(item, [8080], 'pc')).toEqual([])
    expect(unforwardedPorts(item, [], 'server')).toEqual([])
  })
})

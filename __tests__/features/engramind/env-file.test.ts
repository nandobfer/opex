import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyEnvChanges, envEntriesOf, parseEnvFile } from '@/features/engramind/env-file'
import { ENV_MASK_EMPTY, ENV_MASK_SET } from '@/features/engramind/constants'
import { applyCommand, ENV_CHANGED_EXIT, parseReadOutput, readEnvCommand, writeEnvCommand } from '@/features/engramind/server/host-env-commands'
import { quote } from '@/features/local-docker/commands'

/**
 * `.env` do Engramind: edição pura preservando o arquivo e os comandos do host rodando de verdade num
 * diretório temporário (os segredos nunca aparecem na saída e voltam intactos na gravação).
 */

const ENV = `# Comentário do topo
APP_ENV=production
APP_PORT=8000

TOKEN_PEPPER=pepper-secreto-0123456789abcdef0123456789
SECRETS_KEY="chave/base64=="
BOOTSTRAP_ADMIN_TOKEN=
LITESTREAM_SECRET_ACCESS_KEY='s3-secreto'
EXTRA_DESCONHECIDA=fica
RUST_LOG=engramind=info,tower_http=warn
`

describe('edição pura do .env', () => {
  it('altera no lugar, acrescenta a nova e preserva comentários, ordem e desconhecidas', () => {
    const next = applyEnvChanges(ENV, { APP_PORT: '8001', TZ: 'America/Sao_Paulo', RUST_LOG: 'engramind=debug' })
    const lines = next.split('\n')
    expect(lines[0]).toBe('# Comentário do topo')
    expect(lines[2]).toBe('APP_PORT=8001')
    expect(next).toContain('EXTRA_DESCONHECIDA=fica')
    expect(next).toContain('RUST_LOG=engramind=debug')
    expect(next.trimEnd().endsWith('TZ=America/Sao_Paulo')).toBe(true)
    expect(parseEnvFile(next).filter((line) => line.type === 'entry')).toHaveLength(9)
  })

  it('valores com espaço ou $ vão entre aspas', () => {
    expect(applyEnvChanges('A=1\n', { A: 'com espaço $HOME' })).toBe('A="com espaço \\$HOME"\n')
  })

  it('as sensíveis aparecem só como configurada/não', () => {
    const masked = `TOKEN_PEPPER=${ENV_MASK_SET}\nSECRETS_KEY=${ENV_MASK_EMPTY}\nAPP_PORT=8000\nOUTRA=1\n`
    const entries = envEntriesOf(masked)
    expect(entries.find((entry) => entry.key === 'TOKEN_PEPPER')).toEqual({ key: 'TOKEN_PEPPER', kind: 'read-only', configured: true })
    expect(entries.find((entry) => entry.key === 'SECRETS_KEY')).toEqual({ key: 'SECRETS_KEY', kind: 'read-only', configured: false })
    expect(entries.find((entry) => entry.key === 'APP_PORT')).toEqual({ key: 'APP_PORT', kind: 'editable', value: '8000' })
    expect(entries.find((entry) => entry.key === 'OUTRA')).toEqual({ key: 'OUTRA', kind: 'unknown', value: '1' })
    expect(JSON.stringify(entries)).not.toContain(ENV_MASK_SET)
  })
})

describe('comandos no host (bash + awk reais)', () => {
  let dir: string
  const sh = (command: string) => {
    try {
      return { code: 0, out: execFileSync('bash', ['-c', command], { encoding: 'utf8' }) }
    } catch (error) {
      const failure = error as { status: number; stdout: string }
      return { code: failure.status, out: failure.stdout }
    }
  }
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'engramind-env-'))
    writeFileSync(join(dir, '.env'), ENV)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('a leitura mascara os segredos no próprio host', () => {
    const { code, out } = sh(readEnvCommand(quote(dir)))
    expect(code).toBe(0)
    expect(out).not.toContain('pepper-secreto')
    const parsed = parseReadOutput(out)
    expect(parsed).not.toBeNull()
    const { content } = parsed as { content: string }
    expect(content).not.toMatch(/pepper-secreto|chave\/base64|s3-secreto/)
    expect(content).toContain(`TOKEN_PEPPER=${ENV_MASK_SET}`)
    expect(content).toContain(`BOOTSTRAP_ADMIN_TOKEN=${ENV_MASK_EMPTY}`)
    expect(content).toContain('# Comentário do topo')
  })

  it('a gravação repõe os segredos, aplica as mudanças e recusa se o arquivo mudou', () => {
    const { hash, content } = parseReadOutput(sh(readEnvCommand(quote(dir))).out) as { hash: string; content: string }
    const next = applyEnvChanges(content, { APP_PORT: '8001', LITESTREAM_SECRET_ACCESS_KEY: 'novo-s3' })
    const result = sh(writeEnvCommand(quote(dir), hash, next))
    expect(result.code).toBe(0)
    const written = readFileSync(join(dir, '.env'), 'utf8')
    expect(written).toContain('TOKEN_PEPPER=pepper-secreto-0123456789abcdef0123456789')
    expect(written).toContain('SECRETS_KEY="chave/base64=="')
    expect(written).toContain('BOOTSTRAP_ADMIN_TOKEN=')
    expect(written).toContain('LITESTREAM_SECRET_ACCESS_KEY=novo-s3')
    expect(written).toContain('APP_PORT=8001')
    expect(written).toContain('EXTRA_DESCONHECIDA=fica')
    expect(sh(writeEnvCommand(quote(dir), hash, next)).code).toBe(ENV_CHANGED_EXIT)
  })

  it('arquivo ausente', () => {
    rmSync(join(dir, '.env'))
    expect(parseReadOutput(sh(readEnvCommand(quote(dir))).out)).toBe('missing')
  })
})

describe('aplicar e reiniciar', () => {
  it('recria só o api com a imagem em execução e os dois arquivos do compose, sem build nem pull', () => {
    const command = applyCommand({ dir: "'/home/engramind'", composeFiles: ['/home/engramind/docker-compose.yml', '/home/engramind/docker-compose.deploy.yml'], previousProject: null, currentContainer: 'engramind-api' })
    expect(command).toContain("docker inspect -f '{{.Config.Image}}' 'engramind-api'")
    expect(command).toContain("-f '/home/engramind/docker-compose.deploy.yml'")
    expect(command).toContain("up -d --no-build --pull never 'api'")
    expect(command).not.toContain(' down ')
  })

  it('com a porta ou o container trocados, derruba o projeto antigo antes', () => {
    const command = applyCommand({ dir: "'/home/engramind'", composeFiles: ['docker-compose.yml'], previousProject: 'engramind-8000', currentContainer: 'engramind-api' })
    expect(command.indexOf("-p 'engramind-8000' down")).toBeGreaterThan(-1)
    expect(command.indexOf('down')).toBeLessThan(command.indexOf('up -d'))
  })
})

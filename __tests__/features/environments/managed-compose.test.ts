import { describe, expect, it } from 'vitest'
import { ensureEnvDirCommand, removeEnvDirCommand } from '@/features/environments/commands'
import { MANAGED_COMPOSE_MAX_BYTES } from '@/features/environments/constants'
import { authorLabel, composeContentProblem, composeNotDeployed } from '@/features/environments/managed-compose'
import { DEFAULT_ENVIRONMENTS_SETTINGS, environmentCreateSchema, environmentInputSchema, managedSourceSchema } from '@/features/environments/schemas'
import { composePlanOf } from '@/features/environments/server/service'
import { sourceLabel } from '@/features/environments/opex-format'

/** Compose gerenciado (OPE-191): validação do YAML, schema da origem, pasta e regras puras da tela. */

const MINIO = 'services:\n  minio:\n    image: minio/minio\n    ports:\n      - "9000:9000"\n'
const managed = { kind: 'managed' as const, projectName: 'minio', services: [], composeVersion: 3 }
const base = { name: 'MinIO', slug: 'minio', env: [], ports: [], healthUrl: '' as const, buildOn: 'server' as const, runOn: 'pc' as const }

describe('composeContentProblem', () => {
  it('aceita um YAML válido', () => {
    expect(composeContentProblem(MINIO)).toBeNull()
  })

  it('recusa vazio ou só espaços', () => {
    expect(composeContentProblem('  \n ')?.message).toBe('Escreva o compose (YAML)')
  })

  it('recusa acima de 256 KB (contados em bytes)', () => {
    const problem = composeContentProblem(`# ${'é'.repeat(MANAGED_COMPOSE_MAX_BYTES / 2)}`)
    expect(problem?.message).toMatch(/passa do limite de 256 KB/)
    expect(composeContentProblem(`# ${'a'.repeat(MANAGED_COMPOSE_MAX_BYTES - 10)}`)).toBeNull()
  })

  it('YAML inválido diz a linha do erro', () => {
    const problem = composeContentProblem('services:\n  app:\n    image: x\n  bad: [\n')
    expect(problem?.line).toBe(5)
    expect(problem?.message).toMatch(/^YAML inválido na linha 5: /)
    expect(composeContentProblem('a: 1\na: 2\n')?.message).toBe('YAML inválido na linha 2: Map keys must be unique')
  })
})

describe('schemas', () => {
  it('origem gerenciada: revisão vigente a partir de 1, sem ref nem central', () => {
    expect(managedSourceSchema.safeParse(managed).success).toBe(true)
    expect(managedSourceSchema.safeParse({ ...managed, composeVersion: 0 }).success).toBe(false)
    expect(environmentInputSchema.safeParse({ ...base, source: managed }).success).toBe(true)
  })

  it('criação de gerenciado exige o compose válido (decisão do dono); a central não', () => {
    expect(environmentCreateSchema.safeParse({ ...base, source: managed }).success).toBe(false)
    const invalid = environmentCreateSchema.safeParse({ ...base, source: managed, compose: 'a: [' })
    expect(invalid.success ? null : invalid.error.issues[0]?.path).toEqual(['compose'])
    expect(environmentCreateSchema.safeParse({ ...base, source: managed, compose: MINIO }).success).toBe(true)
    const central = { kind: 'central' as const, centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' }
    expect(environmentCreateSchema.safeParse({ ...base, source: central }).success).toBe(true)
  })
})

describe('pasta do ambiente', () => {
  it('composePlanOf: arquivos no servidor, na pasta do ambiente, com o compose gravado pelo deploy', () => {
    expect(composePlanOf({ slug: 'minio', source: { ...managed, services: ['minio'] } }, DEFAULT_ENVIRONMENTS_SETTINGS)).toEqual({ projectName: 'minio', dir: '"$HOME/opex-envs/minio"', filesOn: 'server', composeFiles: ['docker-compose.yml'], services: ['minio'] })
  })

  it('cria e apaga a pasta inteira', () => {
    expect(ensureEnvDirCommand(DEFAULT_ENVIRONMENTS_SETTINGS, 'minio')).toBe('mkdir -p "$HOME/opex-envs/minio"')
    expect(removeEnvDirCommand(DEFAULT_ENVIRONMENTS_SETTINGS, 'minio')).toBe('rm -rf "$HOME/opex-envs/minio"')
  })
})

describe('regras da tela', () => {
  it('compose novo não implantado: só gerenciado já implantado com revisão diferente', () => {
    const deployedOn = { buildOn: 'server', runOn: 'server' }
    expect(composeNotDeployed({ source: managed, deployedOn, deployedComposeVersion: 2 })).toBe(true)
    expect(composeNotDeployed({ source: managed, deployedOn, deployedComposeVersion: 3 })).toBe(false)
    expect(composeNotDeployed({ source: managed, deployedOn: null, deployedComposeVersion: null })).toBe(false)
    expect(composeNotDeployed({ source: { kind: 'central' }, deployedOn, deployedComposeVersion: null })).toBe(false)
  })

  it('autor e origem legíveis', () => {
    expect(authorLabel('local')).toBe('Dono')
    expect(sourceLabel(managed)).toBe('gerenciado (v3)')
  })
})

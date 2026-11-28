import { describe, expect, it } from 'vitest'
import { bootstrapCentralConfig, bootstrapEnvironmentInput, freeEnvironmentSlug } from '@/features/project-bootstrap/environment-input'
import { environmentCreateSchema } from '@/features/environments/schemas'
import { defaultCentralConfig } from '@/features/agentic/schemas'
import { buildBootstrapInstructions, buildDeployFailedPrompt, tailLog } from '@/features/project-bootstrap/prompts'

const result = { port: 4014, healthPath: '/api/health', hasServer: true, usesMongo: true, branch: 'main' }

describe('bootstrapEnvironmentInput', () => {
    it('ambiente da central: servidor/servidor, porta, saúde, sem limites e as variáveis do .env', () => {
        const input = bootstrapEnvironmentInput({ repoName: 'Meu_App', centralId: 'c1', result }, 'MONGODB_URI=mongodb://x\n# comentário\nPORT=4014\nPORT=4015\n')
        expect(input).toMatchObject({ name: 'Meu_App', slug: 'meu-app', buildOn: 'server', runOn: 'server', ports: [4014], healthUrl: 'http://localhost:4014/api/health', limits: null })
        expect(input.source).toMatchObject({ kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml' })
        expect(input.env).toEqual([{ key: 'MONGODB_URI', value: 'mongodb://x' }, { key: 'PORT', value: '4015' }])
        expect(environmentCreateSchema.safeParse(input).success).toBe(true)
    })

    it('sem servidor, a saúde é a página de entrada', () => {
        expect(bootstrapEnvironmentInput({ repoName: 'site', centralId: 'c1', result: { ...result, hasServer: false } }, '').healthUrl).toBe('http://localhost:4014/')
    })
})

describe('bootstrapCentralConfig', () => {
    it('branch do push como base e destino; backup só com MongoDB', () => {
        const config = bootstrapCentralConfig(defaultCentralConfig('/home/u/code/app'), { ...result, branch: 'develop', usesMongo: false })
        expect(config.git).toMatchObject({ baseBranch: 'develop', prTargetBranch: 'develop' })
        expect(config.environment.backupDatabase).toBe(false)
        expect(bootstrapCentralConfig(defaultCentralConfig('/x'), result).environment.backupDatabase).toBe(true)
    })
})

describe('prompts', () => {
    it('modo existente: usa o repositório, pergunta antes de alterar e trabalha na branch padrão', () => {
        const text = buildBootstrapInstructions({ repo: 'org/app', owner: 'org', name: 'app', visibility: 'private', mode: 'existing', branch: 'develop', directory: '/d', context: 'Loja virtual em Rust', technologies: [{ name: 'Rust', group: 'Linguagem' }], skills: ['bootstrap-docker'], instructions: '' })
        // Contexto e tecnologias nas instruções duráveis (valem em toda tentativa).
        expect(text).toContain('Loja virtual em Rust')
        expect(text).toContain('- Rust (Linguagem)')
        expect(text).toContain('JÁ EXISTE')
        expect(text).toContain('PERGUNTE antes de alterar')
        expect(text).toContain('`develop`')
        expect(text).toContain('`bootstrap-docker`')
        expect(text).toContain('bootstrap-result')
    })

    it('deploy com falha leva o erro e o fim do log', () => {
        const prompt = buildDeployFailedPrompt({ attempt: 3, error: 'Saúde não respondeu', log: 'linha 1\nERRO final' })
        expect(prompt).toContain('tentativa 2')
        expect(prompt).toContain('Saúde não respondeu')
        expect(prompt).toContain('ERRO final')
        expect(tailLog('a\n'.repeat(10), 6)).not.toMatch(/^\n/)
    })
})

describe('freeEnvironmentSlug', () => {
    it('usa o slug do repositório quando livre e o próximo -N quando ocupado, até 40 caracteres', () => {
        expect(freeEnvironmentSlug('app', new Set())).toBe('app')
        expect(freeEnvironmentSlug('app', new Set(['app', 'app-2']))).toBe('app-3')
        const long = 'a'.repeat(40)
        expect(freeEnvironmentSlug(long, new Set([long]))).toBe(`${'a'.repeat(38)}-2`)
    })
})

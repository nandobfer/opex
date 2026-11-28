import { describe, expect, it } from 'vitest'
import { isValidRepoName, isValidRepoOwner, parseRepoInput, repoFromRemote, slugFromRepoName } from '@/features/project-bootstrap/repo-name'

describe('parseRepoInput', () => {
    it('separa owner/nome e aceita só o nome (owner vazio = conta pessoal)', () => {
        expect(parseRepoInput('nandobfer/blablabla')).toEqual({ owner: 'nandobfer', name: 'blablabla' })
        expect(parseRepoInput('  blablabla ')).toEqual({ owner: null, name: 'blablabla' })
    })

    it('aceita a URL do GitHub e troca espaços por hífen', () => {
        expect(parseRepoInput('https://github.com/org/meu repo.git')).toEqual({ owner: 'org', name: 'meu-repo' })
    })
})

describe('regras de nome do GitHub', () => {
    it('valida o nome do repositório', () => {
        expect(isValidRepoName('meu-projeto.v2_ok')).toBe(true)
        expect(isValidRepoName('meu projeto')).toBe(false)
        expect(isValidRepoName('..')).toBe(false)
        expect(isValidRepoName('repo.git')).toBe(false)
        expect(isValidRepoName('a'.repeat(101))).toBe(false)
    })

    it('valida o dono', () => {
        expect(isValidRepoOwner('nandobfer')).toBe(true)
        expect(isValidRepoOwner('minha-org')).toBe(true)
        expect(isValidRepoOwner('-org')).toBe(false)
        expect(isValidRepoOwner('org--x')).toBe(false)
    })
})

describe('repoFromRemote e slug', () => {
    it('lê o remoto https e ssh em minúsculas', () => {
        expect(repoFromRemote('https://github.com/Org/Repo.git')).toBe('org/repo')
        expect(repoFromRemote('git@github.com:org/repo.git')).toBe('org/repo')
        expect(repoFromRemote('')).toBeNull()
    })

    it('gera o slug do ambiente a partir do nome', () => {
        expect(slugFromRepoName('Meu_Projeto.API')).toBe('meu-projeto-api')
        expect(slugFromRepoName('x')).toBe('x-app')
    })
})

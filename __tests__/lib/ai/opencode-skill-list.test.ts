import { describe, expect, it, vi } from 'vitest'
import { listOpencodeSkillsAt, SKILL_LIST_MAX_ATTEMPTS, SKILL_LIST_STABLE_READS } from '@/lib/ai/opencode-skill-list'
import type { OpencodeSkillRaw } from '@/lib/ai/opencode-skills'

/**
 * Listagem das skills de um diretório do OpenCode (OPE-158): diretório recém-aberto responde primeiro
 * sem skills, depois só as nativas e só então a lista completa. Cliente simulado, espera sem timer.
 */

const native: OpencodeSkillRaw = { id: 'opencode', name: 'OpenCode', path: '/builtin/opencode.md', content: '# OpenCode' }
const report: OpencodeSkillRaw = { id: 'report', name: 'Report', path: '/builtin/report.md', content: '# Report' }
const refinar: OpencodeSkillRaw = { id: 'refinar-issue', name: 'refinar-issue', path: '/home/u/.agents/skills/refinar-issue/SKILL.md', content: '# Refinar' }

function lister(...reads: (OpencodeSkillRaw[] | Error)[]) {
    let index = 0
    const list = vi.fn(async ({ location }: { location: { directory: string } }) => {
        const read = reads[Math.min(index++, reads.length - 1)]
        if (read instanceof Error) throw read
        return { location: { directory: location.directory }, data: read }
    })
    return { client: { skill: { list } }, list }
}

const wait = vi.fn(async () => undefined)

describe('listOpencodeSkillsAt', () => {
    it('diretório frio: repete até a skill procurada aparecer e para assim que ela aparece', async () => {
        const { client, list } = lister([], [native, report], [native, report, refinar], [native, report, refinar])
        const result = await listOpencodeSkillsAt(client, '/home/u/code/app', { want: ['refinar-issue'], wait })
        expect(result.skills.map((skill) => skill.id)).toEqual(['opencode', 'report', 'refinar-issue'])
        expect(result).toMatchObject({ directory: '/home/u/code/app', attempts: 3 })
        expect(list).toHaveBeenCalledTimes(3)
        expect(list).toHaveBeenCalledWith({ location: { directory: '/home/u/code/app' } })
    })

    it('diretório já carregado: uma leitura só', async () => {
        const { client, list } = lister([native, refinar])
        await listOpencodeSkillsAt(client, '/d', { want: ['refinar-issue'], wait })
        expect(list).toHaveBeenCalledTimes(1)
    })

    it('casa a procurada por nome normalizado', async () => {
        const { client, list } = lister([{ ...refinar, id: 'user/refinar-issue', name: 'Refinar-Issue' }])
        await listOpencodeSkillsAt(client, '/d', { want: ['refinar-issue'], wait })
        expect(list).toHaveBeenCalledTimes(1)
    })

    it('skill ausente de verdade: para quando a lista se repete, sem esperar o limite', async () => {
        const { client, list } = lister([], [native, report])
        const result = await listOpencodeSkillsAt(client, '/d', { want: ['sumiu'], wait })
        expect(list).toHaveBeenCalledTimes(1 + SKILL_LIST_STABLE_READS)
        expect(result.skills.map((skill) => skill.id)).toEqual(['opencode', 'report'])
    })

    it('lista sempre vazia: desiste no limite e devolve a lista vazia', async () => {
        const { client, list } = lister([])
        const result = await listOpencodeSkillsAt(client, '/d', { want: ['refinar-issue'], wait })
        expect(list).toHaveBeenCalledTimes(SKILL_LIST_MAX_ATTEMPTS)
        expect(result.skills).toEqual([])
    })

    it('sem skill procurada: uma leitura só', async () => {
        const { client, list } = lister([])
        await listOpencodeSkillsAt(client, '/d', { wait })
        expect(list).toHaveBeenCalledTimes(1)
    })

    it('erro de rede continua sendo erro', async () => {
        const { client } = lister(new Error('ECONNREFUSED'))
        await expect(listOpencodeSkillsAt(client, '/d', { want: ['refinar-issue'], wait })).rejects.toThrow('ECONNREFUSED')
    })
})

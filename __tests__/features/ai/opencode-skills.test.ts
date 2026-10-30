import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock('@/lib/ai/catalog', () => ({ listAiSkills: mocks.list }))

import { AiProviderError } from '@/lib/ai/errors'
import { toOpencodeSkill } from '@/lib/ai/opencode-skills'
import { GET } from '@/app/api/ai/skills/route'

const call = (query = '') => GET(new NextRequest(`http://localhost/api/ai/skills${query}`), { params: Promise.resolve({}) })

beforeEach(() => vi.clearAllMocks())

describe('skills do OpenCode', () => {
    it('converte a skill sem expor o conteúdo e marca a vazia', () => {
        const skill = toOpencodeSkill({ id: 'grill-me', name: 'Grill me', description: ' Interroga ', path: '/s/SKILL.md', content: '# Conteúdo secreto' })
        expect(skill).toEqual({ id: 'grill-me', name: 'Grill me', description: 'Interroga', path: '/s/SKILL.md', empty: false })
        expect(JSON.stringify(skill)).not.toContain('Conteúdo secreto')
        expect(toOpencodeSkill({ id: 'x', content: '   ' })).toEqual({ id: 'x', name: 'x', description: null, path: '', empty: true })
    })

    it('GET /api/ai/skills lista as skills e repassa o refresh', async () => {
        mocks.list.mockResolvedValue([{ id: 'grill-me', name: 'grill-me', description: null, path: '', empty: false }])
        const res = await call('?refresh=1')
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ success: true, data: [{ id: 'grill-me' }] })
        expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ fresh: true }))
    })

    it('OpenCode fora do ar responde 502 com a mensagem acionável', async () => {
        mocks.list.mockRejectedValue(new AiProviderError('Não foi possível conectar ao OpenCode'))
        const res = await call()
        expect(res.status).toBe(502)
        expect(await res.json()).toMatchObject({ success: false, error: 'Não foi possível conectar ao OpenCode' })
    })
})

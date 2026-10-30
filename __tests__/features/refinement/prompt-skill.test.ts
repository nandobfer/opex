import { describe, expect, it } from 'vitest'
import { buildRefinementInstructions, planRefinementInstructions } from '@/features/refinement/prompt'

const grill = { id: 'grill-me', name: 'grill-me', description: null, path: '/s/SKILL.md', empty: false }

describe('origem das instruções do refinamento', () => {
    it('origem texto usa o texto configurado + protocolo', () => {
        const plan = planRefinementInstructions({ instructionsSource: 'text', skill: 'grill-me' }, [grill])
        expect(plan).toEqual({ mode: 'text', fallback: null })
        const text = buildRefinementInstructions({ instructions: 'Regras.' }, plan)
        expect(text.startsWith('Regras.')).toBe(true)
        expect(text).toContain('Protocolo do refinamento')
    })

    it('skill instalada: entrada durável sem o texto, com o protocolo', () => {
        const plan = planRefinementInstructions({ instructionsSource: 'skill', skill: 'grill-me' }, [grill])
        expect(plan).toEqual({ mode: 'skill', skill: grill })
        const text = buildRefinementInstructions({ instructions: 'Regras.' }, plan)
        expect(text).not.toContain('Regras.')
        expect(text).toContain('Protocolo do refinamento')
    })

    it('skill ausente, vazia ou OpenCode indisponível caem no texto com motivo', () => {
        expect(planRefinementInstructions({ instructionsSource: 'skill', skill: 'sumiu' }, [grill])).toMatchObject({ mode: 'text', fallback: expect.stringContaining('sumiu') })
        expect(planRefinementInstructions({ instructionsSource: 'skill', skill: 'grill-me' }, [{ ...grill, empty: true }])).toMatchObject({ mode: 'text', fallback: expect.stringContaining('vazia') })
        expect(planRefinementInstructions({ instructionsSource: 'skill', skill: 'grill-me' }, null)).toMatchObject({ mode: 'text', fallback: expect.stringContaining('Não foi possível consultar') })
    })
})

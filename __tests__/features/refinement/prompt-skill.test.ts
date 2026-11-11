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

    describe('casamento da skill salva com a lista do OpenCode (OPE-158)', () => {
        const qualified = { ...grill, id: 'user/refinar-issue', name: 'Refinar Issue' }
        it('casa pelo name quando o id é diferente e ativa pelo id do OpenCode', () => {
            const skill = { ...grill, id: 'skill_123', name: 'refinar-issue' }
            expect(planRefinementInstructions({ instructionsSource: 'skill', skill: 'refinar-issue' }, [grill, skill])).toEqual({ mode: 'skill', skill })
        })
        it('casa id qualificado e diferenças de maiúsculas e espaços', () => {
            expect(planRefinementInstructions({ instructionsSource: 'skill', skill: 'refinar-issue' }, [qualified])).toEqual({ mode: 'skill', skill: qualified })
            expect(planRefinementInstructions({ instructionsSource: 'skill', skill: ' Refinar-Issue ' }, [qualified])).toEqual({ mode: 'skill', skill: qualified })
        })
        it('id exato vence o casamento normalizado', () => {
            const exact = { ...grill, id: 'refinar-issue', name: 'refinar-issue' }
            expect(planRefinementInstructions({ instructionsSource: 'skill', skill: 'refinar-issue' }, [qualified, exact])).toEqual({ mode: 'skill', skill: exact })
        })
        it('casamento normalizado ambíguo não casa nada', () => {
            const other = { ...grill, id: 'team:refinar-issue', name: 'Refinar issue (time)' }
            expect(planRefinementInstructions({ instructionsSource: 'skill', skill: 'refinar-issue' }, [qualified, other])).toMatchObject({ mode: 'text' })
        })
        it('com o diretório da sessão, o motivo cita o diretório e as skills encontradas', () => {
            const plan = planRefinementInstructions({ instructionsSource: 'skill', skill: 'refinar-issue' }, [grill], { directory: '/home/burgos/code/dndicas' })
            expect(plan).toMatchObject({ mode: 'text' })
            const fallback = (plan as { fallback: string }).fallback
            expect(fallback).toContain('/home/burgos/code/dndicas')
            expect(fallback).toContain('Skills encontradas: grill-me')
            expect(planRefinementInstructions({ instructionsSource: 'skill', skill: 'refinar-issue' }, [], { directory: '/d' })).toMatchObject({ fallback: expect.stringContaining('Nenhuma skill encontrada') })
        })
        it('sem o diretório (aba e salvar), o motivo continua o de "não está instalada"', () => {
            expect(planRefinementInstructions({ instructionsSource: 'skill', skill: 'sumiu' }, [grill])).toMatchObject({ fallback: expect.stringContaining('não está instalada no OpenCode') })
        })
    })
})

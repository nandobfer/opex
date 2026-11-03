import { describe, expect, it } from 'vitest'
import { MEMORY_FOCUS_MAX, buildMemoryFocus, composeFocus, redactFocusText } from '@/features/ai/memory-focus'

/** OPE-117: foco do contexto por consumidor (ordem das partes, segredos fora antes do corte, limite do contrato). */

describe('foco do contexto das memórias', () => {
  it('Opex/Maddox/portal/Arquiteto: o pedido do turno, com os espaços juntados', () => {
    expect(buildMemoryFocus('opex', { kind: 'message', text: '  como   rodo\n os testes?  ' })).toBe('como rodo os testes?')
    expect(buildMemoryFocus('maddox', { kind: 'message', text: 'Pedido do cliente' })).toBe('Pedido do cliente')
  })

  it('vazio ou só espaços vira "sem foco"', () => {
    expect(buildMemoryFocus('opex', { kind: 'message', text: '   ' })).toBeUndefined()
    expect(buildMemoryFocus('opex', { kind: 'message', text: null })).toBeUndefined()
    expect(composeFocus([])).toBeUndefined()
  })

  it('desenvolvedor: título e etapa/mesa primeiro, descrição no restante', () => {
    const focus = buildMemoryFocus('desenvolvedor', { kind: 'task', code: 'OPE-1', title: 'Login', stage: 'Implementação', workbench: 'opex', description: 'Descrição longa' })!
    expect(focus.indexOf('OPE-1 Login')).toBe(0)
    expect(focus.indexOf('Etapa: Implementação')).toBeLessThan(focus.indexOf('Descrição longa'))
  })

  it('desenvolvedor com descrição enorme: o corte cai na descrição, nunca no título', () => {
    const focus = buildMemoryFocus('desenvolvedor', { kind: 'task', code: 'OPE-2', title: 'Título', stage: 'Plano', description: 'x'.repeat(5000) })!
    expect(focus.length).toBe(MEMORY_FOCUS_MAX)
    expect(focus.startsWith('OPE-2 Título Etapa: Plano')).toBe(true)
  })

  it('Adversário: tarefa, veredito e diff, nessa ordem', () => {
    const focus = buildMemoryFocus('adversario', { kind: 'review', task: 'OPE-3 Tarefa', verdict: 'alto: erro', diff: 'diff --git a b' })!
    expect(focus.indexOf('OPE-3')).toBeLessThan(focus.indexOf('alto: erro'))
    expect(focus.indexOf('alto: erro')).toBeLessThan(focus.indexOf('diff --git'))
  })

  it('remove segredos antes do corte (token do Engramind, Bearer, chaves e KEY=valor)', () => {
    const text = 'use eng.tk_abc123.s3gr3d0 e Bearer abcdefghijklmnop e sk-ABCDEFGHIJKLMNOP1234 e ghp_' + 'a'.repeat(30) + ' com API_KEY=valor-secreto'
    const clean = redactFocusText(text)
    expect(clean).not.toContain('s3gr3d0')
    expect(clean).not.toContain('abcdefghijklmnop')
    expect(clean).not.toContain('sk-ABCDEFGHIJKLMNOP1234')
    expect(clean).not.toContain('ghp_aaaa')
    expect(clean).not.toContain('valor-secreto')
    expect(clean).toContain('API_KEY=[segredo]')
  })

  it('segredo no fim de um texto longo também sai (a remoção vem antes do corte)', () => {
    const focus = composeFocus(['a'.repeat(1990) + ' eng.tk_x1.segredoquecortaria'])!
    expect(focus).not.toContain('segredoquecortaria')
    expect(focus.length).toBeLessThanOrEqual(MEMORY_FOCUS_MAX)
  })
})

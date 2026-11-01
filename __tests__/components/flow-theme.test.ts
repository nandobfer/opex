import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FLOW_SURFACE_CLASS, FLOW_THEME_STYLE } from '@/components/flow/flow-theme'
import { NETWORK_CANVAS_CLASS, NETWORK_FLOW_THEME } from '@/features/engramind/components/network/layout-classes'
import { ARCHITECT_CANVAS_CLASS } from '@/features/architect-agent/components/workbench/ArchitectStates'

/**
 * Tema compartilhado dos canvas React Flow: o fundo das páginas com o brilho violeta (nunca o cinza
 * neutro do `colorMode="dark"`), o mesmo na rede do Engramind e nos diagramas do Agente Arquiteto.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('tema dos canvas React Flow', () => {
  it('a superfície é o fundo do app com o brilho da primária', () => {
    expect(FLOW_SURFACE_CLASS).toContain('bg-background')
    expect(FLOW_SURFACE_CLASS).toContain('hsl(var(--primary)/0.08)')
    expect(FLOW_SURFACE_CLASS).not.toMatch(/bg-muted|bg-card\b/)
  })

  it('o React Flow, o minimapa e os controles ficam por tokens, sem cor fixa', () => {
    const values = Object.values(FLOW_THEME_STYLE as Record<string, string>)
    expect((FLOW_THEME_STYLE as Record<string, string>)['--xy-background-color']).toBe('transparent')
    expect(values.every((value) => value === 'transparent' || value === '0' || value === 'none' || value.startsWith('hsl(var(--'))).toBe(true)
    expect(Object.keys(FLOW_THEME_STYLE)).toEqual(expect.arrayContaining(['--xy-minimap-background-color', '--xy-controls-button-background-color']))
  })

  it('a rede do Engramind e o diagrama do arquiteto (e o skeleton dele) usam o mesmo tema', () => {
    expect(NETWORK_FLOW_THEME).toBe(FLOW_THEME_STYLE)
    expect(NETWORK_CANVAS_CLASS.startsWith(FLOW_SURFACE_CLASS)).toBe(true)
    expect(ARCHITECT_CANVAS_CLASS.startsWith(FLOW_SURFACE_CLASS)).toBe(true)
    const canvas = read('src/features/architect-agent/components/workbench/ArchitectCanvas.tsx')
    expect(canvas).toContain('style={FLOW_THEME_STYLE}')
    expect(canvas).toContain('<Background {...FLOW_BACKGROUND_PROPS} />')
  })

  it('o CSS global não tem mais a regra do arquiteto (a folha do React Flow vencia e pintava de cinza)', () => {
    expect(read('src/app/globals.css')).not.toContain('architect-flow')
  })
})

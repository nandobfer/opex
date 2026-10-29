import { describe, expect, it } from 'vitest'
import { inheritsGlobalPorts, keepValidPort, parseCentralConfig, resolveCentralPorts } from '@/features/agentic/logic'
import { agenticPortsSchema, agenticSettingsSchema, centralConfigSchema, DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig, withDefaultAgents } from '@/features/agentic/schemas'

const global = { previewPortMin: 6000, previewPortMax: 6100 }

describe('faixa de portas padrão herdada pelas centrais', () => {
  it('o padrão global é 5002–5998', () => {
    expect(DEFAULT_AGENTIC_SETTINGS.ports).toEqual({ previewPortMin: 5002, previewPortMax: 5998 })
  })

  it('central nova herda a faixa padrão global', () => {
    const config = defaultCentralConfig('/repo')
    expect(config.environment.inheritPorts).toBe(true)
    expect(inheritsGlobalPorts(config.environment)).toBe(true)
    expect(resolveCentralPorts(global, config.environment)).toEqual({ min: 6000, max: 6100 })
  })

  it('central personalizada usa a própria faixa, e mudar o padrão não a altera', () => {
    const env = { ...defaultCentralConfig('/repo').environment, inheritPorts: false, previewPortMin: 7000, previewPortMax: 7010 }
    expect(inheritsGlobalPorts(env)).toBe(false)
    expect(resolveCentralPorts(global, env)).toEqual({ min: 7000, max: 7010 })
    expect(resolveCentralPorts({ previewPortMin: 8000, previewPortMax: 8100 }, env)).toEqual({ min: 7000, max: 7010 })
  })

  it('herdando sem a configuração geral carregada, usa a faixa padrão', () => {
    expect(resolveCentralPorts(undefined, defaultCentralConfig('/repo').environment)).toEqual({ min: 5002, max: 5998 })
  })

  it('central salva antes do padrão global fica personalizada com a faixa que já tinha', () => {
    const parsed = parseCentralConfig({ sessionDirectory: '/repo', environment: { portEnvVar: 'PORT', previewPortMin: 4001, previewPortMax: 4098 } })
    expect(parsed.environment).toMatchObject({ inheritPorts: false, previewPortMin: 4001, previewPortMax: 4098 })
    expect(resolveCentralPorts(global, parsed.environment)).toEqual({ min: 4001, max: 4098 })
  })

  it('central salva sem faixa própria mantém a faixa antiga 4001–4098', () => {
    const parsed = parseCentralConfig({ sessionDirectory: '/repo', environment: { portEnvVar: 'PORT' } })
    expect(parsed.environment).toMatchObject({ inheritPorts: false, previewPortMin: 4001, previewPortMax: 4098 })
  })

  it('central salva como herdada continua herdando', () => {
    const saved = defaultCentralConfig('/repo')
    expect(parseCentralConfig(saved).environment.inheritPorts).toBe(true)
  })

  it('configuração geral salva antes das portas recebe a faixa padrão', () => {
    const parsed = agenticSettingsSchema.parse(withDefaultAgents({ enabled: true, agents: DEFAULT_AGENTIC_SETTINGS.agents }))
    expect(parsed.ports).toEqual({ previewPortMin: 5002, previewPortMax: 5998 })
  })

  it('a faixa padrão recusa porta inicial maior que a final e portas fora de 1024–65535', () => {
    const inverted = agenticPortsSchema.safeParse({ previewPortMin: 6000, previewPortMax: 5000 })
    expect(inverted.success).toBe(false)
    expect(inverted.error?.issues[0]).toMatchObject({ path: ['previewPortMax'], message: 'A porta final deve ser maior ou igual à inicial' })
    expect(agenticPortsSchema.safeParse({ previewPortMin: 80, previewPortMax: 5000 }).success).toBe(false)
    expect(agenticPortsSchema.safeParse({ previewPortMin: 5002, previewPortMax: 70000 }).success).toBe(false)
  })

  it('herdando, a faixa própria invertida não bloqueia a central; personalizada, bloqueia', () => {
    const base = defaultCentralConfig('/repo')
    const inverted = { previewPortMin: 9000, previewPortMax: 5998 }
    expect(centralConfigSchema.safeParse({ ...base, environment: { ...base.environment, ...inverted, inheritPorts: true } }).success).toBe(true)
    expect(centralConfigSchema.safeParse({ ...base, environment: { ...base.environment, ...inverted, inheritPorts: false } }).success).toBe(false)
  })

  it('ao voltar a herdar, porta própria inválida volta à salva (ou ao padrão)', () => {
    expect(keepValidPort(7000, 6000, 5002)).toBe(7000)
    expect(keepValidPort(Number.NaN, 6000, 5002)).toBe(6000)
    expect(keepValidPort(80, undefined, 5002)).toBe(5002)
    expect(keepValidPort(70000, Number.NaN, 5998)).toBe(5998)
  })

  it('a central exige informar se herda a faixa', () => {
    const environment: Record<string, unknown> = { ...defaultCentralConfig('/repo').environment }
    delete environment.inheritPorts
    expect(centralConfigSchema.safeParse({ ...defaultCentralConfig('/repo'), environment }).success).toBe(false)
  })
})

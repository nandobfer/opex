import { describe, expect, it } from 'vitest'
import { checkDockerBuilder, dockerBuilderOptions, parseBuildxLs } from '@/features/agentic/docker-builders'

const line = (value: object) => JSON.stringify(value)
const limit = line({ Name: 'limit-builder', Driver: 'docker-container', Current: true, Nodes: [{ Status: 'running', DriverOpts: { 'default-load': 'true' } }] })
const plain = line({ Name: 'default', Driver: 'docker', Current: false, Nodes: [{ Status: 'running' }] })
const noLoad = line({ Name: 'remote', Driver: 'docker-container', Current: false, Nodes: [{ Status: 'inactive', DriverOpts: {} }] })
const output = [limit, limit, 'WARNING: algo', '{quebrado', plain, plain, noLoad].join('\n')

describe('parseBuildxLs', () => {
  it('lista os builders sem repetir, ignora linhas inválidas e marca o padrão do host', () => {
    const parsed = parseBuildxLs(output)
    expect(parsed.builders.map((builder) => builder.name)).toEqual(['limit-builder', 'default', 'remote'])
    expect(parsed.current).toBe('limit-builder')
    expect(parsed.builders.map((builder) => builder.loadsImages)).toEqual([true, true, false])
    expect(parsed.builders[2].status).toBe('inactive')
  })

  it('saída vazia não tem builders nem padrão', () => {
    expect(parseBuildxLs('')).toEqual({ builders: [], current: null })
  })
})

describe('dockerBuilderOptions', () => {
  it('começa pelo padrão do host (valor vazio) com o builder atual', () => {
    const options = dockerBuilderOptions(parseBuildxLs(output), '')
    expect(options[0]).toEqual({ value: '', label: 'Padrão do host', description: 'hoje: limit-builder' })
    expect(options.map((option) => option.value)).toEqual(['', 'limit-builder', 'default', 'remote'])
  })

  it('builder salvo que sumiu do host continua na lista, marcado', () => {
    const options = dockerBuilderOptions(parseBuildxLs(output), 'antigo')
    expect(options.at(-1)).toEqual({ value: 'antigo', label: 'antigo', description: 'não encontrado no host' })
  })

  it('sem a lista do host (erro), o valor salvo ainda aparece', () => {
    expect(dockerBuilderOptions(undefined, 'antigo').map((option) => option.value)).toEqual(['', 'antigo'])
  })
})

describe('checkDockerBuilder', () => {
  const ok = { exitCode: 0, output }
  it('vazio usa o padrão do host', () => {
    expect(checkDockerBuilder('', ok)).toMatchObject({ status: 'ok', detail: 'padrão do host (limit-builder)' })
  })
  it('builder inexistente é erro; sem carregar imagens é aviso', () => {
    expect(checkDockerBuilder('nao-existe', ok).status).toBe('error')
    expect(checkDockerBuilder('remote', ok).status).toBe('warn')
    expect(checkDockerBuilder('default', ok).status).toBe('ok')
  })
  it('buildx indisponível é erro só quando há builder configurado', () => {
    const failed = { exitCode: 1, output: 'unknown flag: --format' }
    expect(checkDockerBuilder('limit-builder', failed)).toMatchObject({ status: 'error', detail: 'docker buildx indisponível (unknown flag: --format)' })
    expect(checkDockerBuilder('', failed).status).toBe('warn')
  })
})

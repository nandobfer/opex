import { describe, expect, it } from 'vitest'
import { deployPreview, dirtySections, editorStatus, errorSections, firstErrorSection, maskComposeOverrides } from '@/features/environments/editor-sections'
import { EMPTY_SERVICE_VALUES } from '@/features/environments/service-overrides'
import { serviceListItems, setOverrideField } from '@/features/environments/services-form'
import type { ComposeServicesDto } from '@/features/environments/types'

/** Página Novo/Editar ambiente (OPE-211): seções alteradas e com erro, status e a prévia do deploy. */

const read: ComposeServicesDto = {
  services: [
    { name: 'app', hasBuild: true, declared: { memoryGb: null, swapGb: null, cpus: null }, limitStyle: { memory: 'deploy', cpus: 'deploy' }, values: { ...EMPTY_SERVICE_VALUES }, unreadable: { ports: [], volumes: [] } },
    { name: 'db', hasBuild: false, declared: { memoryGb: null, swapGb: null, cpus: null }, limitStyle: { memory: 'service', cpus: 'service' }, values: { ...EMPTY_SERVICE_VALUES, image: 'mongo:7' }, unreadable: { ports: [], volumes: [] } },
  ],
}

describe('seções', () => {
  it('alteradas e com erro na ordem da página, a partir de dirtyFields e errors do react-hook-form', () => {
    expect(dirtySections({ composeOverrides: { services: [{ image: true }] }, name: true, ports: [false, true] })).toEqual(['identidade', 'execucao', 'servicos'])
    expect(dirtySections({ env: [{ key: false }] })).toEqual([])
    const errors = { limits: { memoryGb: { type: 'custom', message: 'x' } }, source: { centralId: { message: 'Escolha a central' } } }
    expect(errorSections(errors)).toEqual(['origem', 'recursos'])
    expect(firstErrorSection(errors)).toBe('origem')
    expect(firstErrorSection({})).toBeNull()
  })

  it('status: erros primeiro, depois as alterações; sem nada, "Tudo salvo"', () => {
    expect(editorStatus({ dirty: ['origem', 'servicos'], errors: [], creating: false })).toEqual({ kind: 'dirty', text: 'Alterações não salvas em Origem e Serviços do compose' })
    expect(editorStatus({ dirty: ['origem'], errors: ['recursos'], creating: false })).toMatchObject({ kind: 'error', text: 'Erro em Recursos', section: 'recursos' })
    expect(editorStatus({ dirty: [], errors: ['origem', 'recursos'], creating: false })).toMatchObject({ text: '2 seções com erro', section: 'origem' })
    expect(editorStatus({ dirty: [], errors: [], creating: false })).toEqual({ kind: 'saved' })
    expect(editorStatus({ dirty: [], errors: [], creating: true }).kind).toBe('dirty')
  })
})

describe('prévia do deploy', () => {
  const overrides = setOverrideField({ services: [], yaml: '' }, 'app', 'environment', [{ key: 'SENHA', value: 'segredo-real' }])

  it('esconde os valores do environment e mostra o env_file só com variáveis', () => {
    expect(maskComposeOverrides(overrides).services[0]!.environment).toEqual([{ key: 'SENHA', value: '[valor oculto]' }])
    const yaml = deployPreview({ read, slug: 'loja', buildOn: 'server', runOn: 'server', hasVars: false, limits: { mode: 'shared', memoryGb: null, swapGb: null, cpus: null }, overrides, selected: [] })
    expect(yaml).toContain('SENHA: "[valor oculto]"')
    expect(yaml).not.toContain('segredo-real')
    expect(yaml).not.toContain('env_file')
    expect(deployPreview({ read, slug: 'loja', buildOn: 'server', runOn: 'server', hasVars: true, limits: { mode: 'shared', memoryGb: null, swapGb: null, cpus: null }, overrides: null, selected: [] })).toContain('env_file')
  })

  it('máquinas diferentes: imagem do registry com marcadores; só os serviços escolhidos; limites na forma do compose', () => {
    const yaml = deployPreview({ read, slug: 'loja', buildOn: 'pc', runOn: 'server', hasVars: false, limits: { mode: 'service', services: [{ service: 'db', memoryGb: 1, swapGb: null, cpus: null }] }, overrides: null, selected: ['db'] })
    expect(yaml).not.toContain('"app"')
    expect(yaml).toContain('mem_limit')
    const cross = deployPreview({ read, slug: 'loja', buildOn: 'pc', runOn: 'server', hasVars: false, limits: { mode: 'shared', memoryGb: null, swapGb: null, cpus: null }, overrides: null, selected: [] })
    expect(cross).toContain('localhost:<porta>/opex-env/loja-app:<commit>')
  })
})

describe('lista de serviços', () => {
  it('os do compose, os ajustados fora do compose (órfãos) e os fora do ambiente', () => {
    const overrides = setOverrideField(setOverrideField({ services: [], yaml: '' }, 'app', 'image', 'nginx:1.27'), 'antigo', 'restart', 'always')
    const items = serviceListItems({ read: read.services, overrides, limitServices: [], selected: ['app'], running: [] })
    expect(items.map((item) => [item.name, item.ownImage, item.customized, item.outside, item.orphan])).toEqual([
      ['app', true, 1, false, false],
      ['db', false, 0, true, false],
      ['antigo', false, 1, true, true],
    ])
    // Sem leitura: os do host e os ajustados, sem marcar órfão.
    expect(serviceListItems({ read: null, overrides, limitServices: [], selected: [], running: ['web'] }).map((item) => [item.name, item.orphan, item.compose])).toEqual([
      ['app', false, undefined],
      ['antigo', false, undefined],
      ['web', false, undefined],
    ])
  })

  it('o serviço sai dos ajustes quando nenhum campo fica personalizado', () => {
    const one = setOverrideField({ services: [], yaml: '' }, 'app', 'restart', 'always')
    expect(one.services).toHaveLength(1)
    expect(setOverrideField(one, 'app', 'restart', null).services).toEqual([])
  })
})

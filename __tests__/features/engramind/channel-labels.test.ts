import { describe, expect, it } from 'vitest'
import { CENTRAL_CHANNEL_PREFIX, centralChannelLabels, channelDisplayHint, channelDisplayName } from '@/features/engramind/network/channel-labels'

/** OPE-113: nome legível do canal numa linha (helper único para chips, legendas, trilha e filtros). */

const labels = centralChannelLabels([
  { id: 'c1', sigla: 'OPE', projectName: 'Opex', repo: 'nandobfer/opex' },
  { id: 'c2', sigla: '', projectName: 'Produto', repo: null },
])

describe('channelDisplayName', () => {
  it('canal de central: a sigla no lugar do id, com o prefixo', () => {
    expect(channelDisplayName(`${CENTRAL_CHANNEL_PREFIX}c1`, labels)).toBe(`${CENTRAL_CHANNEL_PREFIX}OPE`)
  })

  it('central sem sigla usa o nome do produto; central desconhecida e canal comum ficam como estão', () => {
    expect(channelDisplayName(`${CENTRAL_CHANNEL_PREFIX}c2`, labels)).toBe(`${CENTRAL_CHANNEL_PREFIX}Produto`)
    expect(channelDisplayName(`${CENTRAL_CHANNEL_PREFIX}zzz`, labels)).toBe(`${CENTRAL_CHANNEL_PREFIX}zzz`)
    expect(channelDisplayName('agentes/opex/global', labels)).toBe('agentes/opex/global')
    expect(channelDisplayName('opex')).toBe('opex')
  })

  it('a dica traz o repositório e o slug inteiro; sem rótulo, o slug', () => {
    expect(channelDisplayHint(`${CENTRAL_CHANNEL_PREFIX}c1`, labels)).toBe(`Opex · nandobfer/opex · ${CENTRAL_CHANNEL_PREFIX}c1`)
    expect(channelDisplayHint('opex', labels)).toBe('opex')
  })
})

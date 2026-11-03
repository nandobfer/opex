import { describe, expect, it } from 'vitest'
import { appChannels, appLinkEdgeId, appLinks, appOfAgent, appReach, channelsWithMemories } from '@/features/engramind/network/app-network'
import type { NetworkLink } from '@/features/engramind/network/types'

/** OPE-129: visão inicial Apps x canais (agregação por app) e canais vazios fora das redes. */

const link = (agent: string, channel: string, mode: NetworkLink['mode'] = 'inject'): NetworkLink => ({ id: `${agent}:${channel}:${mode}`, agent, channel, mode })

describe('channelsWithMemories (decisão aprovada: canal sem nenhuma memória fica fora das redes)', () => {
  const channels = [{ slug: 'vazio' }, { slug: 'b' }, { slug: 'so-inativas' }, { slug: 'a' }]

  it('tira o canal sem memórias e mantém a ordem dos demais', () => {
    const memories = [{ channel: 'a', status: 'active' }, { channel: 'b', status: 'permanent' }, { channel: 'so-inativas', status: 'archived' }]
    expect(channelsWithMemories(channels, memories).map((channel) => channel.slug)).toEqual(['b', 'so-inativas', 'a'])
  })

  it('canal só com memórias inativas continua (inativas contam)', () => {
    expect(channelsWithMemories(channels, [{ channel: 'so-inativas', status: 'archived' }]).map((channel) => channel.slug)).toEqual(['so-inativas'])
  })

  it('sem memórias, nenhum canal', () => {
    expect(channelsWithMemories(channels, [])).toEqual([])
  })
})

describe('agregação por app', () => {
  it('dois agentes do mesmo app no mesmo canal viram um link, com os agentes e os modos sem repetir', () => {
    const result = appLinks([link('opex/opex', 'c1', 'inject'), link('opex/maddox', 'c1', 'search'), link('opex/opex', 'c1', 'inject'), link('outro/bot', 'c1', 'search')])
    expect(result).toEqual([
      { id: appLinkEdgeId('opex', 'c1'), app: 'opex', channel: 'c1', modes: ['inject', 'search'], agents: ['opex/opex', 'opex/maddox'] },
      { id: appLinkEdgeId('outro', 'c1'), app: 'outro', channel: 'c1', modes: ['search'], agents: ['outro/bot'] },
    ])
  })

  it('appChannels devolve só os canais do app, sem repetir', () => {
    const links = [link('opex/opex', 'c1'), link('opex/maddox', 'c1'), link('opex/maddox', 'c2'), link('outro/bot', 'c3')]
    expect(appChannels('opex', links)).toEqual(['c1', 'c2'])
    expect(appChannels('nenhum', links)).toEqual([])
  })

  it('appReach soma as memórias dos canais do app uma vez por canal; app sem links não aparece', () => {
    const reach = appReach(appLinks([link('opex/opex', 'c1'), link('opex/maddox', 'c1'), link('opex/maddox', 'c2'), link('outro/bot', 'c2')]), new Map([['c1', 3], ['c2', 2]]))
    expect(reach.get('opex')).toBe(5)
    expect(reach.get('outro')).toBe(2)
    expect(reach.get('nenhum')).toBeUndefined()
  })

  it('appOfAgent pega o app do id qualificado', () => {
    expect(appOfAgent('opex/opex')).toBe('opex')
    expect(appOfAgent('solto')).toBe('solto')
  })
})

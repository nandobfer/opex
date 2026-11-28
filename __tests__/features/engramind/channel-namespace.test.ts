import { describe, expect, it } from 'vitest'
import { channelDisplay, instanceAppOf, isManagedReal, isReservedChannel, LEGACY_NAMESPACE, logicalChannel, realChannel, realSubscriptionTarget } from '@/features/engramind/channel-namespace'
import { contextChannelsFor, fixedMemoryChannels, isOpexMemoryAgent, listOfChannel, memoryChannelOf, subscriptionTargetsFor } from '@/features/ai/agents'
import { routineChannelOf, routineGlobalChannel } from '@/features/routine-agents/constants'
import { isEligibleExtraChannel } from '@/features/routine-agents/provision-plan'

/**
 * Espaço de nomes dos canais (OPE-206): cada instância usa o próprio app e os canais gerenciados levam o nome do app
 * na frente; os escolhidos pelo usuário não mudam.
 */

const owner = { app: 'opex', prefixed: true }
const alfredo = { app: 'alfredopex', prefixed: true }
const CENTRAL = '6ac98c6c0abde1d643c85903'

describe('realChannel / logicalChannel', () => {
  it('raiz opex vira o app (no dono continua opex)', () => {
    expect(realChannel(alfredo, 'opex')).toBe('alfredopex')
    expect(realChannel(owner, 'opex')).toBe('opex')
  })

  it('agentes/... ganha o app na frente', () => {
    expect(realChannel(owner, 'agentes/maddox/dono')).toBe('opex/agentes/maddox/dono')
    expect(realChannel(alfredo, 'agentes/opex/global')).toBe('alfredopex/agentes/opex/global')
  })

  it('canal escolhido pelo usuário não muda', () => {
    expect(realChannel(alfredo, 'vagas/empresa-x')).toBe('vagas/empresa-x')
    expect(realChannel(owner, 'curriculo/experiencias')).toBe('curriculo/experiencias')
  })

  it('modo de nomes antigos é a identidade', () => {
    expect(realChannel(LEGACY_NAMESPACE, 'agentes/maddox/dono')).toBe('agentes/maddox/dono')
    expect(realChannel(LEGACY_NAMESPACE, 'opex')).toBe('opex')
  })

  it('respeita os limites do Engramind (120 caracteres e 8 segmentos)', () => {
    expect(realChannel({ app: 'a'.repeat(64), prefixed: true }, `agentes/rotineiros/${'b'.repeat(60)}`)).toBeNull()
    expect(realChannel(owner, 'agentes/a/b/c/d/e/f/g')).toBeNull()
    expect(realChannel(owner, 'agentes/a/b/c/d/e/f')).toBe('opex/agentes/a/b/c/d/e/f')
  })

  it('logicalChannel desfaz o prefixo e mantém o resto', () => {
    expect(logicalChannel(alfredo, 'alfredopex')).toBe('opex')
    expect(logicalChannel(alfredo, 'alfredopex/agentes/secretario/global')).toBe('agentes/secretario/global')
    expect(logicalChannel(alfredo, 'opex/agentes/maddox/dono')).toBe('opex/agentes/maddox/dono')
    expect(logicalChannel(alfredo, 'vagas/x')).toBe('vagas/x')
    expect(channelDisplay(owner, 'opex/agentes/adversario')).toBe('agentes/adversario')
  })

  it('curingas das assinaturas', () => {
    expect(realSubscriptionTarget(owner, 'agentes/maddox/*')).toBe('opex/agentes/maddox/*')
    expect(realSubscriptionTarget(alfredo, 'opex')).toBe('alfredopex')
    expect(realSubscriptionTarget(LEGACY_NAMESPACE, 'agentes/maddox/*')).toBe('agentes/maddox/*')
  })

  it('app da instância pela chave (bootstrap vira opex)', () => {
    expect(instanceAppOf('bootstrap')).toBe('opex')
    expect(instanceAppOf('alfredopex')).toBe('alfredopex')
  })
})

describe('canais derivados com o espaço de nomes', () => {
  it('centrais, clientes, rotineiros e conversas do Secretário', () => {
    expect(memoryChannelOf('developer-central', { centralId: CENTRAL }, alfredo)).toBe(`alfredopex/agentes/desenvolvedor/central/${CENTRAL}`)
    expect(memoryChannelOf('maddox-client-specific', { clientId: CENTRAL }, owner)).toBe(`opex/agentes/maddox/clientes/${CENTRAL}`)
    expect(memoryChannelOf('routine-specific', { routineSlug: 'vagas' }, owner)).toBe('opex/agentes/rotineiros/vagas')
    expect(memoryChannelOf('secretary-conversation', { conversationId: '5531999999999' }, owner)).toBe('opex/agentes/secretario/conversas/5531999999999')
    expect(routineChannelOf('vagas', alfredo)).toBe('alfredopex/agentes/rotineiros/vagas')
    expect(routineGlobalChannel(alfredo)).toBe('alfredopex/agentes/rotineiros/global')
  })

  it('contexto e assinaturas do turno', () => {
    expect(contextChannelsFor('desenvolvedor', { kind: 'central', centralId: CENTRAL }, owner)).toEqual(['opex', 'opex/agentes/desenvolvedor/global', `opex/agentes/desenvolvedor/central/${CENTRAL}`])
    expect(subscriptionTargetsFor('mentor', alfredo)).toEqual(['alfredopex/agentes/adversario', 'alfredopex/agentes/desenvolvedor/*'])
    expect(fixedMemoryChannels(alfredo).map((item) => item.slug)).toContain('alfredopex')
  })

  it('listOfChannel lê o nome real e ignora os nomes de outra instância', () => {
    expect(listOfChannel(`opex/agentes/desenvolvedor/central/${CENTRAL}`, owner)).toEqual({ agentId: 'developer-central', centralId: CENTRAL })
    expect(listOfChannel('opex', owner)).toEqual({ agentId: 'app-global' })
    expect(listOfChannel('agentes/maddox/dono', owner)).toBeNull()
    expect(listOfChannel('agentes/maddox/dono', LEGACY_NAMESPACE)).toEqual({ agentId: 'maddox-owner' })
    expect(isManagedReal(alfredo, 'opex/agentes/x')).toBe(false)
  })

  it('agente de memórias só no app da instância', () => {
    expect(isOpexMemoryAgent('alfredopex', 'opex', 'alfredopex')).toBe(true)
    expect(isOpexMemoryAgent('opex', 'opex', 'alfredopex')).toBe(false)
  })
})

describe('canais reservados dos rotineiros', () => {
  it('a raiz e os agentes desta instância (e os nomes antigos) ficam de fora; outros apps continuam', () => {
    expect(isReservedChannel(alfredo, 'alfredopex')).toBe(true)
    expect(isReservedChannel(alfredo, 'alfredopex/agentes/maddox/dono')).toBe(true)
    expect(isReservedChannel(alfredo, 'agentes/maddox/dono')).toBe(true)
    expect(isEligibleExtraChannel('vagas/empresa-x', alfredo)).toBe(true)
    expect(isEligibleExtraChannel('dndicas/compartilhado', alfredo)).toBe(true)
    expect(isEligibleExtraChannel('alfredopex/agentes/opex/global', alfredo)).toBe(false)
  })
})

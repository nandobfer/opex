import { describe, expect, it } from 'vitest'
import { MEMORY_SUBSCRIPTION_TARGETS, contextChannelsFor, fixedMemoryChannels, isOpexMemoryAgent, listOfChannel, memoryChannelOf, writableListsFor } from '@/features/ai/agents'
import { memoriesSection, memoryCacheNotice } from '@/features/ai/memories-prompt'

/** OPE-104: listas de memórias ↔ canais do Engramind e o que cada agente lê e grava em cada turno. */

const C = 'a'.repeat(24)
const K = 'b'.repeat(24)

describe('mapeamento lista ↔ canal', () => {
  it('cada lista tem o canal dela; as com escopo exigem um id válido', () => {
    expect(memoryChannelOf('app-global')).toBe('opex')
    expect(memoryChannelOf('opex-owner')).toBe('agentes/opex/dono')
    expect(memoryChannelOf('adversarial')).toBe('agentes/adversario')
    expect(memoryChannelOf('developer-central', { centralId: C })).toBe(`agentes/desenvolvedor/central/${C}`)
    expect(memoryChannelOf('maddox-client-specific', { clientId: K })).toBe(`agentes/maddox/clientes/${K}`)
    expect(memoryChannelOf('developer-central', {})).toBeNull()
    expect(memoryChannelOf('opex-client-specific', { clientId: 'x' })).toBeNull()
  })

  it('canal → lista (webhook); canal fora do mapeamento é null', () => {
    expect(listOfChannel('opex')).toEqual({ agentId: 'app-global' })
    expect(listOfChannel('agentes/maddox/cliente')).toEqual({ agentId: 'maddox-client' })
    expect(listOfChannel(`agentes/desenvolvedor/central/${C}`)).toEqual({ agentId: 'developer-central', centralId: C })
    expect(listOfChannel(`agentes/opex/clientes/${K}`)).toEqual({ agentId: 'opex-client-specific', clientId: K })
    expect(listOfChannel('eng/global')).toBeNull()
    expect(listOfChannel('agentes/desenvolvedor/central/nao-e-id')).toBeNull()
    expect(listOfChannel(null)).toBeNull()
  })

  it('canais fixos: o "opex" de todos e as listas sem escopo; todo agente assina o "opex"', () => {
    expect(fixedMemoryChannels().map((item) => item.slug)).toEqual(['opex', 'agentes/opex/global', 'agentes/opex/dono', 'agentes/opex/cliente', 'agentes/maddox/global', 'agentes/maddox/dono', 'agentes/maddox/cliente', 'agentes/adversario', 'agentes/desenvolvedor/global'])
    for (const targets of Object.values(MEMORY_SUBSCRIPTION_TARGETS)) expect(targets[0]).toBe('opex')
    expect(MEMORY_SUBSCRIPTION_TARGETS.adversario).toEqual(['opex', 'agentes/adversario'])
    expect(MEMORY_SUBSCRIPTION_TARGETS.desenvolvedor).toEqual(['opex', 'agentes/desenvolvedor/*'])
  })

  it('agente de memórias do Opex (selo da aba Identidades)', () => {
    expect(isOpexMemoryAgent('opex', 'opex/desenvolvedor')).toBe(true)
    expect(isOpexMemoryAgent('opex', 'outro')).toBe(false)
    expect(isOpexMemoryAgent('crm', 'opex/maddox')).toBe(false)
  })
})

describe('canais do turno', () => {
  it('dono: Memórias do Opex, globais e do dono; portal: globais, do cliente (todos) e as do cliente da sessão', () => {
    expect(contextChannelsFor('opex', { kind: 'owner' })).toEqual(['opex', 'agentes/opex/global', 'agentes/opex/dono'])
    expect(contextChannelsFor('maddox', { kind: 'client', clientId: K })).toEqual(['opex', 'agentes/maddox/global', 'agentes/maddox/cliente', `agentes/maddox/clientes/${K}`])
  })

  it('Adversário lê só a lista dele; desenvolvedor lê as globais e as da central (sem central, só as globais)', () => {
    expect(contextChannelsFor('adversario', { kind: 'review' })).toEqual(['opex', 'agentes/adversario'])
    expect(contextChannelsFor('desenvolvedor', { kind: 'central', centralId: C })).toEqual(['opex', 'agentes/desenvolvedor/global', `agentes/desenvolvedor/central/${C}`])
    expect(contextChannelsFor('desenvolvedor', { kind: 'central', centralId: null })).toEqual(['opex', 'agentes/desenvolvedor/global'])
  })

  it('no portal o agente grava só na lista do cliente da sessão; com o dono, em todas as dele', () => {
    expect(writableListsFor('opex', { kind: 'client', clientId: K })).toEqual(['opex-client-specific'])
    expect(writableListsFor('opex', { kind: 'owner' })).toEqual(['app-global', 'opex-global', 'opex-owner', 'opex-client', 'opex-client-specific'])
    expect(writableListsFor('adversario', { kind: 'review' })).toEqual(['app-global', 'adversarial'])
    expect(writableListsFor('desenvolvedor', { kind: 'central', centralId: C })).toEqual(['app-global', 'developer-global', 'developer-central'])
  })
})

describe('seção das memórias no prompt', () => {
  it('o bloco do Engramind entra sem alteração depois do cabeçalho; vazio não gera seção', () => {
    expect(memoriesSection('- A\n- B')).toBe('\n## Memórias e instruções permanentes\nSiga sempre estas memórias:\n\n- A\n- B')
    expect(memoriesSection('  ')).toBe('')
  })

  it('aviso do turno: cache com a data, ou turno sem memórias', () => {
    expect(memoryCacheNotice({ source: 'live', cachedAt: null })).toBeNull()
    expect(memoryCacheNotice({ source: 'cache', cachedAt: '2026-10-30T12:00:00Z' }, () => '30/10/2026 09:00')).toBe('Memórias carregadas do cache de 30/10/2026 09:00 (Engramind indisponível)')
    expect(memoryCacheNotice({ source: 'none', cachedAt: null })).toBe('Engramind indisponível: turno sem memórias')
  })
})

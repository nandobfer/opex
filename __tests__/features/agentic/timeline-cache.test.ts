import { beforeEach, describe, expect, it } from 'vitest'
import { INITIAL_TIMELINE, type TimelineState } from '@/features/agentic/timeline'
import { clearTimelineCache, dropTimelineCache, readTimelineCache, TIMELINE_CACHE_LIMIT, writeTimelineCache } from '@/features/agentic/timeline-cache'

/** OPE-188: saída já carregada fica em memória para a troca de mesa mostrar na hora. */

const loaded = (text: string): TimelineState => ({ ...INITIAL_TIMELINE, loaded: true, items: [{ kind: 'text', key: `text-${text}`, text }] })

beforeEach(() => clearTimelineCache())

describe('timeline-cache', () => {
  it('guarda e devolve a saída pela URL do stream', () => {
    const state = loaded('a')
    writeTimelineCache('/api/agentic/workbenches/w1/events', state)
    expect(readTimelineCache('/api/agentic/workbenches/w1/events')).toBe(state)
    expect(readTimelineCache('/api/agentic/workbenches/w2/events')).toBeNull()
  })

  it('não guarda saída que ainda não carregou', () => {
    writeTimelineCache('/w1', INITIAL_TIMELINE)
    expect(readTimelineCache('/w1')).toBeNull()
  })

  it('acima do limite sai a menos usada (a leitura renova a entrada)', () => {
    for (let index = 0; index < TIMELINE_CACHE_LIMIT; index++) writeTimelineCache(`/w${index}`, loaded(String(index)))
    readTimelineCache('/w0')
    writeTimelineCache('/novo', loaded('novo'))
    expect(readTimelineCache('/w0')).not.toBeNull()
    expect(readTimelineCache('/w1')).toBeNull()
    expect(readTimelineCache('/novo')).not.toBeNull()
  })

  it('esquece as saídas de uma mesa ou fork excluído', () => {
    writeTimelineCache('/api/agentic/workbenches/w1/events', loaded('a'))
    writeTimelineCache('/api/agentic/workbenches/w1/forks/f1/events', loaded('b'))
    writeTimelineCache('/api/agentic/workbenches/w2/events', loaded('c'))
    dropTimelineCache('f1')
    expect(readTimelineCache('/api/agentic/workbenches/w1/forks/f1/events')).toBeNull()
    expect(readTimelineCache('/api/agentic/workbenches/w1/events')).not.toBeNull()
    dropTimelineCache('w1')
    expect(readTimelineCache('/api/agentic/workbenches/w1/events')).toBeNull()
    expect(readTimelineCache('/api/agentic/workbenches/w2/events')).not.toBeNull()
  })
})

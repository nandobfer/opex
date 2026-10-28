/** @vitest-environment happy-dom */

import React from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'

/** Stub de `IntersectionObserver` (o DOM de teste não implementa) com disparo manual da interseção. */
class IntersectionObserverStub {
  static instances: IntersectionObserverStub[] = []
  readonly callback: IntersectionObserverCallback
  targets: Element[] = []
  disconnected = false

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    IntersectionObserverStub.instances.push(this)
  }

  observe(target: Element) {
    this.targets.push(target)
  }

  unobserve(target: Element) {
    this.targets = this.targets.filter((item) => item !== target)
  }

  disconnect() {
    this.disconnected = true
    this.targets = []
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  trigger(isIntersecting: boolean) {
    const entries = this.targets.map((target) => ({ target, isIntersecting })) as unknown as IntersectionObserverEntry[]
    this.callback(entries, this as unknown as IntersectionObserver)
  }
}

function Harness({ onLoadMore, disabled }: { onLoadMore: () => void; disabled?: boolean }) {
  const { sentinelRef, supported } = useInfiniteScroll({ onLoadMore, disabled })
  return <div ref={sentinelRef} data-testid="sentinel" data-supported={String(supported)} />
}

const lastObserver = () => IntersectionObserverStub.instances[IntersectionObserverStub.instances.length - 1]

beforeEach(() => {
  IntersectionObserverStub.instances = []
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
})

afterEach(() => vi.unstubAllGlobals())

describe('useInfiniteScroll', () => {
  it('carrega a próxima página quando o sentinel fica visível', () => {
    const onLoadMore = vi.fn()
    render(<Harness onLoadMore={onLoadMore} />)
    act(() => lastObserver().trigger(true))
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('não dispara enquanto está bloqueado', () => {
    const onLoadMore = vi.fn()
    render(<Harness onLoadMore={onLoadMore} disabled />)
    act(() => lastObserver().trigger(true))
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('redispara ao ser liberado com o sentinel ainda visível (não para após uma página)', () => {
    const onLoadMore = vi.fn()
    const { rerender } = render(<Harness onLoadMore={onLoadMore} disabled />)
    act(() => lastObserver().trigger(true))
    expect(onLoadMore).not.toHaveBeenCalled()

    rerender(<Harness onLoadMore={onLoadMore} />)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('não redispara se o sentinel saiu de vista ao ser liberado', () => {
    const onLoadMore = vi.fn()
    const { rerender } = render(<Harness onLoadMore={onLoadMore} disabled />)
    act(() => lastObserver().trigger(false))

    rerender(<Harness onLoadMore={onLoadMore} />)
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('desconecta o observer ao desmontar', () => {
    const onLoadMore = vi.fn()
    const { unmount } = render(<Harness onLoadMore={onLoadMore} />)
    const observer = lastObserver()
    unmount()
    expect(observer.disconnected).toBe(true)
  })

  it('sem IntersectionObserver o hook avisa que não há suporte', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { getByTestId } = render(<Harness onLoadMore={vi.fn()} />)
    expect(getByTestId('sentinel').getAttribute('data-supported')).toBe('false')
    expect(IntersectionObserverStub.instances).toHaveLength(0)
  })
})

import { vi, type Mock } from 'vitest'

// ─── DOM events ──────────────────────────────────────────────────────────────

export function fireMousedown(target: Node): void {
  const event = new MouseEvent('mousedown', { bubbles: true })
  target.dispatchEvent(event)
}

export function fireStorageEvent(key: string, newValue: string | null): void {
  const event = new StorageEvent('storage', {
    key,
    newValue,
    oldValue: null,
    url: window.location.href,
  })
  window.dispatchEvent(event)
}

// ─── localStorage helpers ────────────────────────────────────────────────────

export function clearStorage(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.clear()
  }
}

// ─── axios api mock factory ──────────────────────────────────────────────────

export interface ApiMock {
  get: Mock
  post: Mock
  put: Mock
  patch: Mock
  delete: Mock
}

export function makeApiMock(): ApiMock {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  }
}

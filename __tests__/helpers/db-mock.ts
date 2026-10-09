import { vi } from "vitest"

export function makeMongooseMock(methods: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(methods).map(([key, val]) => [key, vi.fn().mockResolvedValue(val)]))
}

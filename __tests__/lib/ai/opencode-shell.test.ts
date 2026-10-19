import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/ai/opencode", () => ({ getOpencodeConnection: vi.fn() }))
import { runOpencodeShell, streamOpencodeShell, type OpencodeClient } from "@/lib/ai/opencode-client"

/** Shell em memória: `outputs` são as páginas devolvidas por cursor; termina após `runningFor` leituras. */
function fakeShell(pages: string[], runningFor = pages.length) {
    let reads = 0
    const shell = {
        create: vi.fn(async () => ({ data: { id: "sh-1", status: "running" } })),
        get: vi.fn(async () => ({ data: { id: "sh-1", status: reads >= runningFor ? "exited" : "running", exit: 0 } })),
        output: vi.fn(async ({ cursor = 0 }: { cursor?: number }) => {
            const output = pages[reads] ?? ""
            reads += 1
            return { data: { output, cursor: cursor + output.length, size: 0, truncated: false } }
        }),
        remove: vi.fn(async () => undefined),
    }
    return { client: { shell } as unknown as OpencodeClient, shell }
}

describe("shell do OpenCode", () => {
    it("streaming entrega a saída por cursor até o comando terminar e remove o shell", async () => {
        const { client, shell } = fakeShell(["a\n", "b\n"], 2)
        const chunks: string[] = []
        const started: string[] = []
        const result = await streamOpencodeShell(client, "/tmp", "docker compose logs -f", {
            intervalMs: 1,
            onStart: (id) => void started.push(id),
            onOutput: (chunk) => void chunks.push(chunk),
        })
        expect(started).toEqual(["sh-1"])
        expect(chunks.join("")).toBe("a\nb\n")
        expect(shell.output.mock.calls.map((call) => (call[0] as { cursor: number }).cursor)).toEqual([0, 2, 4])
        expect(result).toMatchObject({ exitCode: 0, status: "exited" })
        expect(shell.remove).toHaveBeenCalledWith({ id: "sh-1", location: { directory: "/tmp" } })
    })
    it("abortar encerra o acompanhamento e remove o shell (encerra o processo no host)", async () => {
        const { client, shell } = fakeShell(["x\n"], Number.POSITIVE_INFINITY)
        const controller = new AbortController()
        const pending = streamOpencodeShell(client, "/tmp", "docker compose logs -f", {
            intervalMs: 5,
            signal: controller.signal,
            onOutput: () => controller.abort(),
        })
        await expect(pending).resolves.toMatchObject({ status: "running" })
        expect(shell.remove).toHaveBeenCalledTimes(1)
    })
    it("runOpencodeShell aceita limite de saída maior para leituras grandes", async () => {
        const { client, shell } = fakeShell(["@@END"], 0)
        await runOpencodeShell(client, "/tmp", "echo", { outputLimit: 1_000_000 })
        expect(shell.output).toHaveBeenCalledWith(expect.objectContaining({ limit: 1_000_000 }), expect.anything())
    })
})

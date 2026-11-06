import { EventEmitter } from "node:events"
import { beforeEach, describe, expect, it, vi } from "vitest"

const ssh = vi.hoisted(() => ({ connect: vi.fn(), end: vi.fn() }))

vi.mock("ssh2", async () => {
    const { EventEmitter: Emitter } = await import("node:events")
    return {
        Client: vi.fn(function () {
            const conn = new Emitter() as EventEmitter & { connect: typeof ssh.connect; end: typeof ssh.end; exec: () => void }
            conn.connect = vi.fn((config: unknown) => ssh.connect(config, conn))
            conn.end = ssh.end
            conn.exec = vi.fn()
            return conn
        }),
    }
})
vi.mock("@/lib/integrations/config", () => ({ getIntegrationConfig: vi.fn() }))
vi.mock("@/lib/integrations/debug", () => ({ integrationDebug: () => ({ request: vi.fn(), response: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

import { runSsh, type SshSettings } from "@/features/opencode-service/server/ssh"

const settings: SshSettings = { host: "host.local", port: 22, username: "burgos", privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nxxx\n", fingerprint: "SHA256:abc", bin: null }

describe("runSsh — chave privada inválida (OPE-141, porte do my-tasks v1.60.1)", () => {
    beforeEach(() => {
        ssh.connect.mockReset()
        ssh.end.mockReset()
    })

    it("chave mal formatada ou com senha vira 422 OPENCODE_SSH_KEY_INVALID com orientação", async () => {
        ssh.connect.mockImplementation(() => {
            throw new Error("Cannot parse privateKey: Encrypted private OpenSSH key detected, but no passphrase given")
        })
        const error = await runSsh("echo ok", 5_000, { quiet: true, settings }).catch((reason: unknown) => reason)
        expect(error).toMatchObject({ status: 422, code: "OPENCODE_SSH_KEY_INVALID" })
        expect((error as Error).message).toContain("Chave privada SSH inválida ou protegida por senha: Cannot parse privateKey")
        expect((error as Error).message).toContain("Use uma chave sem senha na integração OpenCode")
        expect(ssh.end).toHaveBeenCalled()
    })

    it("chave válida segue o fluxo normal (conecta, executa e devolve a saída)", async () => {
        ssh.connect.mockImplementation((_config: unknown, conn: EventEmitter & { exec: (command: string, cb: (error: Error | undefined, stream: EventEmitter & { stderr: EventEmitter }) => void) => void }) => {
            const stream = Object.assign(new EventEmitter(), { stderr: new EventEmitter() })
            conn.exec = (_command, cb) => {
                cb(undefined, stream)
                stream.emit("data", Buffer.from("ok\n"))
                stream.emit("close", 0)
            }
            queueMicrotask(() => conn.emit("ready"))
        })
        await expect(runSsh("echo ok", 5_000, { quiet: true, settings })).resolves.toEqual({ exitCode: 0, output: "ok\n" })
    })
})

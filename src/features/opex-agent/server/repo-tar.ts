/**
 * Leitor de tar em fluxo (o tarball do GitHub, já descompactado): entrega cada entrada sem guardar o
 * arquivo inteiro na memória. Entende ustar (`prefix` + `name`) e cabeçalhos PAX (`path`, `size`).
 */

export interface TarEntry {
    path: string
    type: "file" | "dir"
    size: number
}

export interface TarHandlers {
    /** Quer o conteúdo deste arquivo? Os demais são pulados sem acumular. */
    wantData(entry: TarEntry): boolean
    onEntry(entry: TarEntry, data: Buffer | null): void
}

const BLOCK = 512

class ByteQueue {
    private chunks: Buffer[] = []
    length = 0

    push(chunk: Buffer) {
        if (!chunk.length) return
        this.chunks.push(chunk)
        this.length += chunk.length
    }

    read(n: number): Buffer {
        const out = Buffer.allocUnsafe(n)
        let offset = 0
        while (offset < n) {
            const head = this.chunks[0]!
            const take = Math.min(head.length, n - offset)
            head.copy(out, offset, 0, take)
            offset += take
            if (take === head.length) this.chunks.shift()
            else this.chunks[0] = head.subarray(take)
        }
        this.length -= n
        return out
    }

    skip(n: number) {
        let left = n
        while (left > 0) {
            const head = this.chunks[0]!
            if (head.length <= left) {
                left -= head.length
                this.chunks.shift()
            } else {
                this.chunks[0] = head.subarray(left)
                left = 0
            }
        }
        this.length -= n
    }
}

function cString(buffer: Buffer, start: number, length: number): string {
    const slice = buffer.subarray(start, start + length)
    const end = slice.indexOf(0)
    return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8")
}

function octal(buffer: Buffer, start: number, length: number): number {
    const raw = cString(buffer, start, length).trim()
    return raw ? parseInt(raw, 8) : 0
}

/** Registros PAX (`"<len> chave=valor\n"`). */
export function parsePax(data: Buffer): Record<string, string> {
    const out: Record<string, string> = {}
    let offset = 0
    while (offset < data.length) {
        const space = data.indexOf(0x20, offset)
        if (space === -1) break
        const length = parseInt(data.subarray(offset, space).toString("utf8"), 10)
        if (!Number.isFinite(length) || length <= 0) break
        const record = data.subarray(space + 1, offset + length - 1).toString("utf8")
        const equals = record.indexOf("=")
        if (equals > 0) out[record.slice(0, equals)] = record.slice(equals + 1)
        offset += length
    }
    return out
}

/** Tira a primeira pasta (`owner-repo-sha/`) que o GitHub põe em todas as entradas. */
function stripRoot(path: string): string {
    const slash = path.indexOf("/")
    return slash === -1 ? "" : path.slice(slash + 1).replace(/\/+$/, "")
}

/** Lê as entradas do tar em fluxo. */
export async function readTar(chunks: AsyncIterable<Uint8Array>, handlers: TarHandlers): Promise<void> {
    const queue = new ByteQueue()
    let pax: Record<string, string> = {}
    let pending: { entry: TarEntry | null; size: number; padded: number; keep: boolean; paxHeader: boolean } | null = null

    const drain = (): boolean => {
        while (true) {
            if (pending) {
                const { size, padded, keep, paxHeader, entry } = pending
                if (keep || paxHeader) {
                    if (queue.length < padded) return false
                    const data = queue.read(padded).subarray(0, size)
                    pending = null
                    if (paxHeader) pax = { ...pax, ...parsePax(data) }
                    else if (entry) handlers.onEntry(entry, data)
                } else {
                    if (queue.length < padded) return false
                    queue.skip(padded)
                    pending = null
                }
                continue
            }
            if (queue.length < BLOCK) return false
            const header = queue.read(BLOCK)
            if (header.every((byte) => byte === 0)) continue
            const typeflag = String.fromCharCode(header[156] ?? 48)
            const name = cString(header, 0, 100)
            const prefix = cString(header, 345, 155)
            const size = pax.size ? Number(pax.size) : octal(header, 124, 12)
            const padded = Math.ceil(size / BLOCK) * BLOCK
            if (typeflag === "x" || typeflag === "g") {
                // "g" (global) traz só o comentário com o SHA: lido e descartado.
                pending = { entry: null, size, padded, keep: false, paxHeader: typeflag === "x" }
                continue
            }
            const fullPath = stripRoot(pax.path ?? (prefix ? `${prefix}/${name}` : name))
            pax = {}
            const type = typeflag === "5" ? "dir" : typeflag === "0" || typeflag === "\0" || typeflag === "7" ? "file" : null
            if (!type || !fullPath) {
                pending = { entry: null, size, padded, keep: false, paxHeader: false }
                continue
            }
            const entry: TarEntry = { path: fullPath, type, size: type === "dir" ? 0 : size }
            if (type === "dir") {
                handlers.onEntry(entry, null)
                pending = padded ? { entry: null, size, padded, keep: false, paxHeader: false } : null
                continue
            }
            const keep = handlers.wantData(entry)
            if (!keep) handlers.onEntry(entry, null)
            pending = { entry, size, padded, keep, paxHeader: false }
        }
    }

    for await (const chunk of chunks) {
        queue.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        drain()
    }
    drain()
}

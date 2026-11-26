/**
 * Gera os ícones do PWA (OPE-196) a partir de `public/opex-mark.png` (512 × 512, transparente):
 * - `public/pwa/icon-192.png` e `icon-512.png`: `purpose: "any"`, transparentes;
 * - `public/pwa/icon-maskable-512.png`: opaco no fundo do tema, marca em 60%: a ponta do traço
 *   diagonal fica dentro do círculo seguro (raio de 40%) dos ícones maskable, que o Android recorta em
 *   círculo ou squircle;
 * - `src/app/apple-icon.png`: 180 × 180, opaco, marca em 80% (convenção de arquivo do Next).
 *
 * Uso: `npx tsx scripts/generate-pwa-icons.ts`. O `sharp` não é dependência direta: vem do `next`.
 */
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { PWA_BACKGROUND } from "../src/features/pwa/constants"

/** Parte da API do `sharp` usada aqui (o pacote não é dependência direta, então não há tipos dele). */
interface SharpPipeline {
    resize(width: number, height: number, options: { fit: "contain"; background: { r: number; g: number; b: number; alpha: number } }): SharpPipeline
    composite(layers: { input: Buffer; gravity: "center" }[]): SharpPipeline
    flatten(options: { background: string }): SharpPipeline
    png(): SharpPipeline
    toBuffer(): Promise<Buffer>
    toFile(path: string): Promise<unknown>
}
type Sharp = (input: string | { create: { width: number; height: number; channels: 4; background: string } }) => SharpPipeline

const root = process.cwd()
const requireFromNext = createRequire(createRequire(join(root, "package.json")).resolve("next"))
const sharp = requireFromNext("sharp") as Sharp

const SOURCE = join(root, "public/opex-mark.png")

async function transparent(size: number, output: string) {
    await sharp(SOURCE).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(output)
}

async function opaque(size: number, markRatio: number, output: string) {
    const mark = Math.round(size * markRatio)
    const inner = await sharp(SOURCE).resize(mark, mark, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    await sharp({ create: { width: size, height: size, channels: 4, background: PWA_BACKGROUND } })
        .composite([{ input: inner, gravity: "center" }])
        .flatten({ background: PWA_BACKGROUND })
        .png()
        .toFile(output)
}

async function main() {
    mkdirSync(join(root, "public/pwa"), { recursive: true })
    await transparent(192, join(root, "public/pwa/icon-192.png"))
    await transparent(512, join(root, "public/pwa/icon-512.png"))
    await opaque(512, 0.6, join(root, "public/pwa/icon-maskable-512.png"))
    await opaque(180, 0.8, join(root, "src/app/apple-icon.png"))
}

void main()

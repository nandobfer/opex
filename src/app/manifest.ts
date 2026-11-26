import type { MetadataRoute } from "next"
import { BASE_PATH } from "@/lib/base-path"
import { buildManifest } from "@/features/pwa/manifest"

/** Manifest do PWA, servido em `/manifest.webmanifest` (público: ver `src/features/auth/paths.ts`). */
export default function manifest(): MetadataRoute.Manifest {
    return buildManifest(BASE_PATH)
}

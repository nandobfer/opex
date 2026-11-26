import type { Metadata } from "next"
import { OfflineScreen } from "@/features/pwa/components/OfflineScreen"

export const metadata: Metadata = { title: "Sem conexão · Opex" }

/** Página offline do PWA (OPE-196), fora da casca e pública (ver `src/features/auth/paths.ts`). */
export default function OfflinePage() {
    return <OfflineScreen />
}

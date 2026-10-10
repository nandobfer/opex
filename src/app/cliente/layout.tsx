import type { ReactNode } from "react"

/** Casca do portal do cliente: página própria, sem menu lateral. */
export default function ClienteLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto w-full max-w-6xl px-4 py-8">{children}</div>
        </div>
    )
}

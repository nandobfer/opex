import type { ReactNode } from "react"

/** Casca do portal do cliente: página própria, sem menu lateral. */
export default function ClienteLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-background">
            <div className="w-full px-3 py-5 sm:px-4">{children}</div>
        </div>
    )
}

"use client"

import { motion } from "framer-motion"
import { Lock } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

/** Abas da Builder Machine bloqueadas enquanto a integração está desativada. */
export function LockedTabs({ tabs }: { tabs: { id: string; label: string; icon: LucideIcon }[] }) {
    return (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }}>
            <Card>
                <CardContent className="space-y-3 pt-6">
                    <div role="tablist" aria-label="Seções da integração Builder Machine (bloqueadas)" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
                        {tabs.map((tab) => (
                            <button key={tab.id} type="button" role="tab" aria-selected={false} aria-disabled disabled className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium text-muted-foreground opacity-60">
                                <tab.icon className="h-4 w-4" aria-hidden />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Lock className="h-4 w-4 shrink-0" aria-hidden />
                        Ative a integração e salve para configurar o túnel, a conexão, o Docker e o preparo do PC.
                    </p>
                </CardContent>
            </Card>
        </motion.div>
    )
}

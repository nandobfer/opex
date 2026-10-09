import { ReactNode } from "react"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Filter } from "lucide-react"

interface CadastroFilterCardProps {
    total?: number
    children: ReactNode
}

export function CadastroFilterCard({ total, children }: CadastroFilterCardProps) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Filter className="h-5 w-5 text-primary" />
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Filtros</h2>
                    </div>
                    {total !== undefined && total > 0 && (
                        <div className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                            {total} REGISTROS
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {children}
            </CardContent>
        </Card>
    )
}

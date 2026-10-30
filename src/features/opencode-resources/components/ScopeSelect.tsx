"use client"

import { FolderGit2, Globe } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { GLOBAL_SCOPE } from "../constants"
import { useOpencodeScopes } from "../hooks/useOpencodeResources"

/** Escopo dos recursos: Global (usuário) ou um projeto (diretório de uma central). */
export function ScopeSelect({ value, onChange, id, className }: { value: string; onChange: (scope: string) => void; id?: string; className?: string }) {
    const scopes = useOpencodeScopes()
    const options = scopes.data ?? [{ id: GLOBAL_SCOPE, label: "Global (usuário)", directory: null }]
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger id={id} className={className} aria-label="Escopo">
                <SelectValue placeholder="Escopo" />
            </SelectTrigger>
            <SelectContent>
                {options.map((scope) => (
                    <SelectItem key={scope.id} value={scope.id}>
                        <span className="flex items-center gap-2">
                            {scope.directory ? <FolderGit2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                            {scope.label}
                            {scope.directory ? <span className="truncate font-mono text-[11px] text-muted-foreground">{scope.directory}</span> : null}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

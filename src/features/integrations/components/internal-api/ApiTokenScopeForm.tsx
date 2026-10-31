"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { API_SCOPE_ALL, MCP_OWNER_DESTRUCTIVE, MCP_OWNER_SCOPE, scopesToSelection, selectionToScopes, type ApiTokenScopeSelection } from "../../api-tokens/scopes"
import type { ApiTokenScopeCatalogDto } from "../../api-tokens/types"
import { ApiTokenDestructiveNotice } from "./ApiTokenDestructiveNotice"
import { ApiTokenToolsPicker } from "./ApiTokenToolsPicker"

const reveal = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

interface ApiTokenScopeFormProps {
    catalog: ApiTokenScopeCatalogDto
    /** Escopos iniciais (edição); a seleção da tela vive aqui e cada mudança devolve os escopos. */
    initialScopes: readonly string[]
    onChange: (scopes: string[]) => void
    error?: string
}

/** Escopos do token: rotas da API v1, MCP do dono, ferramentas e destrutivas. */
export function ApiTokenScopeForm({ catalog, initialScopes, onChange, error }: ApiTokenScopeFormProps) {
    const [selection, setSelection] = useState<ApiTokenScopeSelection>(() => scopesToSelection(initialScopes))
    const update = (next: ApiTokenScopeSelection) => {
        setSelection(next)
        onChange(selectionToScopes(next))
    }
    const scopes = selectionToScopes(selection)
    const scopedRoutes = catalog.routes.filter((route) => route.scope)
    const freeRoutes = catalog.routes.filter((route) => !route.scope)

    return (
        <div className="space-y-4">
            <section className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">API v1</p>
                <div className="flex items-start gap-2">
                    <Checkbox id="scope-api-all" checked={selection.apiAll} onCheckedChange={(apiAll) => update({ ...selection, apiAll })} />
                    <Label htmlFor="scope-api-all" className="text-sm font-normal">
                        Todas as rotas da API v1 <code className="font-mono text-xs text-muted-foreground">{API_SCOPE_ALL}</code>
                    </Label>
                </div>
                {scopedRoutes.map((route) => (
                    <div key={route.path} className="flex items-start gap-2 pl-6">
                        <Checkbox
                            id={`scope-route-${route.path}`}
                            disabled={selection.apiAll}
                            checked={selection.apiAll || selection.apiRoutes.includes(route.scope as string)}
                            onCheckedChange={(on) => update({ ...selection, apiRoutes: on ? [...selection.apiRoutes, route.scope as string] : selection.apiRoutes.filter((item) => item !== route.scope) })}
                        />
                        <Label htmlFor={`scope-route-${route.path}`} className="text-sm font-normal">
                            {route.method} {route.path} — {route.summary}
                        </Label>
                    </div>
                ))}
                {freeRoutes.map((route) => (
                    <p key={route.path} className="text-xs text-muted-foreground">
                        <code className="font-mono">
                            {route.method} {route.path}
                        </code>{" "}
                        sempre liberado (qualquer token válido).
                    </p>
                ))}
            </section>

            <section className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="scope-mcp-owner" className="text-sm font-medium">
                        MCP do dono (Agente Maddox) <code className="font-mono text-xs text-muted-foreground">{MCP_OWNER_SCOPE}</code>
                    </Label>
                    <Switch id="scope-mcp-owner" checked={selection.mcpOwner} onCheckedChange={(mcpOwner) => update({ ...selection, mcpOwner })} />
                </div>
                <AnimatePresence initial={false}>
                    {selection.mcpOwner && (
                        <motion.div key="mcp" {...reveal} className="space-y-3 overflow-hidden">
                            <p className="text-xs text-muted-foreground">O ator é o dono. As ferramentas também precisam estar ligadas na configuração do Agente Maddox.</p>
                            <ApiTokenToolsPicker catalog={catalog} selection={selection} onChange={update} />
                            <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="scope-mcp-destructive" className="text-sm">
                                    Liberar ferramentas destrutivas <code className="font-mono text-xs text-muted-foreground">{MCP_OWNER_DESTRUCTIVE}</code>
                                </Label>
                                <Switch id="scope-mcp-destructive" checked={selection.destructive} onCheckedChange={(destructive) => update({ ...selection, destructive })} />
                            </div>
                            <ApiTokenDestructiveNotice scopes={scopes} tools={catalog.tools} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </section>
            <AnimatePresence initial={false}>
                {error && (
                    <motion.p key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="alert" className="text-xs text-destructive">
                        {error}
                    </motion.p>
                )}
            </AnimatePresence>
        </div>
    )
}

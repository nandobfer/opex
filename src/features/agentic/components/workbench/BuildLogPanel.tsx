"use client"

import { useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, ChevronUp, ExternalLink, Hammer, Search, WifiOff, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { IntegrationConsole, type ConsoleSearchResults, type IntegrationConsoleHandle } from "@/features/integrations/components/IntegrationConsole"
import { lastGithubRunUrl, type WorkbenchBuildDto } from "../../build-log"
import { useBuildLogStream, type BuildLogSink } from "../../hooks/useBuilds"

/** Linhas guardadas no terminal (o log inteiro de um build costuma caber). */
const SCROLLBACK = 50_000

/** Log de um build no terminal (xterm), com busca. Ao vivo enquanto o build roda. */
export function BuildLogPanel({ workbenchId, build }: { workbenchId: string; build: WorkbenchBuildDto }) {
    const consoleRef = useRef<IntegrationConsoleHandle>(null)
    // GitHub Action: o script imprime a URL da execução; a última vira um atalho acima do log.
    const [runUrl, setRunUrl] = useState<string | null>(null)
    const sink = useMemo<BuildLogSink>(
        () => ({
            reset: (text) => {
                consoleRef.current?.clear()
                consoleRef.current?.write(text)
                setRunUrl(lastGithubRunUrl(text))
            },
            write: (text) => {
                consoleRef.current?.write(text)
                const found = lastGithubRunUrl(text)
                if (found) setRunUrl(found)
            },
        }),
        [],
    )
    const { view, connected, error, retry } = useBuildLogStream(workbenchId, build.id, sink)
    const [term, setTerm] = useState("")
    const [results, setResults] = useState<ConsoleSearchResults>({ index: -1, count: 0 })
    const running = (view.status ?? build.status) === "running"
    const empty = view.loaded && view.end === 0

    const search = (direction: "next" | "previous") => {
        if (!term.trim()) {
            consoleRef.current?.clearSearch()
            return
        }
        consoleRef.current?.search(term, direction)
    }

    if (error) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
                <XCircle className="h-6 w-6 text-destructive" aria-hidden />
                <p>Não foi possível carregar o log deste build.</p>
                <Button size="sm" variant="outline" onClick={retry}>
                    Tentar novamente
                </Button>
            </div>
        )
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
            <form
                className="flex items-center gap-1.5"
                onSubmit={(event) => {
                    event.preventDefault()
                    search("next")
                }}
            >
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                        value={term}
                        onChange={(event) => {
                            setTerm(event.target.value)
                            if (!event.target.value.trim()) consoleRef.current?.clearSearch()
                        }}
                        placeholder="Buscar no log"
                        aria-label="Buscar no log do build"
                        className="h-8 pl-7 text-xs"
                    />
                </div>
                {term.trim() && results.count > 0 && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {results.index + 1}/{results.count}
                    </span>
                )}
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => search("previous")} aria-label="Ocorrência anterior">
                    <ChevronUp className="h-4 w-4" aria-hidden />
                </Button>
                <Button type="submit" size="icon" variant="ghost" className="h-8 w-8" aria-label="Próxima ocorrência">
                    <ChevronDown className="h-4 w-4" aria-hidden />
                </Button>
            </form>
            <AnimatePresence initial={false}>
                {build.method === "github" && runUrl && (
                    <motion.a
                        key="run"
                        href={runUrl}
                        target="_blank"
                        rel="noreferrer"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="flex items-center gap-1.5 overflow-hidden text-xs text-primary hover:underline"
                    >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Abrir a execução no GitHub
                    </motion.a>
                )}
            </AnimatePresence>
            <AnimatePresence initial={false}>
                {running && view.loaded && !connected && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="flex items-center gap-1.5 overflow-hidden text-xs text-warning">
                        <WifiOff className="h-3.5 w-3.5" aria-hidden /> Conexão com o log caiu; reconectando…
                    </motion.p>
                )}
            </AnimatePresence>
            <div className="relative flex min-h-60 flex-1">
                <IntegrationConsole ref={consoleRef} className="h-full min-h-60 w-full flex-1" onSearchResults={setResults} scrollback={SCROLLBACK} ariaLabel={`Log do build #${build.number}`} />
                <AnimatePresence>
                    {empty && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                            <Hammer className="h-6 w-6" aria-hidden />
                            <p>{running ? (build.method === "github" ? "Aguardando a saída do script da prévia…" : "Aguardando a saída do docker compose…") : "Este build não produziu saída."}</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}

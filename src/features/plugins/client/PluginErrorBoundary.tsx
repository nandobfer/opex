"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Fronteira de erro por contribuição de plugin (OPE-172): um plugin que falha mostra o erro em pt-BR
 * no próprio slot, sem derrubar a tela nem os outros plugins.
 */
interface Props {
    pluginName: string
    children: ReactNode
    /** Troca de revisão limpa o erro (a versão nova tenta de novo). */
    resetKey: string
    /** Erro de render pego aqui (vai para o debug do plugin). */
    onError?: (error: Error) => void
}

interface State {
    error: Error | null
    key: string
}

export class PluginErrorBoundary extends Component<Props, State> {
    override state: State = { error: null, key: this.props.resetKey }

    static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
        return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error }
    }

    override componentDidCatch(error: Error, info: ErrorInfo): void {
        void info
        this.props.onError?.(error)
    }

    override render() {
        if (!this.state.error) return this.props.children
        return <PluginErrorCard pluginName={this.props.pluginName} message={this.state.error.message} onRetry={() => this.setState({ error: null })} />
    }
}

export function PluginErrorCard({ pluginName, message, onRetry }: { pluginName: string; message: string; onRetry?: () => void }) {
    return (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium text-foreground">O plugin {pluginName} falhou</p>
                <p className="break-words text-xs text-muted-foreground">{message || "Erro desconhecido"}</p>
            </div>
            {onRetry && (
                <Button type="button" size="sm" variant="ghost" onClick={onRetry}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Tentar novamente
                </Button>
            )}
        </div>
    )
}

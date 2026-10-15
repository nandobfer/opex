"use client"

import * as React from "react"

interface Props {
    /** Avisado quando o editor não pôde ser carregado/montado. */
    onError: () => void
    children: React.ReactNode
}

interface State {
    failed: boolean
}

/**
 * Contém a falha do carregamento sob demanda do editor (chunk indisponível) ou da sua montagem: o
 * `<textarea>` continua visível e utilizável, em vez de a tela inteira cair.
 */
export class EditorErrorBoundary extends React.Component<Props, State> {
    override state: State = { failed: false }

    static getDerivedStateFromError(): State {
        return { failed: true }
    }

    override componentDidCatch(): void {
        this.props.onError()
    }

    override render(): React.ReactNode {
        return this.state.failed ? null : this.props.children
    }
}

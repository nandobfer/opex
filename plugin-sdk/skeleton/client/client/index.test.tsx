/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { mockApi } from "@opex/plugin-sdk/testing"
import client from "./index"

describe("interface do plugin do portal", () => {
    it("mostra a quantidade de tarefas do cliente", async () => {
        mockApi("get", "/cliente/tasks", { success: true, data: { tasks: [{}, {}] } })
        const Widget = client.slots.Widget
        const view = render(
            <QueryClientProvider client={new QueryClient()}>
                <Widget />
            </QueryClientProvider>,
        )
        await waitFor(() => expect(view.container.textContent).toContain("2 tarefa(s)"))
    })
})

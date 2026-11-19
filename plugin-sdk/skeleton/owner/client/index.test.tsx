/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import client from "./index"

describe("interface do plugin", () => {
    it("exporta o widget declarado no plugin.json", () => {
        const Widget = client.slots.Widget
        const view = render(<Widget />)
        expect(view.container.textContent).toContain("Plugin ativo.")
    })
})

import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface TabFooterProps {
    isSubmitting: boolean
    onCancel: () => void
    submitLabel: string
    showSpinner?: boolean
}

export const TabFooter = ({
    isSubmitting,
    onCancel,
    submitLabel,
    showSpinner,
}: TabFooterProps) => {
    return (
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-6 dark:border-gray-700 mt-auto">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
                {showSpinner && isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitLabel}
            </Button>
        </div>
    )
}

interface TabWrapperProps extends TabFooterProps {
    children: ReactNode
    className?: string
}

export const TabWrapper = ({ children, className, ...footerProps }: TabWrapperProps) => {
    return (
        <div className={`flex flex-col gap-6 ${className ?? ""}`}>
            {children}
            <TabFooter {...footerProps} />
        </div>
    )
}

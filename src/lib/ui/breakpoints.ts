export const BREAKPOINTS = {
    mobile: 375,
    tablet: 768,
    desktop: 1024,
    wide: 1920,
} as const;

export type ViewportBreakpoint = "mobile" | "tablet" | "desktop" | "wide";

export const getViewportBreakpoint = (width: number): ViewportBreakpoint => {
    if (width >= BREAKPOINTS.wide) {
        return "wide";
    }
    if (width >= BREAKPOINTS.desktop) {
        return "desktop";
    }
    if (width >= BREAKPOINTS.tablet) {
        return "tablet";
    }
    return "mobile";
};

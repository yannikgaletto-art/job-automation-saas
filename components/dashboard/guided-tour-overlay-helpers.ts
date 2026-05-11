export const TOOLTIP_VIEWPORT_MARGIN = 20;
export const TOOLTIP_MIN_HEIGHT = 220;

export function getTooltipMaxHeight(top: number, viewportHeight: number): number {
    return Math.max(TOOLTIP_MIN_HEIGHT, viewportHeight - top - TOOLTIP_VIEWPORT_MARGIN);
}

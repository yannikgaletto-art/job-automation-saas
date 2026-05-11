import { getTooltipMaxHeight } from '../guided-tour-overlay-helpers';

describe('GuidedTourOverlay viewport sizing', () => {
    it('keeps a below-target tooltip inside the visible viewport', () => {
        expect(getTooltipMaxHeight(335, 900)).toBe(545);
    });

    it('keeps enough room for the fixed action button on short screens', () => {
        expect(getTooltipMaxHeight(700, 780)).toBe(220);
    });
});

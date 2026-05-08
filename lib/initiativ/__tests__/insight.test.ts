import { buildInitiativInsight, type InsightSignal } from '../insight';

const signal: InsightSignal = {
    id: 'signal-1',
    companyName: '9X',
    sourceUrl: 'https://www.presseportal.de/pm/178349/6174534',
    sourceName: 'Presseportal',
    triggerDate: '2025-12-08T11:01:00.000Z',
    summary: '9X begleitet KI-Enablement und Prozessautomatisierung in Berlin.',
    branche: 'Innovationsberatung, KI-Beratung, Prozessautomatisierung',
    region: 'Berlin',
    confidence: 'green',
};

describe('buildInitiativInsight', () => {
    it('prefers professional CV results over private human notes', () => {
        const insight = buildInitiativInsight({
            signal,
            professionalResults: [
                'Design-Thinking-Workshops moderiert und Teams durch nutzerzentrierte Innovation gefuehrt.',
                'Strategische Partnerschaften aufgebaut.',
            ].join('\n'),
            peerPerspective: 'ruhig unter Druck',
            focus: 'Design Thinking',
        });

        expect(insight.strengthSource).toBe('professional_results');
        expect(insight.strengthText).toContain('Design-Thinking-Workshops');
        expect(insight.signalAnchor).toBe(signal.summary);
        expect(insight.sourceUrl).toBe(signal.sourceUrl);
    });

    it('does not expose private human-aspect text as fallback', () => {
        const insight = buildInitiativInsight({
            signal,
            professionalResults: '',
            peerPerspective: '',
            focus: 'Design Thinking',
        });

        expect(insight.strengthSource).toBe('profile_fallback');
        expect(insight.strengthText).toBeNull();
    });

    it('uses peer perspective only when no professional result exists', () => {
        const insight = buildInitiativInsight({
            signal,
            professionalResults: '',
            peerPerspective: 'strukturiert in komplexen Transformationsprozessen',
            focus: 'Transformation',
        });

        expect(insight.strengthSource).toBe('peer_perspective');
        expect(insight.strengthText).toBe('strukturiert in komplexen Transformationsprozessen');
    });
});

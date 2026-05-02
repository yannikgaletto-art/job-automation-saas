import { cleanJobBenefits, MAX_JOB_BENEFITS } from '../job-benefit-filter';

describe('job-benefit-filter', () => {
    it('keeps original wording but caps benefits to six', () => {
        const benefits = [
            'Hybrides Arbeiten ohne Kernarbeitszeit',
            'Flexible Arbeitszeit',
            'Workation',
            'Masterförderung',
            'Interne Academy',
            '30 Urlaubstage',
            'Betriebliche Krankenkasse',
            'Urban Sports Club',
        ];

        expect(cleanJobBenefits(benefits)).toEqual(benefits.slice(0, MAX_JOB_BENEFITS));
    });

    it('deduplicates and ignores empty values before capping', () => {
        expect(cleanJobBenefits([
            'Remote Work',
            ' ',
            'remote work',
            'Weiterbildungsbudget',
        ])).toEqual(['Remote Work', 'Weiterbildungsbudget']);
    });
});

import fs from 'fs';
import path from 'path';
import { DASHBOARD_TOUR_IDS } from '@/app/[locale]/dashboard/hooks/useDashboardTour';

type LocaleMessages = {
    tour: {
        button_start: string;
        cv_optimizer: {
            qr_spotlight_body: string;
            ats_spotlight_title: string;
            ats_spotlight_body: string;
        };
    };
};

function loadLocale(locale: string): LocaleMessages {
    return JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../locales', `${locale}.json`), 'utf8')
    ) as LocaleMessages;
}

describe('CV optimizer spotlight copy', () => {
    it('uses the requested German QR text as plain text', () => {
        const de = loadLocale('de');

        expect(de.tour.cv_optimizer.qr_spotlight_body).toBe(
            'Dein optimierter Lebenslauf kann jetzt einen persönlichen QR-Code enthalten. Recruiter öffnen darüber ein kurzes Video, in dem du Motivation zeigst. Damit erhöhen wir die Wahrscheinlichkeiten für ein Job-Interview. Die Daten werden maximal 14 Tage auf den EU-Servern gespeichert. Du kannst es jederzeit wieder löschen.'
        );
        expect(de.tour.cv_optimizer.qr_spotlight_body).not.toContain('<b>');
    });

    it('keeps QR and ATS spotlight copy in all locales', () => {
        for (const locale of ['de', 'en', 'es']) {
            const { tour } = loadLocale(locale);

            expect(tour.button_start).not.toMatch(/[!¡]/);
            expect(tour.cv_optimizer.qr_spotlight_body).toBeTruthy();
            expect(tour.cv_optimizer.ats_spotlight_title).toBeTruthy();
            expect(tour.cv_optimizer.ats_spotlight_body).toBeTruthy();
        }
    });

    it('registers the ATS spotlight for tour resets', () => {
        expect(DASHBOARD_TOUR_IDS).toContain('cv-ats-template');
    });

    it('gates the ATS spotlight on the same first-preview trigger and delay as QR', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../../components/cv-optimizer/OptimizerWizard.tsx'),
            'utf8'
        );
        const atsTourBlock = source.match(/const atsTour = useDashboardTour\('cv-ats-template'[\s\S]*?\n    \}\);/);

        expect(atsTourBlock?.[0]).toContain('delayMs: 700');
        expect(atsTourBlock?.[0]).toContain('enabled: qrTourEnabled');
    });
});

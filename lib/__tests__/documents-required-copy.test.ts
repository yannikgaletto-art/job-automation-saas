import fs from 'fs';
import path from 'path';

type LocaleMessages = {
    cv_match: {
        no_cv_desc: string;
        no_cv_cta: string;
    };
    documents_required: {
        cv_desc: string;
        upload_btn: string;
    };
    upload: Record<string, string>;
};

function loadLocale(locale: string): LocaleMessages {
    return JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../locales', `${locale}.json`), 'utf8')
    ) as LocaleMessages;
}

describe('CV required upload guidance copy', () => {
    const locales = ['de', 'en', 'es'];

    it('does not send CV upload users to settings or mention a 30-second upload', () => {
        for (const locale of locales) {
            const messages = loadLocale(locale);
            const copy = [
                messages.cv_match.no_cv_desc,
                messages.cv_match.no_cv_cta,
                messages.documents_required.cv_desc,
                messages.documents_required.upload_btn,
            ].join(' ');

            expect(copy).not.toMatch(/30 Sekunden|30 seconds|30 segundos|Settings|Ajustes|Einstellungen/);
        }
    });

    it('keeps the CV upload guideline modal copy available in every locale', () => {
        for (const locale of locales) {
            const upload = loadLocale(locale).upload;

            expect(upload.cv_hint_title).toBeTruthy();
            expect(upload.cv_hint_description).toBeTruthy();
            expect(upload.cv_hint_bullet_1).toBeTruthy();
            expect(upload.cv_hint_bullet_2).toBeTruthy();
            expect(upload.cv_hint_bullet_3).toBeTruthy();
            expect(upload.cv_hint_bullet_4).toBeTruthy();
        }

        expect(loadLocale('de').upload.cv_hint_bullet_2).toContain('Kennzahlen');
    });
});

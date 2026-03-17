import { getTranslations } from 'next-intl/server';

export default async function PrivacyPolicyPage() {
    const t = await getTranslations('legal.privacy');
    return (
        <div className="max-w-4xl mx-auto p-8 font-sans text-[#37352F]">
            <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
            <p className="text-sm text-gray-600 mb-8">{t('version')}</p>

            {/* TL;DR Section */}
            <div className="bg-[#F5F5F4] rounded-lg p-6 mb-10 border border-[#E7E7E5]">
                <h2 className="text-lg font-semibold mb-3">Auf einen Blick</h2>
                <ul className="space-y-2 text-sm text-[#73726E]">
                    <li>• Wir speichern nur Daten, die für die Bewerbungserstellung notwendig sind.</li>
                    <li>• Deine Daten werden verschlüsselt in der EU (Frankfurt) gespeichert.</li>
                    <li>• Wir verkaufen deine Daten nicht. Wir nutzen sie nicht zum KI-Training.</li>
                    <li>• Du kannst jederzeit deine Daten exportieren oder löschen lassen.</li>
                    <li>• KI-generierte Texte werden als solche gekennzeichnet — du prüfst vor dem Absenden.</li>
                </ul>
            </div>

            <div className="space-y-10">
                {/* 1. Verantwortliche Stelle */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">1. Verantwortliche Stelle (Controller)</h2>
                    <p className="mb-2">Verantwortlich für die Datenverarbeitung im Sinne der DSGVO:</p>
                    <div className="bg-[#F5F5F4] rounded-lg p-4 text-sm">
                        <p className="font-medium">Pathly</p>
                        <p className="text-[#73726E]">Yannik Galetto</p>
                        <p className="text-[#73726E]">E-Mail: kontakt@pathly.app</p>
                    </div>
                </section>

                {/* 2. Welche Daten wir erheben */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">2. Welche Daten wir erheben</h2>
                    <p className="mb-3">Wir erheben ausschließlich Daten, die für den Betrieb von Pathly erforderlich sind:</p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border border-[#E7E7E5] rounded-lg">
                            <thead>
                                <tr className="bg-[#F5F5F4]">
                                    <th className="text-left p-3 font-medium">Datenkategorie</th>
                                    <th className="text-left p-3 font-medium">Beispiele</th>
                                    <th className="text-left p-3 font-medium">Zweck</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E7E7E5]">
                                <tr>
                                    <td className="p-3">Account-Daten</td>
                                    <td className="p-3 text-[#73726E]">E-Mail-Adresse, Passwort (gehasht)</td>
                                    <td className="p-3 text-[#73726E]">Authentifizierung</td>
                                </tr>
                                <tr>
                                    <td className="p-3">Profil-Daten</td>
                                    <td className="p-3 text-[#73726E]">Name, Präferenzen, Werte</td>
                                    <td className="p-3 text-[#73726E]">Personalisierung der Bewerbungen</td>
                                </tr>
                                <tr>
                                    <td className="p-3">Dokumente</td>
                                    <td className="p-3 text-[#73726E]">Lebensläufe (CVs), Anschreiben</td>
                                    <td className="p-3 text-[#73726E]">Dokumentgenerierung und -optimierung</td>
                                </tr>
                                <tr>
                                    <td className="p-3">Nutzungsdaten</td>
                                    <td className="p-3 text-[#73726E]">Einwilligungen (Consent), IP-Adresse, User Agent</td>
                                    <td className="p-3 text-[#73726E]">DSGVO-Compliance, Sicherheit</td>
                                </tr>
                                <tr>
                                    <td className="p-3">Job-Daten</td>
                                    <td className="p-3 text-[#73726E]">Gesuchte Stellen, Bewerbungs-Historie</td>
                                    <td className="p-3 text-[#73726E]">Job-Matching, Bewerbungsverfolgung</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* 3. Rechtsgrundlage */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">3. Rechtsgrundlage der Verarbeitung</h2>
                    <ul className="space-y-2 text-sm">
                        <li><strong>Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung):</strong> Verarbeitung deiner Daten zur Erbringung der Pathly-Dienste (Dokumentgenerierung, Job-Matching).</li>
                        <li><strong>Art. 6 Abs. 1 lit. a DSGVO (Einwilligung):</strong> Für die KI-Verarbeitung deiner Daten holst du bei der Registrierung eine ausdrückliche Einwilligung.</li>
                        <li><strong>Art. 6 Abs. 1 lit. f DSGVO (Berechtigtes Interesse):</strong> Für Sicherheitsmaßnahmen (Logging, Betrugsschutz).</li>
                    </ul>
                </section>

                {/* 4. Weitergabe an Dritte / Sub-Processors */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">4. Weitergabe an Dritte & Auftragsverarbeiter</h2>
                    <p className="mb-3">Wir übermitteln deine Daten ausschließlich an folgende Dienstleister, die vertraglich zur Einhaltung der DSGVO verpflichtet sind:</p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border border-[#E7E7E5] rounded-lg">
                            <thead>
                                <tr className="bg-[#F5F5F4]">
                                    <th className="text-left p-3 font-medium">Anbieter</th>
                                    <th className="text-left p-3 font-medium">Zweck</th>
                                    <th className="text-left p-3 font-medium">Daten</th>
                                    <th className="text-left p-3 font-medium">Standort</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E7E7E5]">
                                <tr>
                                    <td className="p-3 font-medium">Supabase (AWS)</td>
                                    <td className="p-3 text-[#73726E]">Datenbank & Authentifizierung</td>
                                    <td className="p-3 text-[#73726E]">Alle User-Daten</td>
                                    <td className="p-3 text-[#73726E]">EU (Frankfurt)</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">Anthropic (Claude)</td>
                                    <td className="p-3 text-[#73726E]">KI-Textgenerierung (Anschreiben, CV-Analyse)</td>
                                    <td className="p-3 text-[#73726E]">CV-Inhalte, Stellenbeschreibungen</td>
                                    <td className="p-3 text-[#73726E]">USA (EU-SCC)</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">OpenAI</td>
                                    <td className="p-3 text-[#73726E]">Daten-Extraktion aus Stellenanzeigen</td>
                                    <td className="p-3 text-[#73726E]">Stellenanzeigen-Texte</td>
                                    <td className="p-3 text-[#73726E]">USA (EU-SCC)</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">Perplexity</td>
                                    <td className="p-3 text-[#73726E]">Unternehmensrecherche</td>
                                    <td className="p-3 text-[#73726E]">Firmennamen (keine PII)</td>
                                    <td className="p-3 text-[#73726E]">USA (EU-SCC)</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">SerpAPI</td>
                                    <td className="p-3 text-[#73726E]">Job-Suche</td>
                                    <td className="p-3 text-[#73726E]">Suchbegriffe (keine PII)</td>
                                    <td className="p-3 text-[#73726E]">USA (EU-SCC)</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">Vercel</td>
                                    <td className="p-3 text-[#73726E]">Hosting & CDN</td>
                                    <td className="p-3 text-[#73726E]">HTTP-Requests, IP-Adressen</td>
                                    <td className="p-3 text-[#73726E]">EU (Frankfurt)</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p className="text-sm text-[#73726E] mt-3">
                        Für US-basierte Anbieter bestehen EU-Standardvertragsklauseln (Standard Contractual Clauses / SCC) als Rechtsgrundlage für den Datentransfer.
                    </p>
                </section>

                {/* 5. KI-Transparenz */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">5. KI-Verarbeitung & Transparenz (EU AI Act)</h2>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <p className="text-sm font-medium text-blue-800 mb-2">Transparenzhinweis gemäß EU AI Act</p>
                        <p className="text-sm text-blue-700">
                            Pathly nutzt Künstliche Intelligenz zur Generierung von Bewerbungsschreiben und zur Analyse von Lebensläufen.
                            Alle KI-generierten Texte werden als solche gekennzeichnet.
                        </p>
                    </div>
                    <ul className="space-y-3 text-sm">
                        <li>
                            <strong>Kein Training mit deinen Daten:</strong> Wir und unsere KI-Partner (Anthropic, OpenAI) verwenden deine persönlichen Daten und Lebensläufe <em>nicht</em> zum Training von KI-Modellen.
                            Die API-Nutzung ist so konfiguriert, dass Training mit Nutzerdaten ausgeschlossen ist.
                        </li>
                        <li>
                            <strong>Menschliche Aufsicht (Human Oversight):</strong> KI-generierte Inhalte können Fehler enthalten.
                            Du bist verantwortlich, alle generierten Bewerbungen vor dem Absenden auf Richtigkeit zu prüfen.
                            Pathly sendet keine Bewerbung automatisch ab — du behältst immer die Kontrolle.
                        </li>
                        <li>
                            <strong>PII-Pseudonymisierung:</strong> Bevor dein Lebenslauf an KI-Modelle übermittelt wird,
                            werden personenbezogene Daten (Name, Adresse, Kontaktdaten) vom Inhalt getrennt und pseudonymisiert.
                        </li>
                    </ul>
                </section>

                {/* 6. Speicherung & Löschung */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">6. Speicherdauer & Löschung</h2>
                    <ul className="space-y-2 text-sm">
                        <li><strong>Account-Daten:</strong> Solange dein Account existiert.</li>
                        <li><strong>Dokumente (CVs, Anschreiben):</strong> Solange dein Account existiert. Bei Account-Löschung werden alle Dokumente innerhalb von 30 Tagen unwiderruflich gelöscht.</li>
                        <li><strong>Job-Daten & Bewerbungs-Historie:</strong> Solange dein Account existiert.</li>
                        <li><strong>KI-Verarbeitungsprotokolle:</strong> 90 Tage nach Erstellung (für Qualitätssicherung). Danach automatische Löschung.</li>
                        <li><strong>Consent-Historie:</strong> Wird aus rechtlichen Gründen (DSGVO Art. 7) auch nach Account-Löschung für 3 Jahre aufbewahrt.</li>
                    </ul>
                </section>

                {/* 7. Datensicherheit */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">7. Datensicherheit</h2>
                    <ul className="space-y-2 text-sm">
                        <li><strong>Verschlüsselung:</strong> Alle Daten werden im Ruhezustand mit AES-256 verschlüsselt. Die Übertragung erfolgt ausschließlich über TLS 1.3.</li>
                        <li><strong>Zugriffskontrolle:</strong> Row Level Security (RLS) stellt sicher, dass jeder Nutzer nur seine eigenen Daten sehen kann.</li>
                        <li><strong>Standort:</strong> Alle primären Daten werden in der EU (AWS Frankfurt, eu-central-1) gespeichert.</li>
                    </ul>
                </section>

                {/* 8. Deine Rechte */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">8. Deine Rechte (DSGVO Art. 12–22)</h2>
                    <p className="mb-3 text-sm">Du hast folgende Rechte bezüglich deiner personenbezogenen Daten:</p>
                    <ul className="space-y-2 text-sm">
                        <li><strong>Auskunftsrecht (Art. 15):</strong> Du kannst jederzeit Auskunft über deine gespeicherten Daten anfordern. Nutze dafür die Funktion &quot;Export My Data&quot; in den Sicherheitseinstellungen.</li>
                        <li><strong>Recht auf Berichtigung (Art. 16):</strong> Du kannst fehlerhafte Daten in deinen Einstellungen selbst korrigieren.</li>
                        <li><strong>Recht auf Löschung (Art. 17):</strong> Du kannst die Löschung deines Accounts und aller zugehörigen Daten beantragen.</li>
                        <li><strong>Recht auf Einschränkung (Art. 18):</strong> Du kannst die Einschränkung der Verarbeitung deiner Daten verlangen.</li>
                        <li><strong>Recht auf Datenübertragbarkeit (Art. 20):</strong> Du kannst deine Daten in einem maschinenlesbaren Format (JSON) exportieren.</li>
                        <li><strong>Widerspruchsrecht (Art. 21):</strong> Du kannst der Verarbeitung deiner Daten jederzeit widersprechen.</li>
                        <li><strong>Recht auf Widerruf der Einwilligung (Art. 7 Abs. 3):</strong> Du kannst deine Einwilligung zur KI-Verarbeitung jederzeit widerrufen.</li>
                    </ul>
                    <p className="text-sm text-[#73726E] mt-3">
                        Zur Ausübung deiner Rechte kontaktiere uns unter: <strong>kontakt@pathly.app</strong>
                    </p>
                </section>

                {/* 9. Beschwerderecht */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">9. Beschwerderecht bei der Aufsichtsbehörde</h2>
                    <p className="text-sm">
                        Du hast das Recht, dich bei einer Datenschutzaufsichtsbehörde zu beschweren,
                        wenn du der Meinung bist, dass die Verarbeitung deiner personenbezogenen Daten gegen die DSGVO verstößt.
                        Die zuständige Aufsichtsbehörde richtet sich nach deinem Wohnort bzw. dem Sitz des Verantwortlichen.
                    </p>
                </section>

                {/* 10. Cookies */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">10. Cookies</h2>
                    <p className="text-sm">
                        Pathly verwendet ausschließlich <strong>technisch notwendige Cookies</strong> für die Authentifizierung und Session-Verwaltung.
                        Es werden keine Tracking-Cookies, Analyse-Cookies oder Werbe-Cookies eingesetzt. Ein Cookie-Banner ist daher nicht erforderlich.
                    </p>
                </section>

                {/* 11. Änderungen */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">11. Änderungen dieser Datenschutzerklärung</h2>
                    <p className="text-sm">
                        Bei wesentlichen Änderungen an dieser Datenschutzerklärung wirst du per E-Mail oder per In-App-Benachrichtigung informiert
                        und ggf. um erneute Einwilligung gebeten. Die aktuelle Version ist immer unter{' '}
                        <span className="font-medium">/legal/privacy-policy</span> einsehbar.
                    </p>
                </section>
            </div>

            <div className="border-t border-[#E7E7E5] mt-10 pt-6 text-sm text-[#73726E]">
                <p>{t('last_updated')}</p>
            </div>
        </div>
    )
}

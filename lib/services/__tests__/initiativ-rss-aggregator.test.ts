/**
 * Regression-Suite für initiativ-rss-aggregator.ts
 *
 * Drei Test-Schichten:
 * 1. Pure functions: detectTriggerType, extractCompanyName, extractTriggerFromItem, deduplicateTriggers
 * 2. aggregateInitiativTriggers: Mock fetch + Mock Parser, Resilience bei Source-Down
 * 3. persistTriggersToDB: Mock SupabaseClient
 */

import {
    detectTriggerType,
    extractCompanyName,
    extractTriggerFromItem,
    deduplicateTriggers,
    aggregateInitiativTriggers,
    persistTriggersToDB,
    INITIATIV_RSS_SOURCES,
    type RawTrigger,
    type RssSource,
} from '../initiativ-rss-aggregator';

// ============================================================================
// detectTriggerType
// ============================================================================

describe('detectTriggerType', () => {
    it('erkennt funding (deutsche Patterns)', () => {
        expect(detectTriggerType('Berliner Startup XY sammelt 3 Mio Euro', '')).toBe('funding');
        expect(detectTriggerType('Pre-Seed-Runde abgeschlossen', '')).toBe('funding');
        expect(detectTriggerType('Series A für FinTech', '')).toBe('funding');
        expect(detectTriggerType('XY sichert sich 12 Mio Investition', '')).toBe('funding');
    });

    it('erkennt funding (englische Patterns)', () => {
        expect(detectTriggerType('XY raises Series B', '')).toBe('funding');
        expect(detectTriggerType('Berlin startup secures funding round', '')).toBe('funding');
    });

    it('erkennt merger', () => {
        expect(detectTriggerType('XY übernimmt Wettbewerber Z', '')).toBe('merger');
        expect(detectTriggerType('Akquisition: XY kauft Z', '')).toBe('merger');
        expect(detectTriggerType('XY acquires Z', '')).toBe('merger');
    });

    it('erkennt gf_change', () => {
        expect(detectTriggerType('XY ernennt neuen CEO', '')).toBe('gf_change');
        expect(detectTriggerType('Wechsel an der Spitze', '')).toBe('gf_change');
        expect(detectTriggerType('XY appoints new CTO', '')).toBe('gf_change');
        expect(detectTriggerType('CEO tritt zurück', '')).toBe('gf_change');
    });

    it('erkennt product_launch', () => {
        expect(detectTriggerType('XY launcht neues Produkt', '')).toBe('product_launch');
        expect(detectTriggerType('XY startet Plattform', '')).toBe('product_launch');
        expect(detectTriggerType('XY releases new tool', '')).toBe('product_launch');
    });

    it('default ist press_release wenn nichts matched', () => {
        expect(detectTriggerType('XY in der Presse', '')).toBe('press_release');
        expect(detectTriggerType('Allgemeine Nachricht', '')).toBe('press_release');
    });

    it('content snippet wird mit ausgewertet', () => {
        // Title alleine nicht eindeutig, snippet hilft
        expect(detectTriggerType('XY meldet Update', 'Series A für 5 Mio')).toBe('funding');
    });
});

// ============================================================================
// extractCompanyName
// ============================================================================

describe('extractCompanyName', () => {
    it('Pattern 2: Firmenname mit GmbH/AG-Suffix', () => {
        expect(extractCompanyName('Acme GmbH sammelt 3 Mio Euro')).toBe('Acme GmbH');
        expect(extractCompanyName('Berlin Tech AG übernimmt Konkurrenten')).toBe('Berlin Tech AG');
    });

    it('Pattern 3: Subjekt-Verb (sammelt, sichert, raised, übernimmt, ...)', () => {
        expect(extractCompanyName('Acme sammelt 3 Mio Euro')).toBe('Acme');
        expect(extractCompanyName('Berlin Tech sichert sich Investment')).toBe('Berlin Tech');
        expect(extractCompanyName('XY launcht Plattform')).toBe('XY');
    });

    it('Pattern 1: "Startup XY" Konstruktion', () => {
        expect(extractCompanyName('Berliner Startup Acme sammelt 3 Mio')).toBe('Acme');
    });

    it('Pattern 4 (Fallback): Capital-Cluster', () => {
        // Kein erkennbares Verb, aber Capital-Cluster am Anfang
        expect(extractCompanyName('Acme Berlin in den News')).toBe('Acme Berlin');
    });

    it('rejected ultra-generische Words', () => {
        expect(extractCompanyName('Der Markt wächst')).toBeNull();
        expect(extractCompanyName('Die Wirtschaft brummt')).toBeNull();
        expect(extractCompanyName('The big news')).toBeNull();
    });

    it('rejected leeres / sehr kurzes Title', () => {
        expect(extractCompanyName('')).toBeNull();
        expect(extractCompanyName('XY')).toBeNull();
    });

    it('Umlaute werden korrekt erkannt', () => {
        expect(extractCompanyName('Süddeutsche Tech GmbH startet Produkt')).toBe('Süddeutsche Tech GmbH');
    });

    it('cap auf MAX_COMPANY_LENGTH', () => {
        const longName = 'A'.repeat(200);
        const result = extractCompanyName(`${longName} sammelt Geld`);
        if (result) expect(result.length).toBeLessThanOrEqual(120);
    });

    // ------------------------------------------------------------------
    // Regression: live DEV-rows 2026-05-10
    // 7 known bug-classes from real RSS data; each MUST behave correctly
    // after the heuristic-hardening Welle 3a.5.
    // ------------------------------------------------------------------

    describe('Regression Welle 3a.5 — geo-prefix stripping', () => {
        it('"Delft-based FrostByte secures..." → "FrostByte"', () => {
            expect(extractCompanyName('Delft-based FrostByte secures a cool €1.3 million to scale cryogenic electronics')).toBe('FrostByte');
        });

        it('"London-based CodeWords raises..." → "CodeWords"', () => {
            expect(extractCompanyName('London-based CodeWords raises €7.6 million to help businesses run on AI autopilot')).toBe('CodeWords');
        });

        it('"London-based Laka sets M&A..." → "Laka"', () => {
            expect(extractCompanyName('London-based Laka sets M&A strategy in motion with acquisition of VeloLife')).toBe('Laka');
        });

        it('Berlin-Brandenburg-based Foo bleibt nach Strip = "Foo"', () => {
            expect(extractCompanyName('Berlin-Brandenburg-based Foo raises seed')).toBe('Foo');
        });

        it('case-insensitive geo-strip', () => {
            expect(extractCompanyName('Munich-based Bar startet Plattform')).toBe('Bar');
        });
    });

    describe('Regression Welle 3a.5 — determiner-led headline-noise', () => {
        it('"Dieses Startup erhöht jedes Jahr..." → null', () => {
            expect(extractCompanyName('Dieses Startup erhöht jedes Jahr automatisch die Gehälter aller Mitarbeiter')).toBeNull();
        });

        it('"Die KI-Revolution frisst ihre Kinder: Deepl..." → null', () => {
            expect(extractCompanyName('Die KI-Revolution frisst ihre Kinder: Deepl streicht 250 Mitarbeiter')).toBeNull();
        });

        it('"Ein Wort bringt ein Berliner KI-Startup..." → null', () => {
            expect(extractCompanyName('Ein Wort bringt ein Berliner KI-Startup jetzt vor Gericht: „Steuerberater"')).toBeNull();
        });

        it('"Diese Firma wird nicht überleben" → null', () => {
            expect(extractCompanyName('Diese Firma wird nicht überleben')).toBeNull();
        });

        it('Defense: "Die Foo GmbH übernimmt" — Suffix vorhanden → kept', () => {
            expect(extractCompanyName('Die Foo GmbH übernimmt Konkurrenten')).toBe('Die Foo GmbH');
        });
    });

    describe('Regression Welle 3a.5 — person-title stripping & person-name reject', () => {
        it('"Food-Influencer Stefano Zarrella bringt..." → null (person, kein Company)', () => {
            expect(extractCompanyName('Food-Influencer Stefano Zarrella bringt Tiefkühlpizza für 6,50 Euro auf den Markt')).toBeNull();
        });

        it('"CEO Max Mustermann tritt zurück" → null (Person)', () => {
            // Pattern C ('tritt zurück' im COMPANY_VERB-Set) matched → "CEO Max Mustermann" → strip → "Max Mustermann" → person → null
            expect(extractCompanyName('CEO Max Mustermann tritt zurück')).toBeNull();
        });

        it('"Gründer Anna Schmidt launcht Plattform" → null (Person)', () => {
            expect(extractCompanyName('Gründer Anna Schmidt launcht Plattform')).toBeNull();
        });

        it('Defense: "Anna Schmidt GmbH übernimmt" — Suffix → kept', () => {
            expect(extractCompanyName('Anna Schmidt GmbH übernimmt Konkurrenten')).toBe('Anna Schmidt GmbH');
        });
    });

    describe('Regression Welle 3a.5 — defense for previously-correct extractions', () => {
        it('"Wie das KI-Startup Logicc in nur 6,5 Monaten..." → "Logicc"', () => {
            expect(extractCompanyName('Wie das KI-Startup Logicc in nur 6,5 Monaten die erste Million ARR knackte')).toBe('Logicc');
        });

        it('"SAP kauft deutsches KI-Startup Prior Labs..." → "Prior Labs"', () => {
            expect(extractCompanyName('SAP kauft deutsches KI-Startup Prior Labs – und will über eine Milliarde Euro investieren')).toBe('Prior Labs');
        });

        it('"Berlin Tech AG übernimmt..." bleibt "Berlin Tech AG"', () => {
            expect(extractCompanyName('Berlin Tech AG übernimmt Konkurrenten')).toBe('Berlin Tech AG');
        });
    });
});

// ============================================================================
// extractTriggerFromItem
// ============================================================================

describe('extractTriggerFromItem', () => {
    const source: RssSource = { name: 'test-feed', url: 'https://test.example/feed' };

    it('happy path: vollständiges Item', () => {
        const item = {
            title: 'Acme GmbH sammelt 5 Mio Euro Series A',
            link: 'https://test.example/news/1',
            isoDate: '2026-05-09T08:00:00Z',
            contentSnippet: 'Berliner Tech-Startup hat eine Series-A-Runde abgeschlossen',
        };

        const trigger = extractTriggerFromItem(item, source);
        expect(trigger).not.toBeNull();
        expect(trigger!.triggerType).toBe('funding');
        expect(trigger!.companyName).toBe('Acme GmbH');
        expect(trigger!.sourceUrl).toBe('https://test.example/news/1');
        expect(trigger!.sourceName).toBe('test-feed');
        expect(trigger!.triggerDate).toBe('2026-05-09T08:00:00.000Z');
    });

    it('null bei fehlendem title', () => {
        const item = { link: 'https://x.example/1', isoDate: '2026-05-09T08:00:00Z' };
        expect(extractTriggerFromItem(item, source)).toBeNull();
    });

    it('null bei fehlendem link', () => {
        const item = { title: 'Acme sammelt Geld', isoDate: '2026-05-09T08:00:00Z' };
        expect(extractTriggerFromItem(item, source)).toBeNull();
    });

    it('null bei nicht erkennbarer Firma', () => {
        const item = {
            title: 'Der Markt wächst weiter',
            link: 'https://x.example/1',
            isoDate: '2026-05-09T08:00:00Z',
        };
        expect(extractTriggerFromItem(item, source)).toBeNull();
    });

    it('default-date wenn kein pubDate vorhanden (Heute)', () => {
        const item = {
            title: 'Acme sammelt 3 Mio',
            link: 'https://x.example/1',
        };
        const trigger = extractTriggerFromItem(item, source);
        expect(trigger).not.toBeNull();
        // Datum sollte irgendwo in den letzten 24h liegen (jetzt = default)
        const ageMs = Date.now() - new Date(trigger!.triggerDate).getTime();
        expect(ageMs).toBeGreaterThanOrEqual(0);
        expect(ageMs).toBeLessThan(24 * 60 * 60 * 1000);
    });

    it('null bei invalid date', () => {
        const item = {
            title: 'Acme sammelt 3 Mio',
            link: 'https://x.example/1',
            isoDate: 'totally-not-a-date',
        };
        expect(extractTriggerFromItem(item, source)).toBeNull();
    });

    it('summary cap auf MAX_SUMMARY_LENGTH', () => {
        const item = {
            title: 'Acme sammelt 3 Mio',
            link: 'https://x.example/1',
            isoDate: '2026-05-09T08:00:00Z',
            contentSnippet: 'a'.repeat(5000),
        };
        const trigger = extractTriggerFromItem(item, source);
        expect(trigger!.triggerSummary.length).toBeLessThanOrEqual(500);
    });
});

// ============================================================================
// deduplicateTriggers
// ============================================================================

describe('deduplicateTriggers', () => {
    const baseTrigger: RawTrigger = {
        triggerType: 'funding',
        companyName: 'Acme',
        sourceUrl: 'https://x.example/1',
        sourceName: 'test',
        triggerDate: '2026-05-09T08:00:00Z',
        triggerSummary: 'foo',
        rawContent: { title: 'Acme funding', feedSource: 'test' },
    };

    it('entfernt exakte Duplikate (gleiche source_url + type + company)', () => {
        const triggers = [baseTrigger, baseTrigger, baseTrigger];
        expect(deduplicateTriggers(triggers)).toHaveLength(1);
    });

    it('behält unterschiedliche company-namen auf gleicher URL', () => {
        const triggers = [
            baseTrigger,
            { ...baseTrigger, companyName: 'Beta' },
        ];
        expect(deduplicateTriggers(triggers)).toHaveLength(2);
    });

    it('Case-insensitive Dedup auf Firmenname', () => {
        const triggers = [
            baseTrigger,
            { ...baseTrigger, companyName: 'ACME' },
            { ...baseTrigger, companyName: 'acme' },
        ];
        expect(deduplicateTriggers(triggers)).toHaveLength(1);
    });

    it('leeres Array bleibt leer', () => {
        expect(deduplicateTriggers([])).toEqual([]);
    });
});

// ============================================================================
// aggregateInitiativTriggers
// ============================================================================

describe('aggregateInitiativTriggers', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('eine Source down → andere Sources werden trotzdem geliefert', async () => {
        global.fetch = jest.fn(async (url: any) => {
            const urlStr = String(url);
            if (urlStr.includes('source-a')) {
                return new Response('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Test Feed</title><link>https://test.example</link><description>Test</description><item><title>Acme sammelt 3 Mio</title><link>https://x/1</link><pubDate>Fri, 09 May 2026 08:00:00 GMT</pubDate></item></channel></rss>', {
                    status: 200,
                    headers: { 'content-type': 'application/rss+xml' },
                });
            }
            if (urlStr.includes('source-b')) {
                return new Response('boom', { status: 500 });
            }
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch;

        const sources: RssSource[] = [
            { name: 'source-a', url: 'https://test.example/source-a/feed' },
            { name: 'source-b', url: 'https://test.example/source-b/feed' },
        ];

        const triggers = await aggregateInitiativTriggers(sources);
        expect(triggers.length).toBeGreaterThanOrEqual(1);
        expect(triggers[0].sourceName).toBe('source-a');
    });

    it('alle Sources down → leeres Array (keine Exception)', async () => {
        global.fetch = jest.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;

        const sources: RssSource[] = [
            { name: 'a', url: 'https://test.example/a' },
            { name: 'b', url: 'https://test.example/b' },
        ];

        const triggers = await aggregateInitiativTriggers(sources);
        expect(triggers).toEqual([]);
    });

    it('Production-Sources sind die 3 lean v1 Feeds', () => {
        expect(INITIATIV_RSS_SOURCES.map((s) => s.name).sort()).toEqual([
            'deutsche-startups.de',
            'eu-startups.com',
            'gruenderszene.de',
        ]);
    });

    it('dedupliziert Trigger über Sources hinweg', async () => {
        global.fetch = jest.fn(async () => {
            return new Response(
                '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Test Feed</title><link>https://test.example</link><description>Test</description><item><title>Acme sammelt 3 Mio</title><link>https://x/1</link><pubDate>Fri, 09 May 2026 08:00:00 GMT</pubDate></item></channel></rss>',
                { status: 200, headers: { 'content-type': 'application/rss+xml' } },
            );
        }) as unknown as typeof fetch;

        // Beide Sources liefern denselben Item (gleiche URL) → Dedup auf 1
        const sources: RssSource[] = [
            { name: 'a', url: 'https://test.example/a' },
            { name: 'b', url: 'https://test.example/b' },
        ];

        const triggers = await aggregateInitiativTriggers(sources);
        expect(triggers).toHaveLength(1);
    });
});

// ============================================================================
// persistTriggersToDB
// ============================================================================

describe('persistTriggersToDB', () => {
    const sampleTrigger: RawTrigger = {
        triggerType: 'funding',
        companyName: 'Acme',
        sourceUrl: 'https://x.example/1',
        sourceName: 'test',
        triggerDate: '2026-05-09T08:00:00Z',
        triggerSummary: 'foo',
        rawContent: { title: 'Acme', feedSource: 'test' },
    };

    function makeMockSupabase(error: Error | null = null) {
        const upsert = jest.fn().mockResolvedValue({ error, count: error ? 0 : 1 });
        const from = jest.fn().mockReturnValue({ upsert });
        return {
            client: { from } as any,
            from,
            upsert,
        };
    }

    it('leeres Trigger-Array → 0/0/0, kein DB-Call', async () => {
        const { client, from } = makeMockSupabase();
        const result = await persistTriggersToDB([], client);
        expect(result).toEqual({ attempted: 0, persisted: 0, errors: 0 });
        expect(from).not.toHaveBeenCalled();
    });

    it('happy path: 1 trigger upgesertet', async () => {
        const { client, from, upsert } = makeMockSupabase();
        const result = await persistTriggersToDB([sampleTrigger], client);
        expect(from).toHaveBeenCalledWith('initiativ_triggers');
        expect(upsert).toHaveBeenCalledTimes(1);
        expect(upsert.mock.calls[0][1]).toMatchObject({
            onConflict: 'source_url,trigger_type,company_name',
            ignoreDuplicates: true,
        });
        expect(result.attempted).toBe(1);
        expect(result.persisted).toBe(1);
        expect(result.errors).toBe(0);
    });

    it('batch-Size von 20 wird respektiert (50 triggers → 3 batches)', async () => {
        const { client, upsert } = makeMockSupabase();
        const triggers: RawTrigger[] = Array.from({ length: 50 }, (_, i) => ({
            ...sampleTrigger,
            sourceUrl: `https://x.example/${i}`,
        }));
        await persistTriggersToDB(triggers, client);
        expect(upsert).toHaveBeenCalledTimes(3); // 20 + 20 + 10
    });

    it('DB-Error in einem batch → errors += batchSize, andere batches laufen', async () => {
        const upsert = jest.fn()
            .mockResolvedValueOnce({ error: new Error('boom'), count: 0 })
            .mockResolvedValueOnce({ error: null, count: 5 });
        const from = jest.fn().mockReturnValue({ upsert });
        const client = { from } as any;

        const triggers: RawTrigger[] = Array.from({ length: 25 }, (_, i) => ({
            ...sampleTrigger,
            sourceUrl: `https://x.example/${i}`,
        }));
        const result = await persistTriggersToDB(triggers, client);
        expect(result.attempted).toBe(25);
        expect(result.errors).toBe(20); // erster batch failed
        expect(result.persisted).toBe(5); // zweiter batch ok
    });
});

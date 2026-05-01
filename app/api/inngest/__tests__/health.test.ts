// Integration test — requires dev server on localhost:3000.
// Skipped in CI to remove the long-standing flake from `npm test`.
// Run manually with `RUN_LIVE=1 npm test -- health.test` while `npm run dev` is up.
const liveTest = process.env.RUN_LIVE === '1' ? test : test.skip;

liveTest('Inngest API health check (GET /api/inngest)', async () => {
    const response = await fetch('http://localhost:3000/api/inngest');
    expect(response.status).toBe(200);
});

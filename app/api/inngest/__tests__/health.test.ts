test('Inngest API health check (GET /api/inngest)', async () => {
    // Assumes dev server is running on localhost:3000
    // This is an integration test.
    try {
        const response = await fetch('http://localhost:3000/api/inngest', {
            method: 'GET',
        });

        // Inngest GET usually returns "Inngest API is running" or similar status 200
        expect(response.status).toBe(200);
    } catch (error) {
        console.error('Fetch Error:', error);
        // Fail manually if fetch fails (e.g. server not running)
        throw new Error('Could not connect to http://localhost:3000/api/inngest. Is the dev server running?');
    }
});

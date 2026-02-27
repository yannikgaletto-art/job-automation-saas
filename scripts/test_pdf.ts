import http from 'http';

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/cv/download?jobId=f5065135-e416-4c11-b225-018f360fe67a&type=cv',
    method: 'GET',
    headers: {
        'Cookie': 'sb-localhost-auth-token=...', // Need to bypass auth for testing or grab the cookie or just temporarily remove auth from the route
    }
};
// Actually it's easier to just temporarily remove the auth check in the route for a split second to test it, or run a test function.

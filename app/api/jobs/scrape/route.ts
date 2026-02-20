import { NextResponse } from 'next/server';

export async function POST() {
    return NextResponse.json(
        {
            error: 'Gone',
            message: 'Scraping has been discontinued. Use /api/jobs/ingest instead.'
        },
        { status: 410 }
    );
}

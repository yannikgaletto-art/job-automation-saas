import { generateCoverLetter } from '@/lib/services/cover-letter-generator';

export async function POST(request: Request) {
    const { userId, jobId } = await request.json();

    try {
        const result = await generateCoverLetter(userId, jobId);

        return Response.json({
            success: true,
            coverLetter: result.coverLetter,
            cost: result.costCents / 100,
            model: result.model,
        });
    } catch (error: any) {
        return Response.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

import { createClient as createAdminClient } from '@supabase/supabase-js';
import { VideoViewTracker } from './video-view-tracker';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PageProps {
    params: Promise<{ token: string }>;
}

export default async function VideoLandingPage({ params }: PageProps) {
    const { token } = await params;

    // Lookup video by access_token (no auth — public page)
    const { data: video, error } = await supabaseAdmin
        .from('video_approaches')
        .select('status, storage_path, expires_at, view_count, first_viewed_at')
        .eq('access_token', token)
        .maybeSingle();

    // Not found or error
    if (error || !video) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center max-w-sm p-8">
                    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h1 className="text-lg font-semibold text-gray-900 mb-2">Video nicht gefunden</h1>
                    <p className="text-sm text-gray-500">Dieses Video existiert nicht oder ist nicht mehr verfügbar.</p>
                </div>
            </div>
        );
    }

    // Expired
    if (video.status === 'expired') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center max-w-sm p-8">
                    <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-lg font-semibold text-gray-900 mb-2">Dieses Video ist nicht mehr verfügbar</h1>
                    <p className="text-sm text-gray-500">Videos sind für 14 Tage abrufbar und werden danach automatisch gelöscht.</p>
                </div>
            </div>
        );
    }

    // Not yet uploaded
    if (video.status !== 'uploaded' || !video.storage_path) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center max-w-sm p-8">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                        <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h1 className="text-lg font-semibold text-gray-900 mb-2">Video wird vorbereitet</h1>
                    <p className="text-sm text-gray-500">Dieses Video wurde noch nicht hochgeladen. Bitte versuche es später erneut.</p>
                </div>
            </div>
        );
    }

    // Uploaded — generate signed playback URL (1h validity)
    const { data: signedUrl } = await supabaseAdmin.storage
        .from('videos')
        .createSignedUrl(video.storage_path, 3600);

    if (!signedUrl?.signedUrl) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center max-w-sm p-8">
                    <h1 className="text-lg font-semibold text-gray-900 mb-2">Fehler beim Laden</h1>
                    <p className="text-sm text-gray-500">Das Video konnte nicht geladen werden. Bitte versuche es später erneut.</p>
                </div>
            </div>
        );
    }

    const expiryDate = video.expires_at
        ? new Date(video.expires_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center p-4">
            {/*
              Fire view tracking on client side.
              This increments view_count and sets first_viewed_at in the DB.
              Rendered after the video player so tracking never blocks playback.
            */}
            <VideoViewTracker token={token} />

            <div className="w-full max-w-2xl">
                {/* Video Player */}
                <div className="bg-black rounded-xl overflow-hidden shadow-2xl">
                    <video
                        src={signedUrl.signedUrl}
                        controls
                        autoPlay={false}
                        playsInline
                        className="w-full aspect-video"
                        controlsList="nodownload"
                    />
                </div>

                {/* Info */}
                <div className="mt-4 text-center">
                    <p className="text-xs text-gray-400">
                        Video-Vorstellung · Powered by Pathly
                        {expiryDate && ` · Verfügbar bis ${expiryDate}`}
                    </p>
                </div>
            </div>
        </div>
    );
}

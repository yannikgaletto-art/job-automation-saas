import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FeedbackVoiceClient } from './FeedbackVoiceClient';

export default async function FeedbackPage() {
    // Auth guard — redirect to login if not authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        redirect('/login');
    }

    return <FeedbackVoiceClient />;
}

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { InitiativClientPage } from './client-page';

export default async function InitiativPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    return <InitiativClientPage />;
}

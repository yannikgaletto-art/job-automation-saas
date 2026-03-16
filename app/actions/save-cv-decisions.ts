'use server'

import { createClient } from '@/lib/supabase/server';
import { UserDecisions, CvOptimizationProposal } from '@/types/cv';

export async function saveCvDecisions(
    jobId: string,
    decisions: UserDecisions,
    proposal: CvOptimizationProposal
): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient();

        // §8: Auth Guard — verify session before any write
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return { success: false, error: 'Not authenticated' };
        }

        // §3: User-scoped write — defense-in-depth alongside RLS
        const { error } = await supabase
            .from('job_queue')
            .update({
                cv_optimization_user_decisions: decisions,
                cv_optimization_proposal: proposal,
                status: 'cv_optimized',
            })
            .eq('id', jobId)
            .eq('user_id', user.id);

        if (error) {
            console.error('❌ Failed to save CV decisions:', error);
            return { success: false, error: error.message };
        }

        console.log(`✅ UserDecisions saved successfully for job ${jobId}`);
        return { success: true };
    } catch (err: any) {
        console.error('❌ Exception in saveCvDecisions:', err);
        return { success: false, error: err.message || 'Unknown error occurred' };
    }
}

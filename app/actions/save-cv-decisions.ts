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

        const { error } = await supabase
            .from('job_queue')
            .update({
                cv_optimization_user_decisions: decisions,
                cv_optimization_proposal: proposal
            })
            .eq('id', jobId);

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

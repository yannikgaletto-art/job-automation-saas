/**
 * One-time cache flush script for cv_match_result_cache.
 * Forces recalculation with the new prompt (dimension-level Gap Census,
 * ecosystem hints, coaching labels).
 * 
 * Run: npx tsx tmp/flush-match-cache.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function flush() {
    console.log('🔄 Counting cached CV match results...');
    
    const { count, error: countErr } = await supabase
        .from('cv_match_result_cache')
        .select('*', { count: 'exact', head: true });
    
    if (countErr) {
        console.error('❌ Count failed:', countErr.message);
        process.exit(1);
    }
    
    console.log(`📊 Found ${count} cached results.`);
    
    if (!count || count === 0) {
        console.log('✅ Cache already empty — nothing to flush.');
        return;
    }
    
    // Delete all cached results
    const { error: deleteErr } = await supabase
        .from('cv_match_result_cache')
        .delete()
        .neq('input_hash', '___impossible___'); // Supabase requires a filter for delete
    
    if (deleteErr) {
        console.error('❌ Delete failed:', deleteErr.message);
        process.exit(1);
    }
    
    // Verify
    const { count: afterCount } = await supabase
        .from('cv_match_result_cache')
        .select('*', { count: 'exact', head: true });
    
    console.log(`✅ Cache flushed! ${count} → ${afterCount ?? 0} entries.`);
    console.log('ℹ️  Next CV Match analysis will use the new prompt with:');
    console.log('   • Dimension-level Gap Census (no over-counting)');
    console.log('   • Ecosystem hints (related skills context)');
    console.log('   • Coaching labels (Fokus auf Nuancen / Grundgerüst steht / Wir fixen das)');
    console.log('   • Mandatory additionalChips on every card');
}

flush().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});

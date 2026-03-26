const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function check() {
  const { data, error } = await supabase
    .from('job_queue')
    .select('id, job_title, status, cv_optimization_user_decisions, cv_optimization_proposal, metadata')
    .order('created_at', { ascending: false })
    .limit(3);
    
  if (error) {
    console.error("DB Error:", error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log("No jobs found");
    return;
  }
  
  data.forEach((job, i) => {
    console.log(`\nJob ${i+1}: ${job.job_title} (ID: ${job.id})`);
    console.log(`Status DB       : ${job.status}`);
    console.log(`Has User Dec    : ${!!job.cv_optimization_user_decisions}`);
    console.log(`Has Proposal    : ${!!job.cv_optimization_proposal}`);
    console.log(`Metadata Status : ${job.metadata?.cv_match_status}`);
  });
}

check();

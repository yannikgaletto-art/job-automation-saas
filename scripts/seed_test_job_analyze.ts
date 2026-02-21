import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function run() {
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    if (userError || !users.users.length) {
        console.error("Error getting users:", userError);
        return;
    }
    const userId = users.users[0].id;

    const desc = `Gesucht wird ein Fullstack Entwickler.
Aufgaben: 
- Entwicklung von Web-Anwendungen mit React und Node.js
- Schreiben von automatisierten Tests
- Betreuung der CI/CD Pipeline
- Enge Zusammenarbeit mit dem Produktmanagement

Profil:
- Mehrjährige Erfahrung in TypeScript und Node.js
- Kenntnisse in Docker, Kubernetes und AWS
- Fließende Deutsch- und Englischkenntnisse

Wir bieten ein flexibles, hybrides Arbeitsmodell (Home Office möglich) sowie regelmäßige Teamevents. Unser Weiterbildungsbudget lässt dir Freiraum für Zertifikate (AWS, CKA). Ein modernes MacBook Pro bekommst du als Ausstattung.
Standort: Remote`;

    const { data, error } = await supabase
        .from('job_queue')
        .insert({
            user_id: userId,
            company_name: 'Tech Innovations GmbH',
            job_title: 'Senior Fullstack Engineer',
            job_url: 'https://example.com/job-2',
            description: desc,
            status: 'pending',
            user_profile_id: userId
        });
    if (error) console.error("Error inserting:", error);
    else console.log("Inserted test job for analysis.");
}
run();

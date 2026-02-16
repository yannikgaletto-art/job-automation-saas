
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function seedDatabase() {
    console.log("🌱 Seeding form_selectors...");

    const selectors = [
        // Greenhouse
        { platform_name: 'greenhouse', field_name: 'first_name', css_selector: 'input[id="first_name"]' },
        { platform_name: 'greenhouse', field_name: 'last_name', css_selector: 'input[id="last_name"]' },
        { platform_name: 'greenhouse', field_name: 'email', css_selector: 'input[id="email"]' },
        { platform_name: 'greenhouse', field_name: 'phone', css_selector: 'input[id="phone"]' },
        { platform_name: 'greenhouse', field_name: 'resume', css_selector: 'input[type="file"][name="resume"]' },
        { platform_name: 'greenhouse', field_name: 'cover_letter', css_selector: 'textarea[id="cover_letter_text"]' },

        // Lever
        { platform_name: 'lever', field_name: 'first_name', css_selector: 'input[name="name"]' },
        { platform_name: 'lever', field_name: 'email', css_selector: 'input[name="email"]' },
        { platform_name: 'lever', field_name: 'phone', css_selector: 'input[name="phone"]' },
        { platform_name: 'lever', field_name: 'resume', css_selector: 'input[type="file"][name="resume"]' },
        { platform_name: 'lever', field_name: 'cover_letter', css_selector: 'textarea[name="cards[additional-information]"]' },

        // Workday
        { platform_name: 'workday', field_name: 'first_name', css_selector: 'input[data-automation-id="legalNameSection_firstName"]' },
        { platform_name: 'workday', field_name: 'last_name', css_selector: 'input[data-automation-id="legalNameSection_lastName"]' },
        { platform_name: 'workday', field_name: 'email', css_selector: 'input[data-automation-id="email"]' },
        { platform_name: 'workday', field_name: 'phone', css_selector: 'input[data-automation-id="phone-device-landLine"]' },
        { platform_name: 'workday', field_name: 'resume', css_selector: 'input[type="file"][data-automation-id="file-upload-input"]' },

        // LinkedIn
        { platform_name: 'linkedin', field_name: 'phone', css_selector: 'input[id*="phoneNumber"]' },
        { platform_name: 'linkedin', field_name: 'resume', css_selector: 'input[type="file"][name="file"]' }
    ];

    const { data, error } = await supabase
        .from('form_selectors')
        .insert(selectors)
        .select();

    if (error) {
        console.error("❌ Error seeding data:", error.message);
    } else {
        console.log(`✅ Seeded ${data.length} selectors successfully.`);
    }
}

seedDatabase();

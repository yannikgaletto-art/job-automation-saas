
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase URL or Service Role Key in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function createAdminUser() {
    const email = 'admin@pathly.demo'
    const password = 'pathly-admin-password-2024'

    console.log(`Attempting to create user: ${email}...`)

    const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: 'Pathly Admin' }
    })

    if (error) {
        console.error('Error creating user:', error.message)
        return
    }

    console.log('✅ User created successfully!')
    console.log('------------------------------------------------')
    console.log(`Email:    ${email}`)
    console.log(`Password: ${password}`)
    console.log('------------------------------------------------')
    console.log('You can now log in at http://localhost:3000/login')
}

createAdminUser()

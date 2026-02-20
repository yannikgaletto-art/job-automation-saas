
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

async function initStorage() {
    console.log('Initializing Supabase Storage Buckets...')

    const buckets = ['cvs', 'cover-letters']

    for (const bucket of buckets) {
        console.log(`Checking bucket: ${bucket}...`)
        const { data, error } = await supabase.storage.getBucket(bucket)

        if (error && error.message.includes('not found')) {
            console.log(`Bucket ${bucket} not found. Creating...`)
            const { data: newBucket, error: createError } = await supabase.storage.createBucket(bucket, {
                public: false,
                fileSizeLimit: 5242880, // 5MB
                allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
            })

            if (createError) {
                console.error(`Failed to create bucket ${bucket}:`, createError.message)
            } else {
                console.log(`✅ Bucket ${bucket} created successfully!`)
            }
        } else if (data) {
            console.log(`Bucket ${bucket} already exists.`)
        } else {
            console.error(`Error checking bucket ${bucket}:`, error?.message)
        }
    }
}

initStorage()

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
    const { data } = await supabase.from('orders').select('order_number').order('created_at', { ascending: false }).limit(1)
    console.log('Latest Order Number:', data?.[0]?.order_number)
}

test()

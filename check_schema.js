const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function checkSchema() {
    const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .limit(1)
        
    if (error) {
        console.error('Error:', error)
        return
    }
    
    if (data && data.length > 0) {
        console.log('Columns in system_settings:')
        console.log(Object.keys(data[0]))
        
        console.log('\nData:')
        console.log(JSON.stringify(data[0], null, 2))
    } else {
        console.log('No data found in system_settings')
    }
}

checkSchema()

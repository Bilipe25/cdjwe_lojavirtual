const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function insertTest() {
    const { error } = await supabase
        .from('system_settings')
        .insert({
            system_name: 'Teste Local',
            min_order_amount: 10,
            default_delivery_days: 15,
            show_prices_to_unapproved: true,
            logo_url: 'teste.png',
            whatsapp: '11999999999',
            instagram: 'insta',
            facebook: 'face'
        })
        
    console.log('Insert error:', error)
}

insertTest()

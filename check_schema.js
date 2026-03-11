require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('price_table_items').select('*').limit(1);
  console.log('price_table_items error:', error?.message);
  
  // also check if cart/actions fails.
  const { data: cols } = await supabase.rpc('get_columns_for', { table_name: 'price_table_items' }).catch(() => ({data: 'rpc error'}));
  console.log('Columns helper:', cols);
}
check();

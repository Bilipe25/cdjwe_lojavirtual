require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase
    .from('product_variants')
    .select(`
        *,
        product:products(*),
        fabric:fabrics(*),
        fabric_color:fabric_colors(*)
    `)
    .limit(5);
  console.log(JSON.stringify({ data, error }, null, 2));
}
check();

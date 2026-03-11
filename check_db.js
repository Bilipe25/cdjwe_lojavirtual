require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: pData } = await supabase.from('products').select('*').limit(3);
  const { data: fData } = await supabase.from('fabrics').select('*').limit(3);
  console.log('Products:', pData?.length);
  console.log('Fabrics:', fData?.length);
}
check();

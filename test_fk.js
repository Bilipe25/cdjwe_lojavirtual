require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testFK() {
  const { data: tables } = await supabase.from('price_tables').select('id').limit(1);
  if (!tables || tables.length === 0) {
     console.log('No price tables found'); return;
  }
  const { data: products } = await supabase.from('products').select('id').limit(1);
  if (!products || products.length === 0) {
     console.log('No products found'); return;
  }
  
  const { error } = await supabase.from('price_table_items').insert({
    price_table_id: tables[0].id,
    product_variant_id: products[0].id, // Try to insert a product ID into a variant column
    custom_price: 100
  });
  
  console.log('Insert error:', error ? error.message : 'SUCCESS! No FK constraint or it accepted it.');
  
  if (!error) {
    // cleanup
    await supabase.from('price_table_items').delete().eq('product_variant_id', products[0].id);
  }
}
testFK();

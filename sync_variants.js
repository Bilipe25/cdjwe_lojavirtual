require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function sync() {
    console.log('Fetching products, fabrics and colors...');
    
    // 1. Get all active items
    const { data: products } = await supabase.from('products').select('id, is_active');
    const { data: fabrics } = await supabase.from('fabrics').select('id, is_active');
    const { data: colors } = await supabase.from('fabric_colors').select('id, fabric_id, is_active');
    
    console.log(`Found ${products?.length || 0} products, ${fabrics?.length || 0} fabrics, ${colors?.length || 0} colors.`);
    
    if (!products?.length || !fabrics?.length || !colors?.length) {
        console.log('Missing basic data to create combinations.');
        return;
    }

    // 2. Fetch existing variants to avoid duplicates
    const { data: existingVars } = await supabase.from('product_variants').select('product_id, fabric_id, fabric_color_id');
    const existingSet = new Set(existingVars?.map(v => `${v.product_id}-${v.fabric_id}-${v.fabric_color_id}`) || []);

    // 3. Build new variants
    const newVariants = [];
    
    for (const p of products) {
        for (const c of colors) {
            const key = `${p.id}-${c.fabric_id}-${c.id}`;
            if (!existingSet.has(key)) {
                newVariants.push({
                    product_id: p.id,
                    fabric_id: c.fabric_id,
                    fabric_color_id: c.id,
                    stock_quantity: 999, // default
                    is_active: p.is_active && c.is_active
                });
            }
        }
    }
    
    if (newVariants.length > 0) {
        console.log(`Inserting ${newVariants.length} missing combinations into product_variants...`);
        // Batch insert in chunks of 500
        const chunkSize = 500;
        for (let i = 0; i < newVariants.length; i += chunkSize) {
            const chunk = newVariants.slice(i, i + chunkSize);
            const { error } = await supabase.from('product_variants').insert(chunk);
            if (error) {
                console.error('Insert error:', error.message);
            } else {
                console.log(`Successfully inserted chunk ${i / chunkSize + 1}.`);
            }
        }
    } else {
        console.log('No missing combinations. Already fully synced.');
    }
}
sync();

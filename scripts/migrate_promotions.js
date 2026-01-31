const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function run() {
    // Read keys from supabase-init.js
    const initPath = path.join(__dirname, '../assets/js/supabase-init.js');
    let content;
    try {
        content = fs.readFileSync(initPath, 'utf8');
    } catch (e) {
        console.error('Could not read supabase-init.js');
        return;
    }

    // Extract constants
    const urlMatch = content.match(/const supabaseUrl = ['"]([^'"]+)['"]/);
    const keyMatch = content.match(/const supabaseKey = ['"]([^'"]+)['"]/);

    if (!urlMatch || !keyMatch) {
        console.error('Could not parse Supabase keys');
        return;
    }

    const supabaseUrl = urlMatch[1];
    const supabaseKey = keyMatch[1];
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting migration...');

    // 1. Fetch all active promotions from fast_promotions
    const { data: promos, error: promoError } = await supabase.from('fast_promotions').select('*').eq('active', true);

    if (promoError) {
        console.error('Error fetching fast_promotions:', promoError);
        return;
    }

    console.log(`Found ${promos.length} active promotions.`);

    if (promos.length === 0) {
        console.log('No promotions to migrate.');
        return;
    }

    let successCount = 0;
    let errorCount = 0;

    // 2. Update fast_products for each promotion
    for (const p of promos) {
        console.log(`Migrating promotion for Product ID ${p.product_id} (${p.product_name}) - Type: ${p.discount_type}, Value: ${p.value}`);

        const { error: updateError } = await supabase
            .from('fast_products')
            .update({
                promo_value: p.value,
                promo_type: p.discount_type,
                promo_active: true
            })
            .eq('id', p.product_id);

        if (updateError) {
            console.error(`Error updating product ${p.product_id}:`, updateError.message);
            errorCount++;
        } else {
            successCount++;
        }
    }

    console.log('Migration complete.');
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
}

run();

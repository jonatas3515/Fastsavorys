const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase (User typically has this in env or I can see it in admin.js)
// I will try to read the env vars or just use the ones I can find in admin.js if I read it carefully, 
// but usually environment variables are available.
// If not, I'll need to parse admin.js to get the keys. 
// For now, let's assume I can get them or they are injected. 
// Actually, I should check admin.js for keys first or use the ones from the project.
// I'll grab them from `assets/js/supabase-init.js` if available, or just use placeholders to trigger error if not found.

// Wait, I don't have the keys handy in the chat history explicitly... 
// I need to find them. `assets/js/supabase-init.js` is open in the user state!

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
        console.error('Could not parse Supabase keys. Content:', content.substring(0, 200));
        return;
    }

    const supabaseUrl = urlMatch[1];
    const supabaseKey = keyMatch[1];
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Checking fast_promotions...');
    const { data: promos, error: promoError } = await supabase.from('fast_promotions').select('*').limit(5);
    if (!promoError) {
        console.log('FOUND fast_promotions:', promos);
    } else {
        console.log('fast_promotions error:', promoError.message);
    }

    console.log('Checking fast_discounts...');
    const { data: discounts, error: discountError } = await supabase.from('fast_discounts').select('*').limit(5);
    if (!discountError) {
        console.log('FOUND fast_discounts:', discounts);
    } else {
        console.log('fast_discounts error:', discountError.message);
    }

    console.log('Checking fast_products structure...');
    const { data: products, error: prodError } = await supabase.from('fast_products').select('*').limit(1);
    if (!prodError && products.length > 0) {
        console.log('fast_products keys:', Object.keys(products[0]));
    }

    console.log('Checking fast_store_config...');
    const { data: config, error: configError } = await supabase.from('fast_store_config').select('*').limit(1);
    if (!configError && config.length > 0) {
        console.log('fast_store_config keys:', Object.keys(config[0]));
        // Check for promotions blob
        if (config[0].promotions) console.log('Found promotions in config:', config[0].promotions);
    }
}

run();

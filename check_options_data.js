const url = 'https://vqjyjdllapqbqpylshkw.supabase.co/rest/v1/fast_product_options?select=*';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

console.log('Fetching options from:', url);

fetch(url, {
    headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key
    }
})
    .then(r => r.json())
    .then(data => {
        console.log('Total items:', data.length);
        if (data.length > 0) {
            console.log('Sample item:', JSON.stringify(data[0], null, 2));
            console.log('Visible type:', typeof data[0].visible);
            console.log('Visible value:', data[0].visible);

            const nullVisible = data.filter(i => i.visible === null);
            console.log('Items with visible=null:', nullVisible.length);

            const falseVisible = data.filter(i => i.visible === false);
            console.log('Items with visible=false:', falseVisible.length);

            // Check specific types
            const types = [...new Set(data.map(i => i.type))];
            console.log('Types found:', types);

            types.forEach(t => {
                const items = data.filter(i => i.type === t);
                const visibleItems = items.filter(i => i.visible === true);
                console.log(`Type ${t}: Total ${items.length}, Visible ${visibleItems.length}`);
            });

        } else {
            console.log('No data found');
        }
    })
    .catch(e => console.error('Error:', e));

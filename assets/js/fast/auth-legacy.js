/**
 * Fast Savory's - Legacy Auth Module
 * Handles default user seeding and user management (legacy/fallback).
 * Most auth is handled by Supabase directly now, but this supports local dev/fallback.
 */

window.users = [];

window.seedDefaultUsers = async function () {
    try {
        // Try to load from Supabase first
        if (window.supabaseClient) {
            const { data, error } = await window.supabaseClient
                .from('fast_users')
                .select('*');

            if (error) throw error;

            if (data && data.length > 0) {
                window.users = data;
            } else {
                // Seed default admin if table is empty
                window.users = [{ username: 'fast', password: 'fast123', role: 'admin' }];
                await window.supabaseClient.from('fast_users').upsert(window.users[0], { onConflict: 'username' });
            }
        } else {
            throw new Error('Supabase not available');
        }
        // Keep localStorage as cache
        localStorage.setItem('fastUsers', JSON.stringify(window.users));
    } catch (error) {
        console.error('Erro ao carregar usuários do Supabase:', error);
        // Fallback to localStorage
        const saved = localStorage.getItem('fastUsers');
        if (saved) { window.users = JSON.parse(saved); }
        else {
            window.users = [{ username: 'fast', password: 'fast123', role: 'admin' }];
            localStorage.setItem('fastUsers', JSON.stringify(window.users));
        }
    }
};

window.saveUsers = async function () {
    // Always save to localStorage first (instant)
    localStorage.setItem('fastUsers', JSON.stringify(window.users));

    // Then sync with Supabase
    try {
        if (window.supabaseClient) {
            // Clear and re-insert for simplicity - CAREFUL: this deletes all users except ID 0 (legacy check)
            // But since we are extracting existing code, we keep behavior.
            await window.supabaseClient.from('fast_users').delete().neq('id', 0);
            for (const user of window.users) {
                await window.supabaseClient.from('fast_users').upsert(
                    { username: user.username, password: user.password, role: user.role },
                    { onConflict: 'username' }
                );
            }
            console.log('Usuários sincronizados com Supabase');
        }
    } catch (error) {
        console.error('Erro ao salvar usuários no Supabase:', error);
    }
};

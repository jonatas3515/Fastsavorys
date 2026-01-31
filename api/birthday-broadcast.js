const { createClient } = require('@supabase/supabase-js');
const { updateCustomFields, sendFlowToUser } = require('./_lib/manychat');

let supabaseAdmin = null;
try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false } }
        );
    }
} catch (initError) {
    console.error('[birthday-broadcast] Failed to init Supabase:', initError.message);
}

function getBrasiliaDate() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc - (3 * 60 * 60 * 1000));
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function formatBRDate(date) {
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function parseYYYYMMDD(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const m = /^\d{4}-\d{2}-\d{2}$/.exec(dateStr.trim());
    if (!m) return null;
    const [y, mo, d] = dateStr.split('-').map(n => parseInt(n, 10));
    if (!y || !mo || !d) return null;
    if (mo < 1 || mo > 12) return null;
    if (d < 1 || d > 31) return null;
    return { y, mo, d };
}

function getBrasiliaDateFromYYYYMMDD(dateStr) {
    const parsed = parseYYYYMMDD(dateStr);
    if (!parsed) return null;
    const { y, mo, d } = parsed;
    return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
}

function monthDayFromISODate(birthdate) {
    if (!birthdate || typeof birthdate !== 'string') return null;
    const parts = birthdate.split('-');
    if (parts.length !== 3) return null;
    return `${parts[1]}-${parts[2]}`;
}

function isBirthdayTodayOrSundayFallback(birthdate, brasiliaDate) {
    const md = monthDayFromISODate(birthdate);
    if (!md) return false;

    const todayMd = `${pad2(brasiliaDate.getMonth() + 1)}-${pad2(brasiliaDate.getDate())}`;
    if (md === todayMd) return true;

    const yesterday = new Date(brasiliaDate.getTime());
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayMd = `${pad2(yesterday.getMonth() + 1)}-${pad2(yesterday.getDate())}`;

    const yesterdayDay = yesterday.getDay();
    if (md === yesterdayMd && yesterdayDay === 0) return true;

    return false;
}

function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const dryRun = (req.query && req.query.dry_run === '1') || (req.body && req.body.dry_run === true);
    const dateParam = (req.query && req.query.date) || (req.body && req.body.date);
    const onlyPhoneParam = (req.query && req.query.only_phone) || (req.body && req.body.only_phone);
    const limitParam = (req.query && req.query.limit) || (req.body && req.body.limit);
    const onlyPhoneDigits = onlyPhoneParam ? digitsOnly(onlyPhoneParam) : null;
    const limit = limitParam ? Math.max(1, Math.min(parseInt(limitParam, 10) || 0, 200)) : null;

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(200).json({ success: false, error: 'Use GET or POST method' });
    }

    if (!supabaseAdmin) {
        return res.status(200).json({ success: false, error: 'Database not configured' });
    }

    const flowId = process.env.MANYCHAT_FLOW_ID_BIRTHDAY;
    const validUntilFieldId = process.env.MANYCHAT_FIELD_ID_BDAY_VALID_UNTIL;

    if (!dryRun) {
        if (!process.env.MANYCHAT_API_KEY) {
            return res.status(200).json({ success: false, error: 'MANYCHAT_API_KEY not configured' });
        }

        if (!flowId) {
            return res.status(200).json({ success: false, error: 'MANYCHAT_FLOW_ID_BIRTHDAY not configured' });
        }

        if (!validUntilFieldId) {
            return res.status(200).json({ success: false, error: 'MANYCHAT_FIELD_ID_BDAY_VALID_UNTIL not configured' });
        }
    }

    const brasilia = (dateParam && getBrasiliaDateFromYYYYMMDD(dateParam)) || getBrasiliaDate();
    const year = brasilia.getFullYear();
    const validUntil = new Date(brasilia.getTime());
    validUntil.setDate(validUntil.getDate() + 6);

    const validUntilStr = formatBRDate(validUntil);

    try {
        const { data: clients, error: clientsErr } = await supabaseAdmin
            .from('fast_clients')
            .select('phone, name, birthdate, manychat_id')
            .not('birthdate', 'is', null)
            .not('manychat_id', 'is', null);

        if (clientsErr) {
            console.error('[birthday-broadcast] Failed to load clients:', clientsErr);
            return res.status(200).json({ success: false, error: 'Failed to load clients' });
        }

        let eligible = (clients || []).filter(c => isBirthdayTodayOrSundayFallback(c.birthdate, brasilia));

        if (onlyPhoneDigits) {
            eligible = eligible.filter(c => digitsOnly(c.phone) === onlyPhoneDigits);
        }

        if (limit) {
            eligible = eligible.slice(0, limit);
        }

        const phones = eligible
            .map(c => digitsOnly(c.phone))
            .filter(Boolean);

        let alreadySentSet = new Set();

        if (phones.length > 0) {
            const { data: logs, error: logsErr } = await supabaseAdmin
                .from('fast_birthday_message_log')
                .select('client_phone')
                .eq('message_year', year)
                .in('client_phone', phones);

            if (logsErr) {
                console.warn('[birthday-broadcast] Could not read fast_birthday_message_log:', logsErr.message);
            } else {
                alreadySentSet = new Set((logs || []).map(r => String(r.client_phone || '')));
            }
        }

        const results = {
            total_clients: (clients || []).length,
            eligible_today: eligible.length,
            skipped_already_sent: 0,
            sent: 0,
            failed: 0,
            failures: []
        };

        if (dryRun) {
            const preview = eligible.slice(0, 25).map(c => ({
                phone_last4: digitsOnly(c.phone).slice(-4),
                manychat_id: c.manychat_id ? String(c.manychat_id) : null
            }));

            return res.status(200).json({
                success: true,
                dry_run: true,
                simulated_date: dateParam || null,
                only_phone: onlyPhoneDigits || null,
                limit: limit || null,
                date_brasilia: brasilia.toISOString(),
                valid_until: validUntilStr,
                ...results,
                preview
            });
        }

        for (const client of eligible) {
            const phoneDigits = digitsOnly(client.phone);
            const manychatId = client.manychat_id ? String(client.manychat_id) : null;

            if (!phoneDigits || !manychatId) {
                continue;
            }

            if (alreadySentSet.has(phoneDigits)) {
                results.skipped_already_sent += 1;
                continue;
            }

            const fieldsResult = await updateCustomFields(manychatId, [
                {
                    field_id: parseInt(validUntilFieldId, 10),
                    field_value: validUntilStr
                }
            ]);

            if (!fieldsResult.success) {
                results.failed += 1;
                results.failures.push({ phone: phoneDigits, step: 'setCustomFields', error: fieldsResult.error });
                continue;
            }

            const flowResult = await sendFlowToUser(manychatId, flowId);

            if (!flowResult.success) {
                results.failed += 1;
                results.failures.push({ phone: phoneDigits, step: 'sendFlow', error: flowResult.error });
                continue;
            }

            const { error: logErr } = await supabaseAdmin
                .from('fast_birthday_message_log')
                .insert({
                    client_phone: phoneDigits,
                    message_year: year,
                    manychat_id: manychatId,
                    valid_until: validUntil.toISOString().slice(0, 10)
                });

            if (logErr) {
                console.warn('[birthday-broadcast] Failed to insert log (non-blocking):', logErr.message);
            }

            results.sent += 1;
            alreadySentSet.add(phoneDigits);
        }

        return res.status(200).json({
            success: true,
            date_brasilia: brasilia.toISOString(),
            valid_until: validUntilStr,
            ...results
        });

    } catch (err) {
        console.error('[birthday-broadcast] Unexpected error:', err);
        return res.status(200).json({ success: false, error: err.message || 'Unknown error' });
    }
};

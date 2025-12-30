/**
 * Shared Stripe and Supabase client initialization for Vercel Serverless Functions
 * 
 * REQUIRED ENVIRONMENT VARIABLES (configure in Vercel Dashboard):
 * - STRIPE_SECRET_KEY: Stripe secret key (sk_live_... or sk_test_...)
 * - STRIPE_WEBHOOK_SECRET: Webhook signing secret (whsec_...)
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key
 * - CHECKOUT_SUCCESS_URL: Success redirect URL
 * - CHECKOUT_CANCEL_URL: Cancel redirect URL
 */

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

// Initialize Supabase Admin Client
const supabaseAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    })
    : null;

// Helper to send CORS headers
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature');
}

// Helper to handle OPTIONS preflight
function handleCors(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return true;
    }
    return false;
}

module.exports = {
    stripe,
    supabaseAdmin,
    setCorsHeaders,
    handleCors
};

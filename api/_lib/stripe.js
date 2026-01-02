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
 * - WHATSAPP_NUMBER: WhatsApp number for payment link redirect (e.g., 5573999366554)
 */

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Constants
const EPSILON = 0.009; // Tolerance for partial payment comparison
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5573999366554';

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

// Helper to check if payment is partial or full
function isPartialPayment(amountPaid, total) {
    return total > 0 && (amountPaid + EPSILON) < total;
}

// Helper to return safe error message (no internal details)
function safeErrorMessage(error, defaultMsg = 'An error occurred') {
    if (process.env.NODE_ENV === 'development') {
        return error?.message || defaultMsg;
    }
    return defaultMsg;
}

module.exports = {
    stripe,
    supabaseAdmin,
    setCorsHeaders,
    handleCors,
    EPSILON,
    WHATSAPP_NUMBER,
    isPartialPayment,
    safeErrorMessage
};

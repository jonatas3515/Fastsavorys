ALTER TABLE public.fast_orders
ADD COLUMN IF NOT EXISTS amount_paid numeric(10,2) DEFAULT 0;

-- Optional: Update existing paid orders to have amount_paid = total
UPDATE public.fast_orders
SET amount_paid = total
WHERE payment_status IN ('paid', 'paid_full') AND amount_paid = 0;

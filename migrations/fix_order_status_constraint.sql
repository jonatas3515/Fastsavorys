-- Fix fast_orders status constraint to include all valid status values
-- Run this in Supabase SQL Editor

-- First, drop the existing constraint
ALTER TABLE fast_orders DROP CONSTRAINT IF EXISTS fast_orders_status_check;

-- Add new constraint with all valid status values
ALTER TABLE fast_orders ADD CONSTRAINT fast_orders_status_check 
CHECK (status IN (
  'pending',
  'accepted', 
  'preparing',
  'confirmed',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'paid',
  'paid_partial'
));

-- Comment: This constraint now includes all status values used by the application:
-- pending = Recebido (aguardando)
-- accepted = Aceito
-- preparing = Em preparo
-- confirmed = Pronto
-- out_for_delivery = Saiu para entrega
-- delivered = Entregue
-- cancelled = Cancelado
-- paid = Pago (legacy)
-- paid_partial = Pago parcialmente (legacy)

-- =====================================================
-- CORREÇÃO: Adicionar políticas DELETE faltantes
-- =====================================================
-- Execute este script no Supabase SQL Editor
-- =====================================================

-- fast_orders: Adicionar permissão de DELETE
CREATE POLICY IF NOT EXISTS "fast_orders_public_delete" ON public.fast_orders FOR DELETE USING (true);

-- fast_order_logs: Adicionar permissão de DELETE  
CREATE POLICY IF NOT EXISTS "fast_order_logs_public_delete" ON public.fast_order_logs FOR DELETE USING (true);

-- orders (legado): Adicionar permissão de DELETE
CREATE POLICY IF NOT EXISTS "orders_public_delete" ON public.orders FOR DELETE USING (true);

-- order_history: Adicionar permissão de DELETE
CREATE POLICY IF NOT EXISTS "order_history_public_delete" ON public.order_history FOR DELETE USING (true);

-- Se a sintaxe "IF NOT EXISTS" não funcionar, use esta versão:
/*
DROP POLICY IF EXISTS "fast_orders_public_delete" ON public.fast_orders;
CREATE POLICY "fast_orders_public_delete" ON public.fast_orders FOR DELETE USING (true);

DROP POLICY IF EXISTS "fast_order_logs_public_delete" ON public.fast_order_logs;
CREATE POLICY "fast_order_logs_public_delete" ON public.fast_order_logs FOR DELETE USING (true);

DROP POLICY IF EXISTS "orders_public_delete" ON public.orders;
CREATE POLICY "orders_public_delete" ON public.orders FOR DELETE USING (true);

DROP POLICY IF EXISTS "order_history_public_delete" ON public.order_history;
CREATE POLICY "order_history_public_delete" ON public.order_history FOR DELETE USING (true);
*/

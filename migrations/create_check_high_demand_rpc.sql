-- =====================================================
-- FUNÇÃO RPC: check_high_demand
-- =====================================================
-- Retorna TRUE se há muitos pedidos em preparo (alta demanda).
-- Isso permite que o frontend saiba se deve mostrar aviso
-- SEM precisar listar todos os pedidos (mais seguro).
-- =====================================================

CREATE OR REPLACE FUNCTION public.check_high_demand(max_concurrent INT DEFAULT 10)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  in_progress_count INT;
BEGIN
  -- Contar pedidos em preparo nas últimas 24h
  SELECT COUNT(*) INTO in_progress_count
  FROM public.fast_orders
  WHERE status IN ('pending', 'preparing', 'accepted', 'confirmed')
    AND created_at >= NOW() - INTERVAL '24 hours';

  RETURN in_progress_count >= max_concurrent;
END;
$$;

-- Permitir que qualquer usuário (anon/public) possa chamar essa função
GRANT EXECUTE ON FUNCTION public.check_high_demand(INT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_high_demand(INT) TO authenticated;

-- =====================================================
-- COMO USAR NO JAVASCRIPT:
-- const { data, error } = await supabase.rpc('check_high_demand', { max_concurrent: 10 });
-- if (data === true) { /* mostrar aviso de alta demanda */ }
-- =====================================================

-- =====================================================
-- CORREÇÃO: Function Search Path Mutable
-- =====================================================
-- Esta migração corrige o warning de segurança:
-- "Function public.update_updated_at_column has a role mutable search_path"
--
-- O problema: Funções sem search_path fixo podem ser vulneráveis
-- a ataques de "search path injection" onde um atacante poderia
-- criar uma função maliciosa em outro schema.
--
-- A solução: Definir search_path como string vazia ou 'public'
-- =====================================================

-- Recriar a função com search_path seguro
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- =====================================================
-- NOTA: Os warnings de RLS Policy Always True são
-- INTENCIONAIS para este projeto porque:
--
-- 1. Clientes NÃO fazem login - fazem pedidos anonimamente
-- 2. Tabelas como fast_orders, fast_clients precisam
--    permitir INSERT/UPDATE público
-- 3. O arquivo fix_rls_security_warnings.sql já separou
--    as políticas por operação (SELECT/INSERT/UPDATE/DELETE)
--    em vez de usar ALL, o que é a prática recomendada
--
-- Tabelas que PRECISAM de acesso público:
-- - fast_orders (clientes criam pedidos)
-- - fast_clients (clientes se cadastram)
-- - fast_ratings (clientes enviam avaliações)
-- - fast_coupon_usage (registrar uso de cupom)
-- - customer_favorites (favoritos do cliente)
-- =====================================================

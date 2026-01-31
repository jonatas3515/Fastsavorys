-- =====================================================
-- SCRIPT DE SEGURANÇA FINAL - Fast Savory's
-- =====================================================
-- Execute este script NO SUPABASE SQL EDITOR em FASES
-- Cada fase deve ser testada antes de avançar para a próxima
-- =====================================================

-- =====================================================
-- FASE 0: CRIAR/VERIFICAR RPC SEGURA PARA TRACKING
-- (Rode primeiro - não quebra nada)
-- =====================================================

-- Remove função antiga se existir
DROP FUNCTION IF EXISTS get_order_for_tracking(text, text);

-- Cria função RPC segura para tracking de pedidos
-- Esta função bypassa RLS de forma controlada, retornando apenas
-- o pedido que corresponde ao par código+telefone
CREATE OR REPLACE FUNCTION get_order_for_tracking(p_order_code text, p_phone text)
RETURNS TABLE (
    id bigint,
    order_code text,
    status text,
    created_at timestamptz,
    updated_at timestamptz,
    total numeric,
    items jsonb,
    delivery_type text,
    client_name text,
    order_sequence int,
    payment_method text,
    payment_status text
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY 
    SELECT 
        o.id, 
        o.order_code, 
        o.status, 
        o.created_at, 
        o.updated_at, 
        o.total, 
        o.items,
        o.delivery_type,
        o.client_name,
        o.order_sequence,
        o.payment_method,
        o.payment_status
    FROM fast_orders o
    WHERE 
        UPPER(o.order_code) = UPPER(p_order_code) 
        AND (
            o.client_phone = p_phone
            OR 
            -- Robustez para formato de telefone (compara últimos 8 dígitos)
            RIGHT(REGEXP_REPLACE(o.client_phone, '\D', '', 'g'), 8) = RIGHT(REGEXP_REPLACE(p_phone, '\D', '', 'g'), 8)
        )
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Concede permissão de execução para anon e authenticated
GRANT EXECUTE ON FUNCTION get_order_for_tracking TO anon;
GRANT EXECUTE ON FUNCTION get_order_for_tracking TO authenticated;

-- =====================================================
-- TESTE FASE 0:
-- 1. No site, clique em "Acompanhar pedido"
-- 2. Digite um código de pedido existente + telefone
-- 3. Deve funcionar normalmente
-- =====================================================


-- =====================================================
-- FASE 1: FECHAR fast_users (CRÍTICO - URGENTE)
-- (Tabela administrativa não deveria ser pública)
-- =====================================================

-- Remove TODAS as policies públicas de fast_users
DROP POLICY IF EXISTS "fast_users_public_select" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_public_write" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_public_update" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_public_delete" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_all_access" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_public_read" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_auth_write" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_auth_update" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_auth_delete" ON public.fast_users;

-- Cria policy apenas para admin autenticado
CREATE POLICY "fast_users_authenticated_only" ON public.fast_users
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- =====================================================
-- TESTE FASE 1:
-- 1. Abra a loja pública - deve funcionar normalmente
-- 2. Faça login no admin - deve funcionar
-- 3. Tente editar usuários no admin - deve funcionar
-- =====================================================


-- =====================================================
-- FASE 2: FECHAR fast_store_config (ALTO RISCO)
-- (Configurações da loja não deveriam ser editáveis publicamente)
-- =====================================================

-- Remove policy de full access público
DROP POLICY IF EXISTS "fast_store_config_public_all" ON public.fast_store_config;
DROP POLICY IF EXISTS "fast_store_config_all_access" ON public.fast_store_config;

-- Mantém SELECT público (o site precisa ler as configs)
-- Verifica se já existe antes de criar
DROP POLICY IF EXISTS "fast_store_config_public_read" ON public.fast_store_config;
CREATE POLICY "fast_store_config_public_read" ON public.fast_store_config
    FOR SELECT TO anon, authenticated
    USING (true);

-- UPDATE apenas para autenticados
DROP POLICY IF EXISTS "fast_store_config_auth_update" ON public.fast_store_config;
CREATE POLICY "fast_store_config_auth_update" ON public.fast_store_config
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

-- INSERT apenas para autenticados (raro, mas por segurança)
DROP POLICY IF EXISTS "fast_store_config_auth_insert" ON public.fast_store_config;
CREATE POLICY "fast_store_config_auth_insert" ON public.fast_store_config
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- =====================================================
-- TESTE FASE 2:
-- 1. Abra a loja pública - deve carregar configs normalmente
-- 2. No admin, altere uma configuração (ex: taxa de cartão)
-- 3. Deve salvar sem erros
-- =====================================================


-- =====================================================
-- FASE 3: FECHAR fast_orders (SELECT/UPDATE/DELETE público)
-- (ATENÇÃO: Só execute APÓS deploy do código atualizado)
-- =====================================================

-- Remove policies públicas perigosas
DROP POLICY IF EXISTS "fast_orders_public_select" ON public.fast_orders;
DROP POLICY IF EXISTS "fast_orders_public_update" ON public.fast_orders;
DROP POLICY IF EXISTS "fast_orders_public_delete" ON public.fast_orders;
DROP POLICY IF EXISTS "fast_orders_public_all" ON public.fast_orders;
DROP POLICY IF EXISTS "fast_orders_all_access" ON public.fast_orders;

-- Mantém INSERT público (cliente precisa criar pedido)
DROP POLICY IF EXISTS "fast_orders_public_insert" ON public.fast_orders;
CREATE POLICY "fast_orders_public_insert" ON public.fast_orders
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- Admin tem acesso total
DROP POLICY IF EXISTS "fast_orders_admin_full" ON public.fast_orders;
CREATE POLICY "fast_orders_admin_full" ON public.fast_orders
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- =====================================================
-- TESTE FASE 3:
-- 1. Acompanhar pedido (código + telefone) - DEVE FUNCIONAR (usa RPC)
-- 2. Criar novo pedido no checkout - DEVE FUNCIONAR (INSERT público)
-- 3. Admin listar pedidos - DEVE FUNCIONAR (authenticated)
-- 4. Webhook Stripe atualizar pagamento - DEVE FUNCIONAR (service_role)
-- 5. ManyChat aceitar/rejeitar pedido - DEVE FUNCIONAR (service_role)
-- =====================================================


-- =====================================================
-- FASE 4: FECHAR fast_clients (SELECT/UPDATE público)
-- (ATENÇÃO: Só execute APÓS deploy do código atualizado)
-- =====================================================

-- Remove policies públicas perigosas
DROP POLICY IF EXISTS "fast_clients_public_read" ON public.fast_clients;
DROP POLICY IF EXISTS "fast_clients_public_update" ON public.fast_clients;
DROP POLICY IF EXISTS "fast_clients_public_select" ON public.fast_clients;
DROP POLICY IF EXISTS "fast_clients_all_access" ON public.fast_clients;
DROP POLICY IF EXISTS "Admin Full Access Clients" ON public.fast_clients;

-- Mantém INSERT público (cliente pode se cadastrar no checkout)
DROP POLICY IF EXISTS "fast_clients_public_insert" ON public.fast_clients;
CREATE POLICY "fast_clients_public_insert" ON public.fast_clients
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- Admin tem acesso total
DROP POLICY IF EXISTS "fast_clients_admin_full" ON public.fast_clients;
CREATE POLICY "fast_clients_admin_full" ON public.fast_clients
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- =====================================================
-- TESTE FASE 4:
-- 1. Digitar telefone no checkout - DEVE preencher nome (via API)
-- 2. Listar endereços salvos - DEVE FUNCIONAR (via API)
-- 3. Adicionar novo endereço - DEVE FUNCIONAR (via API + order_code)
-- 4. Admin listar clientes - DEVE FUNCIONAR (authenticated)
-- =====================================================


-- =====================================================
-- FASE 5 (OPCIONAL): LIMPAR OUTRAS POLICIES PERIGOSAS
-- =====================================================

-- fast_birthday_message_log - remover all_access
DROP POLICY IF EXISTS "fast_birthday_message_log_all_access" ON public.fast_birthday_message_log;
CREATE POLICY "fast_birthday_message_log_auth_only" ON public.fast_birthday_message_log
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- fast_order_logs - remover public_all
DROP POLICY IF EXISTS "fast_order_logs_public_all" ON public.fast_order_logs;
DROP POLICY IF EXISTS "fast_order_logs_public_delete" ON public.fast_order_logs;
CREATE POLICY "fast_order_logs_public_insert" ON public.fast_order_logs
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);
CREATE POLICY "fast_order_logs_public_select" ON public.fast_order_logs
    FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "fast_order_logs_auth_full" ON public.fast_order_logs
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);


-- =====================================================
-- VERIFICAÇÃO FINAL
-- Execute esta query para verificar as policies atuais
-- =====================================================

SELECT 
    tablename,
    policyname,
    roles,
    cmd,
    qual as using_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('fast_users', 'fast_orders', 'fast_clients', 'fast_store_config')
ORDER BY tablename, policyname;


-- =====================================================
-- FIM DO SCRIPT
-- =====================================================
-- IMPORTANTE: Execute cada FASE separadamente e TESTE antes de continuar
-- Se algo quebrar, você pode reverter criando policies públicas novamente
-- =====================================================

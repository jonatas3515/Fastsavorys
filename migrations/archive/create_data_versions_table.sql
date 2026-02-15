-- =====================================================
-- SMART CACHE: Data Versions Table
-- =====================================================
-- Esta tabela controla versões dos dados para invalidação de cache.
-- Quando o admin salvar produtos/configs, a versão é incrementada.
-- O cliente público só pode ler (SELECT), nunca modificar.
-- =====================================================

-- 1. Criar tabela de versões
CREATE TABLE IF NOT EXISTS fast_data_versions (
  key TEXT PRIMARY KEY,           -- ex: 'products', 'config', 'hours', 'fees', 'banners'
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Inserir versões iniciais
INSERT INTO fast_data_versions (key, version) VALUES 
  ('products', 1),
  ('config', 1),
  ('hours', 1),
  ('fees', 1),
  ('banners', 1)
ON CONFLICT (key) DO NOTHING;

-- 3. Habilitar RLS
ALTER TABLE fast_data_versions ENABLE ROW LEVEL SECURITY;

-- 4. Política: SELECT público (anon pode apenas ler)
DROP POLICY IF EXISTS "Allow public select on fast_data_versions" ON fast_data_versions;
CREATE POLICY "Allow public select on fast_data_versions" 
  ON fast_data_versions
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 5. Política: INSERT/UPDATE/DELETE apenas para authenticated (admin via service role)
-- O cliente anônimo NÃO pode modificar versões
DROP POLICY IF EXISTS "Allow admin write on fast_data_versions" ON fast_data_versions;
CREATE POLICY "Allow admin write on fast_data_versions" 
  ON fast_data_versions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 6. Função segura para incrementar versão (chamada pelo admin)
CREATE OR REPLACE FUNCTION increment_data_version(p_key TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_version BIGINT;
BEGIN
  INSERT INTO fast_data_versions (key, version, updated_at)
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) 
  DO UPDATE SET 
    version = fast_data_versions.version + 1,
    updated_at = NOW()
  RETURNING version INTO new_version;
  
  RETURN new_version;
END;
$$;

-- 7. Conceder permissão para anon executar a função (necessário para admin via frontend)
GRANT EXECUTE ON FUNCTION increment_data_version(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION increment_data_version(TEXT) TO authenticated;

-- =====================================================
-- INSTRUÇÕES DE USO:
-- 
-- No frontend admin, após salvar produtos:
--   await window.supabaseClient.rpc('increment_data_version', { p_key: 'products' });
--
-- No frontend público, para verificar versão:
--   const { data } = await window.supabaseClient
--     .from('fast_data_versions')
--     .select('version')
--     .eq('key', 'products')
--     .single();
-- =====================================================

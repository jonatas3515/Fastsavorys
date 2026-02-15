-- Migration: Adicionar colunas de bloqueio de opções para produtos (bolos/kits)
-- Data: 2026-01-14
-- Descrição: Permite configurar por produto se a seleção de massa e/ou recheio deve ser bloqueada

-- Adicionar coluna block_massa
ALTER TABLE fast_products 
ADD COLUMN IF NOT EXISTS block_massa BOOLEAN DEFAULT FALSE;

-- Adicionar coluna block_recheio
ALTER TABLE fast_products 
ADD COLUMN IF NOT EXISTS block_recheio BOOLEAN DEFAULT FALSE;

-- Comentários para documentação
COMMENT ON COLUMN fast_products.block_massa IS 'Se true, esconde a opção de escolha de massa para este produto';
COMMENT ON COLUMN fast_products.block_recheio IS 'Se true, esconde a opção de escolha de recheio para este produto';

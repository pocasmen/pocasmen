-- Adiciona colunas em falta na tabela clients para suportar o novo fluxo de criação
ALTER TABLE clients ADD COLUMN email TEXT;
ALTER TABLE clients ADD COLUMN phone TEXT;
ALTER TABLE clients ADD COLUMN "hasContract" BOOLEAN DEFAULT false;

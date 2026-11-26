-- Slug da categoria: identificador estável usado nas URLs (/categorias/<slug>).
ALTER TABLE "categories" ADD COLUMN "slug" VARCHAR(120);

-- Preenchimento das categorias existentes, antes de o campo virar obrigatório.
-- Cada categoria, em ordem de id, recebe o primeiro candidato livre:
--   1. a base: nome em minúsculas, sem os acentos mais comuns, com cada
--      sequência de caracteres fora de a-z/0-9 trocada por um hífen, limitada
--      a 100 caracteres. Nome sem letras ou números usa "categoria-<id>";
--   2. base + "-<id>";
--   3. base + "-<id>-<k>", com k = 3, 4, ...
-- Cada sufixo cabe no limite de 120 caracteres, porque a base é truncada antes
-- de recebê-lo. A verificação de existência garante unicidade global, inclusive
-- contra slugs gerados para categorias anteriores.
DO $$
DECLARE
  registro RECORD;
  raiz TEXT;
  candidato TEXT;
  sufixo TEXT;
  tentativa INTEGER;
BEGIN
  FOR registro IN SELECT id, name FROM "categories" ORDER BY id LOOP
    raiz := trim(both '-' FROM regexp_replace(
      translate(lower(registro.name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
      '[^a-z0-9]+', '-', 'g'
    ));
    IF raiz = '' THEN
      raiz := 'categoria-' || registro.id;
    END IF;
    raiz := rtrim(left(raiz, 100), '-');

    candidato := raiz;
    tentativa := 1;
    WHILE EXISTS (SELECT 1 FROM "categories" WHERE "slug" = candidato) LOOP
      tentativa := tentativa + 1;
      sufixo := '-' || registro.id || CASE WHEN tentativa = 2 THEN '' ELSE '-' || tentativa END;
      candidato := rtrim(left(raiz, 120 - length(sufixo)), '-') || sufixo;
    END LOOP;

    UPDATE "categories" SET "slug" = candidato WHERE "id" = registro.id;
  END LOOP;
END $$;

ALTER TABLE "categories" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- Formato do slug também no banco: minúsculas, dígitos e hífens entre palavras.
ALTER TABLE "categories" ADD CONSTRAINT "categories_slug_format_check"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") <= 120);

# PT 2026.2 — Grupo 05 — Backend

API do projeto do grupo 05, em NestJS + TypeScript, com PostgreSQL e Prisma 6 (`prisma` e `@prisma/client` 6.x; o Prisma 7 não é usado).

## Requisitos

- Node.js 20.12 ou superior e npm
- PostgreSQL 14 ou superior instalado localmente (não usamos Docker)

## Instalar o PostgreSQL

| Sistema | Como instalar |
| --- | --- |
| macOS | `brew install postgresql@17` e `brew services start postgresql@17` |
| Windows | instalador em https://www.postgresql.org/download/windows/ (anote a senha do usuário `postgres`) |
| Linux (Debian/Ubuntu) | `sudo apt install postgresql` |

No macOS com Homebrew, o usuário do banco é o seu usuário do sistema, sem senha. No Windows e no Linux, normalmente é `postgres` com a senha definida na instalação.

## Configurar o projeto

1. Instale as dependências. O `postinstall` gera o Prisma Client (por isso o pacote `prisma` fica em `dependencies`).

   ```bash
   npm ci
   ```

2. Crie os bancos de desenvolvimento e de testes.

   ```bash
   createdb pt_grupo05_dev
   createdb pt_grupo05_test
   ```

   Se o comando `createdb` não estiver disponível, use `psql -U postgres -c "CREATE DATABASE pt_grupo05_dev;"` (e o mesmo para `pt_grupo05_test`).

3. Crie o arquivo `.env` na raiz a partir do modelo (`cp .env.example .env`), trocando `USUARIO` e `SENHA` pelos do seu PostgreSQL local. Sem senha, use `postgresql://USUARIO@localhost:5432/...`.

   ```env
   DATABASE_URL="postgresql://USUARIO:SENHA@localhost:5432/pt_grupo05_dev?schema=public"
   JWT_SECRET="COLE_AQUI_UM_VALOR_ALEATORIO"
   ```

   Gere o valor de `JWT_SECRET` com `openssl rand -hex 32` (ou `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). A aplicação não inicia com `JWT_SECRET` ausente ou com menos de 32 caracteres.

4. Crie o arquivo `.env.test`, apontando para o banco de testes.

   ```env
   DATABASE_URL="postgresql://USUARIO:SENHA@localhost:5432/pt_grupo05_test?schema=public"
   JWT_SECRET="OUTRO_VALOR_ALEATORIO"
   ```

5. Aplique as migrações no banco de desenvolvimento.

   ```bash
   npx prisma migrate dev
   ```

6. Insira as categorias oficiais no banco de desenvolvimento.

   ```bash
   npx prisma db seed
   ```

   O comando pode ser repetido: ele só cria o que falta. Veja [Categorias oficiais](#categorias-oficiais).

Os arquivos `.env` e `.env.test` são locais. O `.gitignore` ignora qualquer arquivo `.env*`, exceto o modelo `.env.example`, que só tem valores de exemplo; nunca force a inclusão dos demais em um commit.

## Executar

```bash
npm run start:dev
```

A API sobe em `http://localhost:3001`, deixando a porta 3000 para o frontend (Next.js). Para usar outra porta, defina `PORT`:

```bash
# macOS / Linux
PORT=4000 npm run start:dev

# Windows (PowerShell)
$env:PORT=4000; npm run start:dev
```

### CORS

O navegador só pode chamar a API a partir de `http://localhost:3000`, com os métodos `GET`, `POST`, `PATCH`, `DELETE` e os cabeçalhos `Content-Type` e `Authorization`. A configuração fica em `src/app.setup.ts`; outras origens não são liberadas. Se o frontend rodar em outro endereço, ajuste `FRONTEND_ORIGIN` nesse arquivo.

Com a API no ar, a documentação interativa (Swagger) fica em `http://localhost:3001/docs` e o OpenAPI em JSON em `http://localhost:3001/docs-json`.

Para inspecionar os dados: `npx prisma studio`.

## Verificar

```bash
npm run build
npm run lint
npm test
npm run test:e2e
```

Os testes e2e apagam dados. Por segurança, só rodam se `DATABASE_URL` (lida de `.env.test`) apontar para um banco PostgreSQL cujo nome termine em `_test`; conferem isso de novo perguntando ao servidor antes de apagar qualquer coisa; aplicam as migrações nesse banco sozinhos; e rodam em série, porque compartilham o mesmo banco.

## Estrutura

```text
prisma/
  schema.prisma        models do banco
  migrations/          histórico de migrações (versionado)
  seed.ts              dados iniciais (npx prisma db seed)
src/
  prisma/              PrismaService, disponível em todos os módulos
  password/            PasswordService: hash e verificação de senha
  auth/                login, emissão do token e JwtAuthGuard
  users/               cadastro e operações do próprio perfil
  app.setup.ts         porta padrão, CORS e Swagger
  api-errors.ts        formatos de erro usados na documentação
test/                  testes e2e
```

### Usar o banco em um módulo novo

O `PrismaModule` é global: basta injetar o `PrismaService`.

```ts
constructor(private readonly prisma: PrismaService) {}
```

### Alterar o banco

Edite `prisma/schema.prisma` e gere a migração:

```bash
npx prisma migrate dev --name descricao_da_mudanca
```

Commite a pasta criada em `prisma/migrations/`. Quem atualizar a branch roda `npx prisma migrate dev` para aplicar.

Ao criar uma relação, declare `onDelete` explicitamente e siga a regra do schema:

- **`Cascade`** quando o filho pertence ao pai (loja de um usuário, produto de uma loja, avaliação de uma loja): a exclusão do pai remove o agregado inteiro numa única operação.
- **`Restrict`** para dados compartilhados (hoje, categorias): não se exclui uma categoria em uso.

Cada regra de exclusão precisa de um teste com banco real em `test/relations.e2e-spec.ts`.

### Senhas

Use sempre o `PasswordService` (`src/password`): `hash(senha)` ao gravar e `verify(senha, hash)` ao conferir. Nunca grave, devolva ou registre em log a senha ou o hash, e nunca altere a senha recebida (sem `trim`, sem mudar a caixa).

### Proteger uma rota

O `JwtAuthGuard` funciona em qualquer módulo, sem importar o `AuthModule`. O id do usuário autenticado vem do token:

```ts
@UseGuards(JwtAuthGuard)
@Get('minhas-lojas')
findMine(@CurrentUserId() userId: number) { ... }
```

Nunca receba o id do usuário pela URL ou pelo corpo em operações privadas.

O guard confere apenas o token (assinatura e validade); ele não consulta o banco. Um token emitido antes de a conta ser excluída continua passando pelo guard por até 1 dia. Por isso, em toda rota privada, busque o usuário pelo `userId` e responda 401 se ele não existir mais — é o que o `UsersService` faz em `/users/me`.

## API

Base local: `http://localhost:3001`. Referência completa e testável em `/docs`.

| Operação | Rota | Autenticação | Sucesso |
| --- | --- | --- | --- |
| Cadastrar | `POST /users` | pública | 201 |
| Entrar | `POST /auth/login` | pública | 200 |
| Ver meu perfil | `GET /users/me` | Bearer | 200 |
| Editar meu perfil | `PATCH /users/me` | Bearer | 200 |
| Excluir minha conta | `DELETE /users/me` | Bearer | 204 |
| Trocar minha senha | `PATCH /users/me/password` | Bearer | 204 |
| Pedir código de recuperação | `POST /auth/forgot-password` | pública | 202 |
| Redefinir senha com o código | `POST /auth/reset-password` | pública | 204 |
| Listar categorias | `GET /categories` | pública | 200 |
| Ver categoria por id | `GET /categories/:id` | pública | 200 |
| Ver categoria por slug | `GET /categories/by-slug/:slug` | pública | 200 |
| Criar categoria | `POST /categories` | Bearer | 201 |
| Editar categoria | `PATCH /categories/:id` | Bearer | 200 |
| Excluir categoria | `DELETE /categories/:id` | Bearer | 204 |
| Listar produtos | `GET /products` | pública | 200 |
| Ver produto | `GET /products/:id` | pública | 200 |
| Criar produto | `POST /products` | Bearer (dono da loja) | 201 |
| Editar produto | `PATCH /products/:id` | Bearer (dono da loja) | 200 |
| Excluir produto | `DELETE /products/:id` | Bearer (dono da loja) | 204 |
| Listar imagens do produto | `GET /products/:productId/images` | pública | 200 |
| Ver imagem do produto | `GET /products/:productId/images/:imageId` | pública | 200 |
| Adicionar imagem ao produto | `POST /products/:productId/images` | Bearer (dono da loja) | 201 |
| Editar imagem do produto | `PATCH /products/:productId/images/:imageId` | Bearer (dono da loja) | 200 |
| Remover imagem do produto | `DELETE /products/:productId/images/:imageId` | Bearer (dono da loja) | 204 |
| Listar lojas | `GET /stores` | pública | 200 |
| Ver loja | `GET /stores/:id` | pública | 200 |
| Criar loja | `POST /stores` | Bearer | 201 |
| Editar loja | `PATCH /stores/:id` | Bearer (dono da loja) | 200 |
| Excluir loja | `DELETE /stores/:id` | Bearer (dono da loja) | 204 |

Não existe listagem de usuários nem consulta por id.

### Categorias

Categorias formam uma árvore: uma categoria pode ter um pai e várias subcategorias. Cada categoria tem um `slug` (ex.: `tecnologia`), usado nas URLs do frontend (`/categorias/tecnologia`).

- **Slug:** letras minúsculas e números, com palavras separadas por um hífen (até 120 caracteres). Na criação, se não for enviado, é derivado do nome, sem acentos. Se o slug gerado já existir, a API responde `409`; nenhum sufixo aleatório é acrescentado.
- **Edição:** renomear não muda o slug, porque ele aparece em URLs existentes. O slug só muda quando é enviado explicitamente.
- **Hierarquia:** uma categoria não pode ser pai dela mesma nem ser movida para dentro de uma de suas descendentes (`400`). Envie `parentCategoryId: null` para torná-la raiz.
- **Exclusão:** só remove categorias sem subcategorias, lojas ou produtos. Caso contrário, responde `409` com o motivo (`CATEGORY_HAS_SUBCATEGORIES`, `CATEGORY_IN_USE_BY_STORES` ou `CATEGORY_IN_USE_BY_PRODUCTS`) e nada é apagado.
- **Listagem:** `GET /categories` ordena por nome e depois por id. Use `?root=true` para as raízes ou `?parentCategoryId=<id>` para as subcategorias diretas. Os dois filtros juntos respondem `400`.

```bash
curl -X POST http://localhost:3001/categories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Celulares","parentCategoryId":1}'
```

As escritas exigem um token válido de conta existente. Isso é uma proteção temporária: o projeto ainda não tem papéis administrativos, então qualquer conta cadastrada pode criar, editar ou excluir categorias até essa decisão ser tomada.

#### Categorias oficiais

São as categorias exibidas na página inicial do frontend, criadas como raízes e sem subcategorias:

| Nome | Slug |
| --- | --- |
| Mercado | `mercado` |
| Farmácia | `farmacia` |
| Beleza | `beleza` |
| Moda | `moda` |
| Eletrônicos | `eletronicos` |
| Jogos | `jogos` |
| Brinquedos | `brinquedos` |
| Casa | `casa` |

```bash
npx prisma db seed
```

A lista fica em `src/categories/official-categories.ts`. A seed usa o banco de `DATABASE_URL` e insere apenas os slugs que ainda não existem, sem alterar nem apagar categorias já cadastradas. Em produção, rode depois de `npx prisma migrate deploy`, em um ambiente com as dependências de desenvolvimento instaladas (a seed é executada com `ts-node`). O frontend escolhe a imagem de cada categoria pelo slug.

#### Dados de demonstração (opcionais)

Além das categorias oficiais, a seed pode criar um conjunto de demonstração para a apresentação, montado a partir do Figma do time. Não é um requisito do produto, e **nem tudo nele é informação do Figma**: veja a coluna "Vínculo com a loja" e as limitações abaixo.

No `.env` local:

```bash
SEED_DEMO="true"
SEED_DEMO_PASSWORD="<senha local com 8 caracteres ou mais>"
```

Depois aplique as migrações pendentes e rode a seed:

```bash
npx prisma migrate deploy
npx prisma db seed
```

A saída informa o id de cada loja (a página fica em `/lojas/<id>` no frontend). Para entrar com uma conta de demonstração, use o e-mail dela e a senha definida em `SEED_DEMO_PASSWORD`.

Em um banco vazio, a execução resulta em 13 categorias (as 8 oficiais e 5 subcategorias de Eletrônicos: `celulares`, `notebooks`, `tvs`, `acessorios` e `outros`), 15 contas, 15 lojas e 36 produtos. Não cria imagens, logos, avaliações nem comentários.

**Regra de estoque da demonstração:** o Figma mostra apenas "disponível" ou "indisponível". Produto disponível recebe estoque **10**; indisponível recebe **0**.

##### Lojas

Nomes e categorias seguem a lista de lojas do Figma. As contas são fictícias e existem apenas para serem donas das lojas.

| Loja | Categoria | Conta proprietária | Produtos |
| --- | --- | --- | --- |
| CJR | Mercado | `demo.cjr@example.com` | 3 |
| Maumar | Mercado | `demo.maumar@example.com` | 3 |
| Mini Reno | Casa | `demo.mini-reno@example.com` | 0 |
| Rare Beauty | Beleza | `demo.rare-beauty@example.com` | 5 |
| The Cro Brew | Mercado | `demo.the-cro-brew@example.com` | 2 |
| Amoca | Moda | `demo.amoca@example.com` | 0 |
| Creamy Skincare | Beleza | `demo.creamy-skincare@example.com` | 4 |
| SneakerStore | Moda | `demo.sneakerstore@example.com` | 0 |
| d’carts & baskets | Mercado | `demo.dcarts-baskets@example.com` | 2 |
| Repiit | Eletrônicos | `demo.repiit@example.com` | 3 |
| Fluffy House | Casa | `demo.fluffy-house@example.com` | 0 |
| Melina Couture | Moda | `demo.melina-couture@example.com` | 0 |
| Electree | Eletrônicos | `demo.electree@example.com` | 10 |
| Roots | Beleza | `demo.roots@example.com` | 4 |
| Whiskers | Moda | `demo.whiskers@example.com` | 0 |

##### Produtos

Nomes, preços e disponibilidade vêm da lista de produtos legíveis do Figma. Em 33 dos 36 produtos a loja não foi identificada: o vínculo é uma **associação de demonstração** com uma loja da mesma categoria, **não uma informação confirmada pelo Figma**.

| Produto | Preço (R$) | Estoque | Categoria | Loja | Vínculo com a loja |
| --- | --- | --- | --- | --- | --- |
| Computador Lenovo | 3899,99 | 10 | Eletrônicos > Notebooks | Repiit | Logo no card do Figma |
| Computador Samsung | 8549,99 | 0 | Eletrônicos > Notebooks | Repiit | Logo no card do Figma |
| Smart TV Philips | 1229,00 | 10 | Eletrônicos > TVs | Repiit | Logo no card do Figma |
| iPhone 15 | 4769,10 | 10 | Eletrônicos | Electree | Associação de demonstração |
| Xbox Series X | 3599,99 | 10 | Eletrônicos | Electree | Associação de demonstração |
| Macbook Air | 15899,99 | 10 | Eletrônicos | Electree | Associação de demonstração |
| iPhone 16 | 4598,99 | 0 | Eletrônicos | Electree | Associação de demonstração |
| S25 Ultra | 5769,10 | 10 | Eletrônicos | Electree | Associação de demonstração |
| iPad | 7859,00 | 10 | Eletrônicos | Electree | Associação de demonstração |
| Headset Gamer | 899,99 | 0 | Eletrônicos | Electree | Associação de demonstração |
| Nintendo Switch 2 | 4799,99 | 0 | Eletrônicos | Electree | Associação de demonstração |
| JBL | 1399,00 | 10 | Eletrônicos | Electree | Associação de demonstração |
| Xbox Series S | 1499,99 | 10 | Eletrônicos | Electree | Associação de demonstração |
| Lápis Labial | 139,90 | 10 | Beleza | Rare Beauty | Associação de demonstração |
| Contorno | 289,90 | 10 | Beleza | Creamy Skincare | Associação de demonstração |
| Iluminador | 249,90 | 10 | Beleza | Roots | Associação de demonstração |
| Primer | 139,00 | 10 | Beleza | Rare Beauty | Associação de demonstração |
| Máscara de Cílios | 109,99 | 10 | Beleza | Creamy Skincare | Associação de demonstração |
| Mini Blush | 99,99 | 0 | Beleza | Roots | Associação de demonstração |
| Pó Compacto | 119,50 | 10 | Beleza | Creamy Skincare | Associação de demonstração |
| Perfume Rare | 599,90 | 10 | Beleza | Rare Beauty | Associação de demonstração |
| Bronzer | 254,99 | 10 | Beleza | Roots | Associação de demonstração |
| Bruma Facial | 149,00 | 0 | Beleza | Rare Beauty | Associação de demonstração |
| Batom | 179,00 | 10 | Beleza | Creamy Skincare | Associação de demonstração |
| Blush | 199,99 | 0 | Beleza | Roots | Associação de demonstração |
| Gel Perfumado | 179,99 | 10 | Beleza | Rare Beauty | Associação de demonstração |
| Brownie Meio Amargo | 4,70 | 10 | Mercado | CJR | Associação de demonstração |
| Brownie Tradicional | 3,80 | 0 | Mercado | Maumar | Associação de demonstração |
| Nozes (preço por kg) | 29,99 | 10 | Mercado | The Cro Brew | Associação de demonstração |
| Banana (preço por kg) | 3,99 | 10 | Mercado | d’carts & baskets | Associação de demonstração |
| Limão Siciliano (preço por kg) | 17,99 | 0 | Mercado | CJR | Associação de demonstração |
| Leite | 4,99 | 10 | Mercado | Maumar | Associação de demonstração |
| Manteiga | 23,99 | 10 | Mercado | The Cro Brew | Associação de demonstração |
| Leite Condensado | 7,99 | 10 | Mercado | d’carts & baskets | Associação de demonstração |
| Coca-Cola | 3,99 | 10 | Mercado | CJR | Associação de demonstração |
| Farinha de Trigo | 6,99 | 10 | Mercado | Maumar | Associação de demonstração |

##### Proteções e comportamento

- Sem `SEED_DEMO="true"` (exatamente esse valor), a seed cria apenas as categorias oficiais.
- É recusada, sem gravar nada, com `NODE_ENV="production"`, com banco fora de `localhost` ou sem senha válida. A checagem de host não detecta um túnel que exponha um servidor remoto em `localhost`.
- Pode ser repetida: só cria o que falta e não altera nem apaga registros. Lojas são reconhecidas por conta e nome, e produtos por loja e nome; renomear um deles, ou mudar sua loja na lista, faz a próxima execução criar outro. Trocar a senha na variável não muda contas já criadas.
- Lojas e produtos semeados são registros comuns: a conta proprietária os edita e exclui pela API. Uma nova execução recria o que foi excluído e mantém o que foi editado (exceto o nome, como descrito acima). Excluir uma loja exclui os produtos dela.
- Se uma conta existente usar só o e-mail ou só o nome de usuário de demonstração, ou se um dos slugs de subcategoria já existir fora de Eletrônicos, nada de demonstração é gravado (as categorias oficiais permanecem).

##### Pendências

Itens do inventário do Figma que **não** são cadastrados, porque não constam da lista de produtos com preço e disponibilidade legíveis:

- **Mercado:** Red Bull.
- **Eletrônicos:** Computador Lenovo (segundo card), Apple Watch, Cabo USB, Micro SD, iPhone 4, PlayStation 5, Galaxy Z Fold, Nintendo 3DS, Galaxy A06, Monitor (dois cards), Teclado e Mouse, Mouse, Smart TV Neo, Soundbar, Vitrola e Smart TV.
- **Beleza:** segundos cards de Contorno, Primer e Blush; dois outros cards de Gel Perfumado; Batom Líquido, Caneta de Maquiagem, Gel de Banho, Mist Perfumado, Gel para S., Sombras, Pó, Sombra Líquida, Creme para Mão e Delineador.

Cards com rótulo inconsistente no próprio Figma, que precisam de revisão: "Comp. Samsung" com foto de batom, "iPhone 16" com foto de cosmético, "Comp. Lenovo" com foto de fones e "iPhone 15" com foto de relógio. Os produtos de mesmo nome cadastrados acima usam apenas o preço e a disponibilidade da lista de produtos legíveis.

##### Limitações

- As lojas de Casa e Moda ficam sem produtos, e Farmácia, Jogos e Brinquedos não têm lojas nem produtos.
- O iPhone 15 e o Xbox Series X aparecem, num frame de categoria, com logos de lojas que não estão na lista; por isso o vínculo deles é de demonstração.
- As subcategorias dos três produtos da Repiit foram deduzidas pelo tipo do produto. Os demais ficam direto na categoria raiz, e os filtros Celulares, Acessórios e Outros ficam vazios.
- A API não tem unidade de medida: o preço por quilo é registrado só na descrição, e as telas que não mostram a descrição não indicam "/kg".
- O repositório não tem arquivos de logos nem de imagens de produtos, e a API não faz upload. Nenhuma URL foi inventada ou baixada de terceiros: os campos ficam vazios.

##### Exibição no frontend

Situação conferida em 26/11/2026:

- Na branch `dev` do frontend (`1d6982f`), a home consulta `/products?category=`, que a API recusa, e a página de categoria usa dados fixos. **Os produtos da seed não aparecem.**
- Na branch `feature/integracao-produtos` (`e0ccf45`, ainda não integrada), a página de categoria inclui as subcategorias diretas. **A home não inclui subcategorias**: os três produtos da Repiit aparecem só na página de Eletrônicos. A home mostra até 5 produtos por categoria raiz.

### Produtos

Um produto pertence a uma loja e a uma categoria. As lojas são criadas e geridas pelas rotas de [Lojas](#lojas).

- **Campos:** `storeId` e `categoryId` (ids existentes), `name` (até 255 caracteres, sem espaços nas pontas), `description` (opcional, até 5000 caracteres, aceita `null`), `price` e `stock`. A resposta traz também `id`, `createdAt` e `updatedAt`.
- **Preço:** número JSON de `0` a `999999.99` com no máximo 2 casas decimais (coluna `DECIMAL(8,2)`). Texto como `"19.99"` é rejeitado e a resposta devolve número.
- **Estoque:** inteiro de `0` a `2147483647`.
- **Autorização:** leituras são públicas. Criar, editar e excluir exigem token válido e que a conta seja dona da loja do produto; caso contrário a API responde `403` (`STORE_NOT_OWNED` ao criar, `PRODUCT_NOT_OWNED` ao editar e excluir) e nada muda. Um produto inexistente responde `404` (`PRODUCT_NOT_FOUND`).
- **Referências:** loja ou categoria inexistentes respondem `400` (`STORE_NOT_FOUND`, `CATEGORY_NOT_FOUND`).
- **Edição:** envie só os campos a mudar. A loja não pode ser trocada (`storeId` responde `400`). `description: null` remove a descrição.
- **Exclusão:** remove também as imagens e avaliações do produto (`ON DELETE CASCADE`). A loja e a categoria permanecem.
- **Listagem:** `GET /products` ordena por nome e depois por id. Filtros: `storeId` e `categoryId` (categoria exata, sem subcategorias). Paginação: `limit` (padrão 50, máximo 100) e `offset`.
- **Imagens:** `GET /products/:id` devolve `images` (ordenadas por `sortOrder` e depois `id`; lista vazia se não houver). Para gerenciá-las, veja [Imagens de produtos](#imagens-de-produtos). `images` no corpo de criação ou edição do produto responde `400`.

```bash
curl -X POST http://localhost:3001/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"storeId":1,"categoryId":1,"name":"Fone Bluetooth","price":199.9,"stock":25}'
```

### Imagens de produtos

Um produto pode ter várias imagens, usadas no detalhe do produto (RF27). **O projeto não tem serviço de upload nem armazenamento de arquivos:** a API guarda apenas o **link** (`imageUrl`) de uma imagem já hospedada em outro lugar. Enviar o arquivo da imagem (multipart ou base64) fica fora desta etapa e exigiria uma decisão de infraestrutura.

- **Campos:** `imageUrl` (obrigatório na criação) e `sortOrder` (opcional). A resposta traz também `id` e `productId`. O produto é o da rota e não pode ser trocado (`productId` no corpo responde `400`).
- **Link:** URL absoluta `http` ou `https`, com host, até 255 caracteres e sem espaços ou caracteres de controle. `ftp:`, `javascript:`, `data:`, `file:`, caminhos relativos e links sem protocolo respondem `400`. A API não confere se o link abre nem se é uma imagem.
- **Ordem:** `sortOrder` é inteiro de `0` a `2147483647`; `0` é a primeira imagem. Se for omitido na criação, a imagem vai depois da última (`0` quando o produto não tem imagens). Não há reordenação automática e pode haver lacunas, por exemplo depois de remover uma imagem.
- **Ordem já usada:** criar ou editar com um `sortOrder` que outra imagem do mesmo produto já usa responde `409` (`IMAGE_ORDER_TAKEN`) e nada muda. Para trocar duas imagens de lugar, mova uma para uma ordem livre primeiro. Editar uma imagem com a ordem que ela já tem é aceito. A mesma ordem pode existir em produtos diferentes.
- **Listagem:** sempre por `sortOrder` e depois `id`, sem paginação.
- **Autorização:** leituras são públicas. Adicionar, editar e remover exigem token válido e que a conta seja dona da loja do produto; caso contrário `403` (`PRODUCT_NOT_OWNED`) e nada muda.
- **Erros `404`:** `PRODUCT_NOT_FOUND` se o produto não existe e `PRODUCT_IMAGE_NOT_FOUND` se a imagem não existe **ou pertence a outro produto**. O produto é verificado antes da imagem. Ids da rota que não sejam inteiros positivos de 32 bits respondem `400`.
- **Edição:** envie só o que mudar (`imageUrl` e/ou `sortOrder`); `null` responde `400`. Um corpo vazio devolve a imagem como está.
- **Exclusão do produto:** remove também todas as suas imagens (`ON DELETE CASCADE`); as de outros produtos não mudam. Remover uma imagem não altera as demais.
- **Concorrência:** duas escritas simultâneas na mesma ordem resultam em uma só gravada e a outra em `409`.
- **Banco:** a tabela `product_images` já era suficiente; não houve mudança de schema nem migration.

```bash
curl -X POST http://localhost:3001/products/1/images \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://cdn.exemplo.com/produtos/fone-frente.jpg","sortOrder":0}'
### Lojas

Cobre RF31 a RF35 (ver, cadastrar, excluir, editar e listar lojas; US23 a US26). A página visual da loja (RF30/US22) é do frontend: ela usa `GET /stores/:id` e `GET /products?storeId=<id>`.

- **Campos:** `categoryId` (id existente) e `name` (até 255 caracteres, sem espaços nas pontas) são obrigatórios. `description` (até 5000 caracteres), `logoUrl`, `bannerUrl` e `stickerUrl` são opcionais e aceitam `null`. As três imagens são endereços `http`/`https` (até 255 caracteres, sem usuário e senha na URL); o envio de arquivos é outra tarefa. A resposta traz também `id`, `userId` (dono), `createdAt` e `updatedAt`; o detalhe traz ainda `category` (`id`, `name`, `slug`).
- **Dono:** é sempre a conta do token. `userId` no corpo responde `400`, tanto ao criar quanto ao editar, então não dá para criar loja em nome de outra conta nem transferir uma loja. Uma conta pode ter várias lojas, e nomes repetidos são permitidos.
- **Autorização:** leituras são públicas. Criar exige token válido; editar e excluir exigem também que a conta seja dona da loja, caso contrário `403` (`STORE_NOT_OWNED`) e nada muda. Loja inexistente responde `404` (`STORE_NOT_FOUND`); categoria inexistente responde `400` (`CATEGORY_NOT_FOUND`). Conflitos de concorrência respondem `409` (`REFERENCE_CHANGED` ou `WRITE_CONFLICT`).
- **Edição:** envie só os campos a mudar. `description`, `logoUrl`, `bannerUrl` e `stickerUrl` com `null` removem o valor; `name` e `categoryId` não aceitam `null`. Corpo vazio devolve o estado atual.
- **Exclusão:** é definitiva e remove, na mesma transação, os produtos da loja (com as imagens e avaliações deles), as avaliações da loja e os comentários dessas avaliações (`ON DELETE CASCADE`). A categoria e as contas permanecem. Depois disso, a categoria da loja pode ser excluída, pois deixa de estar em uso por ela.
- **Listagem:** `GET /stores` ordena por nome e depois por id. Filtros: `categoryId` (categoria exata, sem subcategorias) e `userId` (lojas de um dono, útil para "minhas lojas"). Paginação: `limit` (padrão 50, máximo 100) e `offset`.

```bash
curl -X POST http://localhost:3001/stores \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"categoryId":1,"name":"Loja do João","description":"Eletrônicos"}'
```

### Usuário

Todas as respostas que devolvem um usuário têm este formato. Senha e hash nunca aparecem.

```json
{
  "id": 1,
  "name": "Ana Souza",
  "username": "ana.souza",
  "email": "ana@exemplo.com",
  "profilePictureUrl": null,
  "createdAt": "2026-10-14T01:08:35.844Z",
  "updatedAt": "2026-10-14T01:08:35.844Z"
}
```

### `POST /users` — cadastro

```bash
curl -X POST http://localhost:3001/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Ana Souza","username":"ana.souza","email":"ana@exemplo.com","password":"senha-segura","passwordConfirmation":"senha-segura"}'
```

| Campo | Regra |
| --- | --- |
| `name` | obrigatório, até 255 caracteres, sem caracteres de controle |
| `username` | 3 a 50 caracteres: letras, números, `.`, `-`, `_`; gravado em minúsculas |
| `email` | e-mail válido, até 255 caracteres; gravado em minúsculas |
| `password` | mínimo de 8 caracteres e máximo de 72 bytes; usada exatamente como enviada |
| `passwordConfirmation` | igual a `password` |

Responde 201 com o usuário. Não faz login: depois do cadastro, chame `POST /auth/login`.

### `POST /auth/login` — entrar

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ana@exemplo.com","password":"senha-segura"}'
```

```json
{ "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

O e-mail não diferencia maiúsculas. O token vale 1 dia; não há renovação nem logout no servidor (para sair, o frontend descarta o token). Senha errada e e-mail desconhecido respondem o mesmo 401.

### Rotas privadas

Envie o token em todas elas:

```
Authorization: Bearer <accessToken>
```

```bash
# ver meu perfil
curl http://localhost:3001/users/me -H "Authorization: Bearer $TOKEN"

# editar: envie só o que quer mudar
curl -X PATCH http://localhost:3001/users/me \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Ana Maria Souza","profilePictureUrl":"https://exemplo.com/ana.png"}'

# excluir minha conta
curl -X DELETE http://localhost:3001/users/me -H "Authorization: Bearer $TOKEN"
```

**`PATCH /users/me`** aceita qualquer subconjunto de `name`, `username`, `email` (mesmas regras do cadastro) e `profilePictureUrl` (URL `http` ou `https` de até 255 caracteres, sem usuário e senha embutidos; `null` remove a foto). Corpo vazio devolve o perfil atual. `password`, `id` e qualquer outro campo respondem 400. Responde 200 com o usuário atualizado.

**`DELETE /users/me`** responde 204 sem corpo. A exclusão é definitiva e remove, na mesma operação, tudo o que pertence à conta: lojas (com produtos, imagens e avaliações das lojas), avaliações feitas por ela, comentários que ela escreveu e os códigos de recuperação. Categorias são dados compartilhados e não são afetadas. A rota é autorizada pelo JWT e atua somente sobre a conta autenticada: não recebe id no caminho nem no corpo. Depois da exclusão, o token dessa conta passa a responder 401.

**`PATCH /users/me/password`** troca a senha da conta autenticada. Corpo: `currentPassword`, `newPassword` (mesmas regras do cadastro) e `newPasswordConfirmation`. Senha atual errada responde 400 `CURRENT_PASSWORD_INCORRECT`. Responde 204.

### Recuperação de senha

1. `POST /auth/forgot-password` com `{ "email": "..." }`. Responde sempre **202** com `{ "message": "Request received." }`, exista ou não a conta, e nunca inclui o código.
2. O código de 6 dígitos vale 15 minutos, serve uma única vez e é invalidado após 5 tentativas erradas. Um novo pedido invalida os códigos anteriores.
3. `POST /auth/reset-password` com `{ "email", "code", "password", "passwordConfirmation" }`. Responde 204. Código errado, expirado, já usado ou de e-mail desconhecido respondem 400 `RESET_CODE_INVALID`, sempre com a mesma mensagem.

**Limitações, para ler antes de usar:**

- **Não há canal real de envio.** O projeto não tem serviço de e-mail. Em desenvolvimento (`NODE_ENV` diferente de `production` e de `test`), o código aparece no **console do servidor**, como `DEVELOPMENT ONLY - reset code for ...`. Esse canal recusa rodar em produção. Em produção hoje não há canal configurado: o pedido responde 202, mas nenhum código é entregue. Escolher e integrar um canal real é pendência de infraestrutura; esta entrega não afirma envio real.
- **Token após troca de senha.** O JWT continua válido até expirar (1 dia) após troca ou recuperação de senha. Não há invalidação de tokens antigos.
- **Logout** não existe no servidor: o frontend descarta o token.

### Erros

As mensagens vêm em inglês. No frontend, decida pelo `statusCode`, pelo `code` e por `fields`, não pelo texto.

| Status | Quando | Corpo |
| --- | --- | --- |
| 400 | dados inválidos ou campo não permitido | `message` é uma lista; cada item começa pelo nome do campo, exceto campo não permitido, que vem como `property <campo> should not exist` |
| 401 | login: credenciais erradas | `message: "Invalid credentials"` |
| 401 | rota privada: token ausente, inválido, expirado ou de conta excluída | `message: "Unauthorized"` |
| 409 | e-mail ou username em uso (cadastro e edição) | `code: "UNIQUE_CONFLICT"`, `fields` com os campos |
| 400 | código de recuperação inválido, expirado ou já usado | `code: "RESET_CODE_INVALID"` |
| 400 | senha atual incorreta na troca de senha | `code: "CURRENT_PASSWORD_INCORRECT"` |
| 500 | erro inesperado | `message: "Internal server error"`; o detalhe fica só no log do servidor |

```json
{ "statusCode": 400, "error": "Bad Request", "message": ["email must be an email", "property role should not exist"] }
```

```json
{ "statusCode": 409, "error": "Conflict", "code": "UNIQUE_CONFLICT", "message": "email already in use", "fields": ["email"] }
```

```json
{ "statusCode": 401, "message": "Unauthorized" }
```

Em pedidos simultâneos, `fields` pode trazer só um dos campos em conflito.

### Exemplo com Axios

```ts
const api = axios.create({ baseURL: 'http://localhost:3001' });

const { data } = await api.post('/auth/login', { email, password });
api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;

const me = await api.get('/users/me');
```

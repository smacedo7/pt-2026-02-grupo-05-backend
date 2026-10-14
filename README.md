# PT 2026.2 — Grupo 05 — Backend

API do projeto do grupo 05, em NestJS + TypeScript, com PostgreSQL e Prisma.

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

3. Crie o arquivo `.env` na raiz, trocando `USUARIO` e `SENHA` pelos do seu PostgreSQL local. Sem senha, use `postgresql://USUARIO@localhost:5432/...`.

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

Os arquivos `.env` e `.env.test` são locais. O `.gitignore` ignora qualquer arquivo `.env*`; nunca force a inclusão deles em um commit.

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

Models que se relacionam com `User` (lojas, avaliações, comentários) devem declarar a relação como obrigatória e com `onDelete: Restrict`.

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

Não existe listagem de usuários nem consulta por id. Recuperação e troca de senha não fazem parte desta entrega.

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

**`DELETE /users/me`** responde 204 sem corpo. A exclusão é definitiva; depois dela, o token dessa conta passa a responder 401.

> **Limitação conhecida da exclusão.** A regra do projeto é que uma conta com lojas, avaliações ou comentários não pode ser excluída (409 `USER_HAS_LINKED_RECORDS`). Esses models ainda não existem no banco, então hoje **toda conta pode ser excluída** e essa proteção **não foi verificada com as relações reais** — só o mecanismo foi testado, com uma tabela temporária. Ela passa a valer quando cada model novo declarar a relação com `User` com `onDelete: Restrict`, e cada relação precisa do seu próprio teste.

### Erros

As mensagens vêm em inglês. No frontend, decida pelo `statusCode`, pelo `code` e por `fields`, não pelo texto.

| Status | Quando | Corpo |
| --- | --- | --- |
| 400 | dados inválidos ou campo não permitido | `message` é uma lista; cada item começa pelo nome do campo, exceto campo não permitido, que vem como `property <campo> should not exist` |
| 401 | login: credenciais erradas | `message: "Invalid credentials"` |
| 401 | rota privada: token ausente, inválido, expirado ou de conta excluída | `message: "Unauthorized"` |
| 409 | e-mail ou username em uso (cadastro e edição) | `code: "UNIQUE_CONFLICT"`, `fields` com os campos |
| 409 | exclusão bloqueada por registros vinculados | `code: "USER_HAS_LINKED_RECORDS"` |
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

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

Não existe listagem de usuários nem consulta por id.

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


### 🚨 1. CRÍTICO: Quebra de Atomicidade nas Transações (Risco de Corrupção de Dados)

Este é o problema mais grave do projeto. Estás a misturar duas formas de acesso à base de dados dentro da mesma "transação", o que anula a proteção contra erros.

**O Problema:**
No ficheiro `config/db.ts`, tens uma função `withTransaction` que usa um cliente `pg` (PostgreSQL nativo) para fazer `BEGIN` e `COMMIT`.
No entanto, dentro dos teus controllers (ex: `schedule.controller.ts`, `inventory.controller.ts`), misturas chamadas `db.query(...)` (que usam a transação) com chamadas `supabase.from(...)`.

**Por que é grave?**
O cliente `supabase-js` comunica via HTTP (REST) e **não partilha a conexão** nem a sessão da transação do cliente `pg`.
Se a transação do `pg` falhar e fizer `ROLLBACK`, as alterações feitas pelo `supabase.from(...)` **NÃO serão revertidas**, pois já foram confirmadas noutra conexão independente.

**Exemplo Prático (inventory.controller.ts - `updateStock`):**

1. O código bloqueia a peça com `db.query(..., FOR UPDATE)`.
2. Calcula o novo stock.
3. Se usares `supabase.from` nalgum sítio intermédio (como em logs ou notificações dentro da transação) e o update final falhar, ficas com dados órfãos.
*Nota: Em `createSchedule`, fazes inserts manuais, mas se o `inventoryService` usar `supabase` internamente, o stock é descontado mesmo que o agendamento falhe.*

**Solução:**
Dentro de um bloco `withTransaction`, **NUNCA** uses `supabase.from`. Deves passar o `client` da transação para todas as funções de serviço e usar apenas SQL nativo (`client.query`) para garantir que tudo é revertido em caso de erro.

---

### ⚠️ 2. PERFORMANCE: Ausência de Paginação (Bomba Relógio)

Vários endpoints devolvem a tabela inteira. Atualmente funciona porque tens poucos dados, mas o backend vai bloquear quando o sistema crescer.

**Onde acontece:**

* `schedule.controller.ts` -> `getSchedules`: Faz `select *` em todos os agendamentos da história.
* `report.controller.ts` -> `getReports`: Carrega todos os relatórios.
* `ticket.controller.ts` -> `getTickets`.

**O Impacto:**
Quando tiveres 10.000 agendamentos, o request vai demorar 10 segundos a processar, consumir 500MB de RAM e possivelmente crashar o servidor (OOM - Out of Memory).

**Solução:**
Implementar paginação baseada em cursor ou offset.

```typescript
// Exemplo de correção
const page = Number(req.query.page) || 1;
const limit = 20;
const offset = (page - 1) * limit;

const { data } = await supabase
    .from('schedules')
    .select('*')
    .range(offset, offset + limit); // Paginação do Supabase

```

---

### 🔒 3. SEGURANÇA: Configuração de CORS e Body Parser

1. **CORS Permissivo:** Em `index.ts`, tens `app.use(cors())`. Isto permite que *qualquer* site na internet faça pedidos ao teu backend. Deves restringir isto ao domínio do teu frontend.
2. **Limite de Body Excessivo:** `app.use(bodyParser.json({ limit: '50mb' }))`. 50MB é demasiado para JSON. Abre portas a ataques de Negação de Serviço (DoS) onde alguém envia JSONs gigantes para entupir a memória do servidor.
* *Sugestão:* Mantém 50MB apenas para rotas de upload de ficheiros e reduz para 100kb nas restantes.



---

### 💡 4. Lógica de Inventário (Recursividade em JS vs SQL)

Em `inventory.controller.ts`, a função `calculateVirtualStock` faz recursividade em memória (JavaScript) para calcular stock de kits compostos.
Isto gera o problema **N+1 Queries** (fazes uma query nova para cada componente, de cada peça, recursivamente).

**Solução:**
Usa **CTE Recursivas (Common Table Expressions)** do PostgreSQL. Podes resolver a árvore de componentes inteira numa única query SQL, que é 100x mais rápida.
*Nota: Já usas `WITH RECURSIVE` em `getPartComponents` (excelente!), deves aplicar a mesma lógica para o cálculo de stock virtual.*

---

### 🛠️ Sugestões de Melhoria de Código (Refactoring)

**A. Tipagem Fraca (`any`)**
O código tem uso excessivo de `as any`.

* Exemplo: `(s.clients as any)?.name`.
* Isto anula a vantagem do TypeScript. Como estás a usar Supabase, podes gerar os tipos da base de dados automaticamente (`supabase gen types`) e usá-los para ter intellisense real.

**B. Race Conditions no Google Calendar Sync**
Em `googleCalendarService.ts`, a função `syncAllUnsynced` percorre agendamentos num loop `for...of` e faz `await` em cada um.

* Se tiveres 100 agendamentos para sincronizar e cada um demorar 1s (Google API é lenta), o pedido demora quase 2 minutos e vai dar *timeout* no frontend.
* **Melhoria:** Usa uma fila de processamento (como BullMQ) ou processa em background sem fazer o utilizador esperar pela resposta HTTP.

**C. Hardcoded Strings (Modelos de Email)**
No `index.ts`, tens HTML de email misturado com lógica de servidor.

* **Melhoria:** Move o HTML para ficheiros `.hbs` (Handlebars) ou `.ejs` numa pasta `templates/` e usa um motor de templates. Facilita a manutenção e tradução.

---

### Resumo do Plano de Ação

1. **Imediato:** Reescrever os Services (`inventoryService`, `scheduleService`) para aceitarem um `PoolClient` do Postgres como argumento opcional, para que possam participar na transação atómica iniciada nos controllers. **Eliminar uso misto de Supabase Client dentro de transações SQL.**
2. **Curto Prazo:** Adicionar `limit` e `offset` (paginação) nos endpoints `GET` principais.
3. **Segurança:** Restringir o CORS para o URL do teu frontend.

Se quiseres, posso reescrever o `inventoryService.ts` para corrigir a falha da transação (passando o cliente DB corretamente). Queres que faça isso?
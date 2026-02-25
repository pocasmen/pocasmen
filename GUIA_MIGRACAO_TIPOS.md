# Guia de Implementação Gradual dos Tipos TypeScript do Supabase

## Estratégia de Migração

A implementação dos tipos TypeScript do Supabase deve ser feita **gradualmente** para evitar quebrar o código existente. Este documento define a estratégia recomendada.

---

## Fase 1: Configuração Base ✅ CONCLUÍDA

- [x] Gerar tipos do schema (`db.types.ts`)
- [x] Criar helper types (`supabase.ts`)
- [x] Configurar Supabase client com tipos (`config/supabase.ts`)
- [x] Criar documentação e exemplos

---

## Fase 2: Novos Ficheiros (PRÓXIMO PASSO)

**Regra:** Todo **novo código** deve usar os tipos do Supabase.

### Exemplo: Novo Controller

```typescript
import { supabase } from '../config/supabase';
import { Client, ClientInsert } from '../types/supabase';

export const createClient = async (data: ClientInsert): Promise<Client | null> => {
  const { data: client, error } = await supabase
    .from('clients')
    .insert(data)
    .select()
    .single();

  if (error) return null;
  return client; // Tipo Client inferido automaticamente
};
```

---

## Fase 3: Refatoração Gradual de Código Existente

### Prioridade de Migração

1. **Alta Prioridade** (Código crítico):
   - `inventoryService.ts` - Lógica de stock
   - `billingService.ts` - Faturação
   - `authService.ts` - Autenticação

2. **Média Prioridade** (Código frequentemente modificado):
   - Controllers principais (client, equipment, schedule, report)
   - Services auxiliares

3. **Baixa Prioridade** (Código estável):
   - Utilities
   - Helpers
   - Scripts

### Abordagem por Ficheiro

Para cada ficheiro a migrar:

1. **Identificar queries Supabase**
   ```typescript
   // Antes
   const { data } = await supabase.from('clients').select('*');
   ```

2. **Adicionar type assertion quando necessário**
   ```typescript
   // Depois
   import { Client } from '../types/supabase';
   
   const { data } = await supabase
     .from('clients')
     .select('*');
   
   // data é automaticamente tipado como Client[] | null
   ```

3. **Queries com joins complexos**
   ```typescript
   // Para joins nested, criar tipo local
   type ScheduleWithRelations = {
     id: number;
     title: string;
     // ... outros campos
     schedule_technicians: Array<{ technicianId: string }>;
   };
   
   const { data: raw } = await supabase
     .from('schedules')
     .select('*, schedule_technicians(technicianId)');
   
   const schedules = raw as unknown as ScheduleWithRelations[];
   ```

---

## Fase 4: Eliminar `any` e Type Assertions Desnecessárias

### Padrões a Evitar

❌ **Evitar:**
```typescript
const { data } = await supabase.from('clients').select('*');
const clients = data as any;
```

✅ **Preferir:**
```typescript
const { data: clients } = await supabase
  .from('clients')
  .select('*');

// clients é automaticamente Client[] | null
```

### Quando Usar Type Assertions

**Apenas** quando:
1. Queries com joins complexos (nested)
2. Transformações de dados complexas
3. Compatibilidade com código legado

---

## Problemas Conhecidos e Soluções

### 1. Queries com Joins Nested

**Problema:** TypeScript não infere tipos para joins nested.

**Solução:**
```typescript
// Definir tipo local para a query
type ScheduleWithJoins = {
  id: number;
  // ... campos base
  schedule_technicians: Array<{ technicianId: string }>;
  schedule_parts: Array<{ partId: number; quantity: number }>;
};

const { data: raw } = await supabase
  .from('schedules')
  .select(`
    *,
    schedule_technicians(technicianId),
    schedule_parts(partId, quantity)
  `);

const schedules = raw as unknown as ScheduleWithJoins[];
```

### 2. Campos `null` vs `undefined`

**Problema:** Supabase retorna `null`, mas tipos TypeScript usam `undefined`.

**Solução:**
```typescript
// Converter null para undefined quando necessário
const internalNotes = schedule.additionalInfo ?? undefined;
```

### 3. JSON Fields

**Problema:** Campos JSON não têm tipo específico.

**Solução:**
```typescript
// Definir tipo para o campo JSON
type ServiceType = 'manutencao' | 'instalacao' | 'reparacao';

interface ScheduleRow {
  // ... outros campos
  serviceType: ServiceType[];
}

// Usar com type assertion
const schedule = data as ScheduleRow;
```

---

## Checklist de Migração por Ficheiro

Ao migrar um ficheiro:

- [ ] Importar tipos necessários de `../types/supabase`
- [ ] Substituir `any` por tipos específicos
- [ ] Adicionar tipos a parâmetros de função
- [ ] Adicionar tipos de retorno a funções
- [ ] Testar que o código compila sem erros
- [ ] Testar funcionalidade em runtime
- [ ] Remover type assertions desnecessárias

---

## Exemplo Completo: Migração de um Controller

### Antes (Sem Tipos)

```typescript
export const getClientById = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw new ApiError(500, 'Error');
  
  res.json(data);
};
```

### Depois (Com Tipos)

```typescript
import { Client } from '../types/supabase';

export const getClientById = async (
  req: AuthenticatedRequest, 
  res: Response
): Promise<void> => {
  const { id } = req.params;
  
  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw new ApiError(500, 'Error fetching client', error.message);
  if (!client) throw new NotFoundError('Client not found');
  
  // client é do tipo Client
  res.json(client);
};
```

---

## Benefícios da Migração Gradual

✅ **Sem Breaking Changes:** Código existente continua a funcionar  
✅ **Aprendizagem Incremental:** Equipa aprende gradualmente  
✅ **Redução de Risco:** Problemas são isolados por ficheiro  
✅ **Melhoria Contínua:** Cada migração melhora a qualidade do código

---

## Próximos Passos Recomendados

1. **Semana 1-2:** Migrar `inventoryService.ts` e `billingService.ts`
2. **Semana 3-4:** Migrar controllers principais
3. **Mês 2:** Migrar services auxiliares
4. **Mês 3:** Eliminar todos os `any` restantes

---

**Atualizado:** 2026-02-11  
**Status:** Fase 1 Completa, Fase 2 em Progresso

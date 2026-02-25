# Tipos TypeScript do Supabase

Este diretório contém os tipos TypeScript gerados automaticamente do schema da base de dados Supabase.

## Ficheiros

- **`db.types.ts`**: Tipos principais gerados do schema do Supabase
- **`supabase.ts`**: Helper types para facilitar o uso dos tipos
- **`index.ts`**: Tipos customizados da aplicação

## Como Usar

### Importar Tipos de Tabelas

```typescript
import { Client, Schedule, Report } from '../types/supabase';

// Usar os tipos
const client: Client = {
  id: 1,
  name: 'João Silva',
  email: 'joao@example.com',
  // ...
};
```

### Tipos para Insert e Update

```typescript
import { ClientInsert, ClientUpdate } from '../types/supabase';

// Para criar um novo cliente
const newClient: ClientInsert = {
  name: 'Maria Santos',
  email: 'maria@example.com',
  hasContract: true
};

// Para atualizar um cliente
const updateData: ClientUpdate = {
  email: 'maria.novo@example.com'
};
```

### Usar com Supabase Client

```typescript
import { Database } from '../types/supabase';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

// Agora tens autocomplete e type-safety
const { data, error } = await supabase
  .from('clients')
  .select('*')
  .eq('id', 1)
  .single();

// data é do tipo Client | null
```

## Regenerar Tipos

Quando o schema da base de dados mudar, podes regenerar os tipos:

```bash
npm run gen:types
```

**Nota:** O comando `gen:types` usa o script `scripts/generate-types.js` que extrai automaticamente o Project ID do ficheiro `.env`.

## Tipos Disponíveis

### Tabelas Principais

- `Profile` / `ProfileInsert` / `ProfileUpdate`
- `Client` / `ClientInsert` / `ClientUpdate`
- `Equipment` / `EquipmentInsert` / `EquipmentUpdate`
- `Part` / `PartInsert` / `PartUpdate`
- `Schedule` / `ScheduleInsert` / `ScheduleUpdate`
- `Report` / `ReportInsert` / `ReportUpdate`
- `Ticket` / `TicketInsert` / `TicketUpdate`

### Tabelas Relacionais

- `ScheduleTechnician`
- `SchedulePart`
- `ScheduleTimeBlock`
- `ReportTechnician`
- `ReportPart`
- `PartComponent`
- `BillingTask`
- `AppSetting`

## Exemplo Completo

```typescript
import { supabase } from '../config/supabase';
import { Schedule, ScheduleInsert, Client } from '../types/supabase';

async function createSchedule(data: ScheduleInsert): Promise<Schedule | null> {
  const { data: schedule, error } = await supabase
    .from('schedules')
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error('Error creating schedule:', error);
    return null;
  }

  return schedule;
}

// Uso
const newSchedule = await createSchedule({
  title: 'Manutenção Preventiva',
  clientId: 1,
  equipmentId: 5,
  startDate: '2026-02-15T09:00:00Z',
  endDate: '2026-02-15T12:00:00Z',
  serviceType: ['manutencao'],
  classification: 'preventiva'
});
```

## Benefícios

✅ **Type Safety**: Erros de tipo são detetados em tempo de compilação  
✅ **Autocomplete**: IntelliSense completo no VS Code  
✅ **Refactoring**: Mudanças no schema são refletidas automaticamente  
✅ **Documentação**: Os tipos servem como documentação viva do schema  
✅ **Menos Bugs**: Previne erros comuns como campos mal escritos ou tipos incorretos

## Troubleshooting

### Erro: "Cannot find module './db.types'"

Certifica-te que o ficheiro `db.types.ts` existe. Se não existir, corre:

```bash
npm run gen:types
```

### Tipos Desatualizados

Se fizeste mudanças no schema do Supabase e os tipos não refletem essas mudanças:

1. Corre `npm run gen:types` para regenerar
2. Reinicia o TypeScript server no VS Code (`Ctrl+Shift+P` → "TypeScript: Restart TS Server")

---

**Última atualização:** 2026-02-11

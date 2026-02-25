# Padrões de Migração de Tipos Supabase

## ✅ Problema Identificado

O Supabase client está **corretamente configurado** com tipos em `config/supabase.ts`, MAS os controllers não estão a usar os tipos corretamente, resultando em inferência de tipo `never`.

---

## 🔧 Solução: 3 Padrões de Migração

### **Padrão 1: Select Completo (`'*'`)** ⭐ RECOMENDADO

**Antes (❌ Tipo `never`):**
```typescript
const { data, error } = await supabase
    .from('parts')
    .select('id, reference, designation, stock_quantity')
    .eq('reference', reference)
    .single();

// data é do tipo 'never' ❌
```

**Depois (✅ Tipo `Part`):**
```typescript
const { data, error } = await supabase
    .from('parts')
    .select('*')
    .eq('reference', reference)
    .single();

// data é automaticamente do tipo Part | null ✅
```

**Quando usar:** Sempre que possível. É o padrão mais simples e seguro.

---

### **Padrão 2: Type Assertion para Queries Específicas**

**Quando usar:** Quando precisas de apenas alguns campos (otimização) ou queries com joins.

```typescript
import { Part } from '../types/supabase';

// Para campos específicos
type PartBasic = Pick<Part, 'id' | 'reference' | 'designation' | 'stock_quantity'>;

const { data, error } = await supabase
    .from('parts')
    .select('id, reference, designation, stock_quantity')
    .eq('reference', reference)
    .single();

const part = data as PartBasic | null;
```

---

### **Padrão 3: Tipos Locais para Joins Complexos**

**Quando usar:** Queries com joins nested que o TypeScript não consegue inferir.

```typescript
import { Schedule, Client, Equipment } from '../types/supabase';

// Definir tipo local para a query com joins
type ScheduleWithRelations = Schedule & {
    clients: Pick<Client, 'id' | 'name'> | null;
    equipments: Pick<Equipment, 'id' | 'model'> | null;
    schedule_technicians: Array<{ technicianId: string }>;
};

const { data: raw, error } = await supabase
    .from('schedules')
    .select(`
        *,
        clients(id, name),
        equipments(id, model),
        schedule_technicians(technicianId)
    `);

const schedules = raw as ScheduleWithRelations[] | null;
```

---

## 📋 Checklist de Migração por Função

Para cada função de controller:

- [ ] Identificar queries Supabase
- [ ] Escolher padrão de migração (1, 2 ou 3)
- [ ] Aplicar padrão
- [ ] Remover `any` types
- [ ] Verificar que compila sem erros
- [ ] Testar em runtime

---

## 🎯 Exemplo Completo: Migração de `getPartByReference`

### Antes (❌ Erros de tipo `never`)
```typescript
export const getPartByReference = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const reference = req.params.reference;

    const { data, error } = await supabase
        .from('parts')
        .select('id, reference, designation, stock_quantity, reserved_quantity, stock_quantity_contract, reserved_quantity_contract')
        .eq('reference', reference)
        .single();

    if (error) {
        if (error.code === 'PGRST116') throw new NotFoundError('Part not found.');
        throw new ApiError(500, 'Failed to fetch part', error.message);
    }
    res.json(data); // ❌ data é 'never'
});
```

### Depois (✅ Tipos corretos)
```typescript
export const getPartByReference = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const reference = req.params.reference;

    // ✅ Usando '*' permite ao TypeScript inferir o tipo Part automaticamente
    const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('reference', reference)
        .single();

    if (error) {
        if (error.code === 'PGRST116') throw new NotFoundError('Part not found.');
        throw new ApiError(500, 'Failed to fetch part', error.message);
    }
    
    // ✅ data é agora do tipo Part | null automaticamente
    res.json(data);
});
```

---

## 🚨 Armadilhas Comuns

### ❌ **Armadilha 1: Select com campos específicos**
```typescript
// Isto resulta em tipo 'never'
.select('id, name, email')
```

**Solução:** Usar `'*'` ou type assertion.

### ❌ **Armadilha 2: Joins sem tipo local**
```typescript
// TypeScript não consegue inferir joins nested
.select('*, clients(name), equipments(model)')
```

**Solução:** Criar tipo local (Padrão 3).

### ❌ **Armadilha 3: Usar `any` em vez de tipos**
```typescript
const parts = data as any; // ❌ NÃO FAZER!
```

**Solução:** Usar os tipos gerados (`Part`, `Client`, etc.).

---

## 📊 Progresso da Migração

### ✅ Fase 1: Configuração Base
- [x] `db.types.ts` gerado
- [x] `supabase.ts` helper types criados
- [x] `config/supabase.ts` configurado com tipos
- [x] Documentação criada

### 🔄 Fase 2: Migração de Controllers
- [ ] `inventory.controller.ts` (1/28 funções migradas)
- [ ] `report.controller.ts` (0/28 funções)
- [ ] `schedule.controller.ts` (0/24 funções)
- [ ] Outros controllers

---

**Próximo Passo:** Migrar todas as funções do `inventory.controller.ts` usando os padrões acima.

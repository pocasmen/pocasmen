# Guia Prático: Correções Críticas - Backend

Este documento fornece instruções passo-a-passo para corrigir os problemas mais críticos identificados.


## 🚨 CORREÇÃO 2: SQL Injection (CRÍTICO)

### Problema
`inventory_controller.ts` linha 183+ usa interpolação direta de variáveis em queries SQL.

### Código Vulnerável
```typescript
// ❌ VULNERÁVEL
const query = `
  WITH RECURSIVE component_hierarchy AS (
    SELECT parent_part_id, child_part_id, quantity, 1 as level
    FROM part_components WHERE parent_part_id = ${partId}
    UNION ALL
    SELECT pc.parent_part_id, pc.child_part_id, pc.quantity, ch.level + 1
    FROM part_components pc
    INNER JOIN component_hierarchy ch ON pc.parent_part_id = ch.child_part_id
    WHERE ch.level < 10
  )
  SELECT * FROM component_hierarchy;
`;
const result = await db.query(query);
```

### Solução Correta
```typescript
// ✅ SEGURO - Usar parametrized queries
const query = `
  WITH RECURSIVE component_hierarchy AS (
    SELECT parent_part_id, child_part_id, quantity, 1 as level
    FROM part_components WHERE parent_part_id = $1
    UNION ALL
    SELECT pc.parent_part_id, pc.child_part_id, pc.quantity, ch.level + 1
    FROM part_components pc
    INNER JOIN component_hierarchy ch ON pc.parent_part_id = ch.child_part_id
    WHERE ch.level < 10
  )
  SELECT * FROM component_hierarchy;
`;
const result = await db.query(query, [partId]);
```

### Implementação Completa
```typescript
// inventory_controller.ts - getPartComponents
export const getPartComponents = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const partId = req.params.id;
    
    // Validar que partId é um número
    if (!partId || isNaN(Number(partId))) {
        throw new BadRequestError('Invalid part ID');
    }

    await withTransaction(async (db) => {
        const query = `
          WITH RECURSIVE component_hierarchy AS (
            SELECT 
              parent_part_id, 
              child_part_id, 
              quantity, 
              1 as level
            FROM part_components 
            WHERE parent_part_id = $1
            
            UNION ALL
            
            SELECT 
              pc.parent_part_id, 
              pc.child_part_id, 
              pc.quantity, 
              ch.level + 1
            FROM part_components pc
            INNER JOIN component_hierarchy ch 
              ON pc.parent_part_id = ch.child_part_id
            WHERE ch.level < 10
          )
          SELECT 
            ch.*,
            p.reference,
            p.designation
          FROM component_hierarchy ch
          LEFT JOIN parts p ON ch.child_part_id = p.id
          ORDER BY level, child_part_id;
        `;
        
        const result = await db.query(query, [partId]);
        return result.rows;
    });

    res.json(result);
});
```

### Teste de Segurança
```typescript
// Tentar injeção SQL (deve falhar com erro de tipo)
const maliciousInput = "1; DROP TABLE parts; --";
// Com parametrized queries, isto será tratado como string literal

// Teste automatizado
describe('SQL Injection Protection', () => {
    it('should prevent SQL injection in getPartComponents', async () => {
        const response = await request(app)
            .get('/api/inventory/parts/1; DROP TABLE parts; --/components')
            .expect(400); // Bad Request
            
        expect(response.body.error).toContain('Invalid part ID');
    });
});
```

---

## 🚨 CORREÇÃO 3: Validação de Input

### Problema
Falta validação de dados de entrada em todos os endpoints.

### Solução: Criar Schemas Zod

#### 1. Criar ficheiro de validação
```typescript
// src/validations/client.validation.ts
import { z } from 'zod';

export const createClientSchema = z.object({
    body: z.object({
        name: z.string()
            .min(2, 'Nome deve ter pelo menos 2 caracteres')
            .max(200, 'Nome não pode exceder 200 caracteres')
            .trim(),
        address: z.string()
            .max(500, 'Morada não pode exceder 500 caracteres')
            .optional(),
        city: z.string()
            .max(100, 'Cidade não pode exceder 100 caracteres')
            .optional(),
        postCode: z.string()
            .regex(/^\d{4}-\d{3}$/, 'Código postal inválido (formato: 1234-567)')
            .optional(),
        nif: z.string()
            .regex(/^\d{9}$/, 'NIF deve ter exatamente 9 dígitos')
    })
});

export const updateClientSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    }),
    body: z.object({
        name: z.string().min(2).max(200).trim().optional(),
        address: z.string().max(500).optional(),
        city: z.string().max(100).optional(),
        postCode: z.string().regex(/^\d{4}-\d{3}$/).optional(),
        nif: z.string().regex(/^\d{9}$/).optional()
    })
});
```

#### 2. Aplicar validação nas rotas
```typescript
// src/routes/client.routes.ts
import express from 'express';
import { validate } from '../middlewares/validate.middleware';
import { createClientSchema, updateClientSchema } from '../validations/client.validation';
import * as clientController from '../controllers/client.controller';

const router = express.Router();

router.post(
    '/',
    validate(createClientSchema),  // ✅ Adicionar validação
    clientController.createClient
);

router.put(
    '/:id',
    validate(updateClientSchema),  // ✅ Adicionar validação
    clientController.updateClient
);

export default router;
```

#### 3. Criar schemas para todos os endpoints

**Auth:**
```typescript
// src/validations/auth.validation.ts
import { z } from 'zod';

export const loginSchema = z.object({
    body: z.object({
        email: z.string().email('Email inválido'),
        password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres')
    })
});

export const selfRegisterSchema = z.object({
    body: z.object({
        email: z.string().email('Email inválido'),
        firstName: z.string().min(2).max(100),
        lastName: z.string().min(2).max(100),
        companyName: z.string().min(2).max(200)
    })
});
```

**Equipment:**
```typescript
// src/validations/equipment.validation.ts
import { z } from 'zod';

export const createEquipmentSchema = z.object({
    body: z.object({
        brand: z.string().min(1).max(100),
        model: z.string().min(1).max(100),
        serialNumber: z.string().min(1).max(100),
        clientId: z.number().int().positive()
    })
});
```

**Inventory:**
```typescript
// src/validations/inventory.validation.ts
import { z } from 'zod';
import { StockType } from '../constants/enums';

export const addStockSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/)
    }),
    body: z.object({
        quantity: z.number().int(),
        fromOrder: z.boolean().optional(),
        targetStock: z.nativeEnum(StockType).optional()
    })
});

export const createPartSchema = z.object({
    body: z.object({
        reference: z.string().min(1).max(50),
        designation: z.string().min(1).max(200),
        stock_quantity: z.number().int().min(0).optional(),
        is_composed: z.boolean().optional()
    })
});
```

---

## 🚨 CORREÇÃO 4: Race Conditions

### Problema
Operações de inventário podem ter race conditions.

### Solução: SELECT FOR UPDATE

```typescript
// inventory_controller.ts - addStock
export const addStock = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const partId = req.params.id;
    const { quantity, fromOrder, targetStock } = req.body;

    const result = await withTransaction(async (db) => {
        // ✅ LOCK PESSIMISTA - Previne race conditions
        const fetchRes = await db.query(
            `SELECT 
                stock_quantity, 
                ordered_quantity, 
                stock_quantity_contract, 
                ordered_quantity_contract,
                is_composed
             FROM parts 
             WHERE id = $1 
             FOR UPDATE`,  // 🔒 LOCK
            [partId]
        );

        if (fetchRes.rows.length === 0) {
            throw new NotFoundError('Peça não encontrada');
        }

        const currentPart = fetchRes.rows[0];

        // Se é peça composta, bloquear componentes também
        if (currentPart.is_composed) {
            await db.query(
                `SELECT child_part_id 
                 FROM part_components 
                 WHERE parent_part_id = $1 
                 FOR UPDATE`,
                [partId]
            );
        }

        const updateResult = inventoryService.processStockUpdate({
            stock: currentPart.stock_quantity || 0,
            ordered: currentPart.ordered_quantity || 0,
            stockContract: currentPart.stock_quantity_contract || 0,
            orderedContract: currentPart.ordered_quantity_contract || 0
        }, quantity, !!fromOrder, targetStock || StockType.GENERAL);

        const updateRes = await db.query(
            `UPDATE parts SET 
                stock_quantity = $1, 
                ordered_quantity = $2, 
                stock_quantity_contract = $3, 
                ordered_quantity_contract = $4 
            WHERE id = $5 
            RETURNING *`,
            [
                updateResult.newStock, 
                updateResult.newOrdered,
                updateResult.newStockContract, 
                updateResult.newOrderedContract,
                partId
            ]
        );

        return updateRes.rows[0];
    });

    res.json(result);
});
```

### Alternativa: Optimistic Locking

```typescript
// Adicionar coluna 'version' na tabela parts
export const addStockOptimistic = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const partId = req.params.id;
    const { quantity, fromOrder, targetStock } = req.body;

    let retries = 3;
    while (retries > 0) {
        try {
            const result = await withTransaction(async (db) => {
                // Buscar versão atual
                const fetchRes = await db.query(
                    'SELECT *, version FROM parts WHERE id = $1',
                    [partId]
                );

                if (fetchRes.rows.length === 0) {
                    throw new NotFoundError('Peça não encontrada');
                }

                const currentPart = fetchRes.rows[0];
                const currentVersion = currentPart.version;

                const updateResult = inventoryService.processStockUpdate({
                    stock: currentPart.stock_quantity || 0,
                    ordered: currentPart.ordered_quantity || 0,
                    stockContract: currentPart.stock_quantity_contract || 0,
                    orderedContract: currentPart.ordered_quantity_contract || 0
                }, quantity, !!fromOrder, targetStock || StockType.GENERAL);

                // Atualizar apenas se versão não mudou
                const updateRes = await db.query(
                    `UPDATE parts SET 
                        stock_quantity = $1, 
                        ordered_quantity = $2, 
                        stock_quantity_contract = $3, 
                        ordered_quantity_contract = $4,
                        version = version + 1
                    WHERE id = $5 AND version = $6
                    RETURNING *`,
                    [
                        updateResult.newStock, 
                        updateResult.newOrdered,
                        updateResult.newStockContract, 
                        updateResult.newOrderedContract,
                        partId,
                        currentVersion
                    ]
                );

                if (updateRes.rows.length === 0) {
                    throw new Error('OPTIMISTIC_LOCK_FAILURE');
                }

                return updateRes.rows[0];
            });

            return res.json(result);
        } catch (error) {
            if (error.message === 'OPTIMISTIC_LOCK_FAILURE') {
                retries--;
                if (retries === 0) {
                    throw new ApiError(409, 'Conflito de atualização. Tente novamente.');
                }
                // Esperar um pouco antes de tentar novamente
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }
            throw error;
        }
    }
});
```

---

## 🚨 CORREÇÃO 5: Email Service Security

### Problema
`rejectUnauthorized: false` expõe dados sensíveis.

### Solução

```typescript
// emailService.ts - ANTES
transporter = nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: port,
    secure: isSecure,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false  // ❌ INSEGURO
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
});

// emailService.ts - DEPOIS
transporter = nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: port,
    secure: isSecure,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        // ✅ Só desabilitar verificação em desenvolvimento
        rejectUnauthorized: process.env.NODE_ENV === 'production',
        // ✅ Adicionar certificados personalizados se necessário
        ca: process.env.EMAIL_CA_CERT ? [process.env.EMAIL_CA_CERT] : undefined,
    },
    // ✅ Aumentar timeouts
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    // ✅ Adicionar pool de conexões
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
});
```

### Validação de Email

```typescript
import { z } from 'zod';

const emailSchema = z.string().email();

export const sendEmail = async (
    to: string, 
    subject: string, 
    html: string, 
    from?: string
) => {
    // ✅ Validar email
    try {
        emailSchema.parse(to);
    } catch {
        logger.error({ to }, 'Invalid email address');
        throw new BadRequestError('Endereço de email inválido');
    }

    // ✅ Sanitizar subject e prevenir header injection
    const sanitizedSubject = subject.replace(/[\r\n]/g, '');
    
    // ✅ Verificar configuração
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
        logger.warn("Configuração SMTP em falta. Email não enviado.");
        return null;
    }

    try {
        const info = await getTransporter().sendMail({
            from: from || process.env.EMAIL_FROM || `"${process.env.APP_NAME}" <${process.env.EMAIL_USER}>`,
            to,
            subject: sanitizedSubject,
            html,
        });
        
        logger.info({ 
            to, 
            subject: sanitizedSubject,
            messageId: info.messageId 
        }, `Email enviado com sucesso`);
        
        return info;
    } catch (error) {
        logger.error(error, "Erro ao enviar email:");
        throw new InternalServerError('Erro ao enviar email');
    }
};
```

---

## 🚨 CORREÇÃO 6: Rate Limiting

### Instalação
```bash
npm install express-rate-limit
```

### Implementação

```typescript
// src/middlewares/rateLimiter.middleware.ts
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Rate limiter para autenticação
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // 5 tentativas
    message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    standardHeaders: true,
    legacyHeaders: false,
    // Identificar por IP + email
    keyGenerator: (req: Request) => {
        return `${req.ip}-${req.body.email || 'unknown'}`;
    },
    // Resposta customizada
    handler: (req: Request, res: Response) => {
        logger.warn({
            ip: req.ip,
            email: req.body.email,
            path: req.path
        }, 'Rate limit exceeded');
        
        res.status(429).json({
            error: 'Muitas tentativas. Tente novamente mais tarde.',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    }
});

// Rate limiter para API geral
export const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 100, // 100 requests
    message: 'Muitos pedidos. Tente novamente em breve.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiter para criação de recursos
export const createResourceLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 10, // 10 criações
    message: 'Muitas criações. Aguarde um minuto.',
    skipSuccessfulRequests: true, // Não contar sucessos
});
```

### Aplicar nas Rotas

```typescript
// src/routes/auth.routes.ts
import { authLimiter } from '../middlewares/rateLimiter.middleware';

router.post('/login', authLimiter, login);
router.post('/register', authLimiter, selfRegister);

// src/routes/client.routes.ts
import { createResourceLimiter } from '../middlewares/rateLimiter.middleware';

router.post('/', createResourceLimiter, createClient);

// src/index.ts (aplicar globalmente)
import { apiLimiter } from '../middlewares/rateLimiter.middleware';

app.use('/api/', apiLimiter);
```

---

## ✅ Checklist de Implementação

### Fase 1: Segurança Crítica (Hoje)
- [ ] Corrigir SQL injection no inventory_controller
- [ ] Remover `rejectUnauthorized: false` em produção
- [ ] Adicionar validação de email no emailService

### Fase 2: Validação (Esta Semana)
- [ ] Criar schemas Zod para auth
- [ ] Criar schemas Zod para clients
- [ ] Criar schemas Zod para equipment
- [ ] Criar schemas Zod para inventory
- [ ] Criar schemas Zod para schedules
- [ ] Criar schemas Zod para reports
- [ ] Aplicar validação em todas as rotas

### Fase 3: Race Conditions (Esta Semana)
- [ ] Adicionar SELECT FOR UPDATE em addStock
- [ ] Adicionar SELECT FOR UPDATE em updateOrder
- [ ] Corrigir race condition em cronService
- [ ] Adicionar testes de concorrência

### Fase 4: Rate Limiting (Esta Semana)
- [ ] Instalar express-rate-limit
- [ ] Criar middleware de rate limiting
- [ ] Aplicar em rotas de autenticação
- [ ] Aplicar em rotas de criação
- [ ] Aplicar globalmente na API

### Fase 5: Testes (Este Mês)
- [ ] Testes de SQL injection
- [ ] Testes de validação
- [ ] Testes de race conditions
- [ ] Testes de rate limiting
- [ ] Testes de encoding

---

## 🔍 Verificação Final

### Teste de Segurança
```bash
# SQL Injection
curl -X GET "http://localhost:5001/api/inventory/parts/1; DROP TABLE parts; --/components"
# Deve retornar erro 400

# Rate Limiting
for i in {1..10}; do 
  curl -X POST http://localhost:5001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done
# A partir da 6ª tentativa deve retornar 429

# Validação
curl -X POST http://localhost:5001/api/clients \
  -H "Content-Type: application/json" \
  -d '{"name":"A","nif":"invalid"}'
# Deve retornar erro 400 com detalhes de validação
```

### Teste de Encoding
```bash
# Verificar que textos em português estão corretos
curl http://localhost:5001/api/schedules | grep -o "Manutenção"
# Deve retornar "Manutenção" e não "ManutenÃ§Ã£o"
```

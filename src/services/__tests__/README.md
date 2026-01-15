# Email Service Tests

Este diretório contém testes para o serviço de email do Project1.

## Tipos de Testes

### 1. Testes Unitários (`emailService.test.ts`)

Testes automatizados que usam mocks para verificar a lógica do serviço de email sem enviar emails reais.

**Executar:**
```bash
npm test
```

**Cobertura:**
- ✅ Envio de email com sucesso
- ✅ Uso de EMAIL_FROM personalizado
- ✅ Validação de configuração (EMAIL_HOST, EMAIL_USER)
- ✅ Tratamento de erros
- ✅ Detecção automática de porta/SSL
- ✅ Logging de sucesso e erro

### 2. Testes de Integração (`emailService.integration.test.ts`)

Testes que enviam emails reais (desativados por padrão).

**Executar:**
```bash
# Remover .skip do describe() no ficheiro primeiro
npm test -- emailService.integration.test.ts
```

### 3. Teste Manual (`testEmail.ts`)

Script para testar rapidamente o envio de email real.

**Executar:**
```bash
npm run test:email
```

Este script:
- Verifica a configuração do `.env`
- Mostra os detalhes da configuração SMTP
- Envia um email de teste bonito para o EMAIL_USER
- Fornece feedback detalhado sobre sucesso/erro

## Configuração Necessária

Certifique-se de que o ficheiro `.env` contém:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=sua-app-password
EMAIL_FROM="Project1 Support <seu-email@gmail.com>" # Opcional
```

### Para Gmail:

1. **Ativar 2FA** na sua conta Google
2. **Criar App Password:**
   - Ir para: https://myaccount.google.com/apppasswords
   - Gerar uma nova App Password
   - Usar essa password no `EMAIL_PASS`

3. **Configuração recomendada:**
   - `EMAIL_PORT=465`
   - `EMAIL_SECURE=true`

## Troubleshooting

### Erro: ETIMEDOUT

**Causa:** Firewall/antivírus a bloquear a conexão ou configuração SMTP incorreta.

**Soluções:**
1. Verificar se está a usar porta 465 com `EMAIL_SECURE=true`
2. Desativar temporariamente o antivírus/firewall
3. Tentar com porta 587 e `EMAIL_SECURE=false` (menos seguro)
4. Usar outro serviço SMTP (SendGrid, Mailgun, etc.)

### Erro: Invalid login credentials

**Causa:** Password incorreta ou não é uma App Password.

**Soluções:**
1. Verificar se está a usar uma App Password (não a password normal)
2. Gerar uma nova App Password
3. Verificar se o EMAIL_USER está correto

### Email não chega

**Verificar:**
1. Pasta de Spam
2. Logs do servidor para confirmar que foi enviado
3. MessageId retornado pelo serviço

## Estrutura dos Testes

```
__tests__/
├── emailService.test.ts              # Testes unitários (mocks)
└── emailService.integration.test.ts  # Testes de integração (reais)

../testEmail.ts                        # Script de teste manual
```

## Exemplos de Uso

### Teste Rápido
```bash
npm run test:email
```

### Testes Automatizados
```bash
npm test
```

### Teste Específico
```bash
npm test -- emailService.test.ts
```

### Com Coverage
```bash
npm test -- --coverage
```

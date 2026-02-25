# Proposta Comercial - Desenvolvimento Backend (Project1)

## 1. Resumo Executivo
Esta proposta detalha o esforço de desenvolvimento investido no backend da plataforma **Project1**. O cálculo das horas baseia-se na complexidade técnica, criticidade de negócio e integridade funcional de cada módulo.

**Total de Horas Estimadas:** 409,5 horas

---

## 2. Detalhe por Categoria

### 📂 Services (Lógica de Negócio Central)
| Ficheiro | Complexidade / Fatores | Horas Estimadas |
| :--- | :--- | :---: |
| `scheduleService.ts` | Gestão de blocos de tempo, alocação de técnicos, regras de conflito. | 35,5 |
| `inventoryService.ts` | Kits/Peças compostas, reserva de stock, sincronização complexa. | 32,5 |
| `googleCalendarService.ts` | Integração com API externa, OAuth2, sincronização multi-evento. | 28,5 |
| `reportService.ts` | Geração de relatórios, assinaturas digitais, abate automático de stock. | 24,5 |
| `cronService.ts` | Agendatento de tarefas, notificações periódicas, concorrência. | 14,0 |
| `ticketService.ts` | Fluxo de vida do ticket, integração com notificações. | 12,5 |
| `billingService.ts` | Regras de faturação, estados de tarefas financeiras. | 8,5 |
| `emailService.ts` | Envio de emails, templates dinâmicos, integração SMTP. | 7,5 |
| `telegramService.ts` | Integração com Bot API, envio de mensagens interativas. | 4,0 |
| `realtimeService.ts` | Gestão de presença e estados em tempo real via Supabase. | 3,5 |
| **Subtotal** | | **171,0** |

### 📂 Controllers (Orquestração de Pedidos)
| Ficheiro | Horas Estimadas |
| :--- | :---: |
| `clientPortal.controller.ts` | 22,0 |
| `schedule.controller.ts` | 20,0 |
| `report.controller.ts` | 18,0 |
| `telegram.controller.ts` | 15,0 |
| `dashboard.controller.ts` | 12,0 |
| `ticket.controller.ts` | 12,0 |
| `inventory.controller.ts` | 8,5 |
| `equipment.controller.ts` | 8,0 |
| `ticketAttachment.controller.ts` | 6,5 |
| `auth.controller.ts` | 6,0 |
| `billing.controller.ts` | 5,0 |
| `emailTemplate.controller.ts` | 4,5 |
| `technician.controller.ts` | 4,5 |
| `client.controller.ts` | 4,0 |
| `google.controller.ts` | 3,0 |
| `setting.controller.ts` | 3,0 |
| **Subtotal** | **152,0** |

### 📂 Routes, Middlewares & Utils
| Categoria | Horas Estimadas |
| :--- | :---: |
| **Routes** (17 ficheiros) | 38,0 |
| **Validations** (11 ficheiros) | 20,5 |
| **Middlewares** (4 ficheiros) | 11,5 |
| **Utils** (5 ficheiros) | 12,0 |
| **Index / Core Setup** (`index.ts`) | 4,5 |
| **Subtotal** | **86,5** |

---

## 3. Conclusão do Sumário

O desenvolvimento do backend do Project1 totaliza **409,5 horas** de esforço técnico dedicado. 

Este esforço reflete:
1.  **Robustez:** Implementação de transações SQL e validações Zod em todos os endpoints críticos.
2.  **Integração:** Conectividade nativa com Google Calendar, Telegram Bot e Supabase Realtime.
3.  **Complexidade:** Gestão avançada de inventário (kits) e lógica de agendamento multi-técnico.
4.  **Segurança:** Middleware de autenticação robusto e controlo de acessos baseado em perfis (RBAC).

---
*Documento gerado automaticamente com base na análise de código fonte.*

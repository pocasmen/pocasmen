//Horas de desenvolvimento activo=1,5
import { z } from 'zod';
import { TicketStatus } from '../constants/enums';

export const createTicketSchema = z.object({
    body: z.object({
        client_id: z.number().int().positive(),
        equipmentId: z.number().int().positive(),
        title: z.string().min(1, 'Título é obrigatório'),
        faultDescription: z.string().min(1, 'Descrição é obrigatória'),
        status: z.nativeEnum(TicketStatus).optional(),
    })
});

export const getTicketsSchema = z.object({
    query: z.object({
        status: z.nativeEnum(TicketStatus).optional()
    })
});

export const ticketIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    })
});

export const replyToTicketSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    }),
    body: z.object({
        message: z.string().min(1, 'Mensagem é obrigatória')
    })
});

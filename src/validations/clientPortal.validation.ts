import { z } from 'zod';

export const createMyTicketSchema = z.object({
    body: z.object({
        equipmentId: z.number().int().positive(),
        title: z.string().min(1, 'Título é obrigatório'),
        faultDescription: z.string().min(1, 'Descrição é obrigatória'),
    })
});

export const replyToMyTicketSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    }),
    body: z.object({
        message: z.string().min(1, 'Mensagem é obrigatória')
    })
});

export const getMyReportByScheduleSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    })
});

export const getMyTicketByIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    })
});

import { z } from 'zod';
import { StockType } from '../constants/enums';

export const scheduleIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    })
});

export const createScheduleSchema = z.object({
    body: z.object({
        title: z.string().optional(),
        startDate: z.string().min(1, 'Data de início é obrigatória'),
        endDate: z.string().min(1, 'Data de fim é obrigatória'),
        clientId: z.number().int().positive('ID do cliente inválido'),
        equipmentId: z.number().int().positive('ID do equipamento inválido'),
        technicianIds: z.array(z.string()).min(1, 'Pelo menos um técnico é obrigatório'),
        ticketId: z.number().int().positive().nullable().optional(),
        internalNotes: z.string().optional(),
        serviceType: z.array(z.string()).optional().or(z.string().transform(val => val.split(',').filter(Boolean))),
        parts: z.array(z.object({
            id: z.number().optional(),
            reference: z.string().optional(),
            designation: z.string().optional(),
            quantity: z.number().positive(),
            stockType: z.nativeEnum(StockType).optional(),
            isApplied: z.boolean().optional()
        })).optional(),
        timeBlocks: z.array(z.object({
            start: z.string(),
            end: z.string()
        })).optional(),
        includesTravel: z.boolean().optional()
    })
});

export const updateScheduleSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    }),
    body: z.object({
        title: z.string().optional(),
        startDate: z.string().min(1).optional(),
        endDate: z.string().min(1).optional(),
        clientId: z.number().int().positive().optional(),
        equipmentId: z.number().int().positive().optional(),
        technicianIds: z.array(z.string()).min(1).optional(),
        isCompleted: z.boolean().optional(),
        ticketId: z.number().int().positive().nullable().optional(),
        internalNotes: z.string().nullable().optional(),
        serviceType: z.array(z.string()).optional().or(z.string().nullable().transform(val => val ? val.split(',').filter(Boolean) : [])),
        parts: z.array(z.object({
            id: z.number().optional(),
            reference: z.string().optional(),
            designation: z.string().optional(),
            quantity: z.number().positive(),
            stockType: z.nativeEnum(StockType).optional(),
            isApplied: z.boolean().optional()
        })).optional(),
        timeBlocks: z.array(z.object({
            start: z.string(),
            end: z.string()
        })).optional(),
        includesTravel: z.boolean().optional()
    })
});

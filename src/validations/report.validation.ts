//Horas de desenvolvimento activo=3,0
import { z } from 'zod';
import { StockType, ServiceClassification } from '../constants/enums';

export const reportIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    })
});

export const scheduleIdParamSchema = z.object({
    params: z.object({
        scheduleId: z.string().regex(/^\d+$/, 'ID do agendamento inválido')
    })
});

export const createReportSchema = z.object({
    body: z.object({
        clientId: z.number().int().positive('ID do cliente inválido'),
        equipmentId: z.number().int().positive('ID do equipamento inválido'),
        scheduleId: z.number().int().positive('ID do agendamento inválido').nullable().optional(),
        technicianIds: z.array(z.union([z.string(), z.number()])).min(1, 'Pelo menos um técnico é obrigatório'),
        serviceDate: z.string().min(1, 'Data do serviço é obrigatória'),
        hours: z.number().min(0, 'Horas inválidas'),
        description: z.string().min(1, 'Descrição é obrigatória'),
        damage: z.string().nullable().optional(),
        serviceType: z.array(z.string()).optional(),
        internalNotes: z.string().nullable().optional(),
        signature: z.string().nullable().optional(),
        technician_signature: z.string().nullable().optional(),
        technicianSignatures: z.record(z.string(), z.string().nullable()).optional(),
        classification: z.nativeEnum(ServiceClassification).optional(),
        parts: z.array(z.object({
            id: z.number(),
            quantity: z.number().positive(),
            stockType: z.nativeEnum(StockType).optional(),
            isApplied: z.boolean().optional()
        })).optional(),
        includesTravel: z.boolean().optional()
    })
});

export const updateReportSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    }),
    body: z.object({
        clientId: z.number().int().positive().optional(),
        equipmentId: z.number().int().positive().optional(),
        scheduleId: z.number().int().positive().nullable().optional(),
        technicianIds: z.array(z.union([z.string(), z.number()])).min(1).optional(),
        serviceDate: z.string().min(1).optional(),
        hours: z.number().min(0).optional(),
        description: z.string().min(1).optional(),
        damage: z.string().nullable().optional(),
        serviceType: z.array(z.string()).optional(),
        internalNotes: z.string().nullable().optional(),
        signature: z.string().nullable().optional(),
        technician_signature: z.string().nullable().optional(),
        technicianSignatures: z.record(z.string(), z.string().nullable()).optional(),
        classification: z.nativeEnum(ServiceClassification).optional(),
        parts: z.array(z.object({
            id: z.number(),
            quantity: z.number().positive(),
            stockType: z.nativeEnum(StockType).optional(),
            isApplied: z.boolean().optional()
        })).optional(),
        includesTravel: z.boolean().optional()
    })
});

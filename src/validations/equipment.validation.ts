//Horas de desenvolvimento activo=1,5
import { z } from 'zod';

export const createEquipmentSchema = z.object({
    body: z.object({
        brand: z.string().min(1, 'Marca é obrigatória').max(100),
        model: z.string().min(1, 'Modelo é obrigatório').max(100),
        serialNumber: z.string().min(1, 'Número de série é obrigatório').max(100),
        clientId: z.number().int().positive('ID do cliente inválido'),
    })
});

export const updateEquipmentSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    }),
    body: z.object({
        brand: z.string().min(1).optional(),
        model: z.string().min(1).optional(),
        serialNumber: z.string().min(1).optional(),
        clientId: z.number().int().positive().optional(),
    })
});

export const getEquipmentHistorySchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    })
});

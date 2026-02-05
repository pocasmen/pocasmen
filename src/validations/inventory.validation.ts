import { z } from 'zod';
import { StockType } from '../constants/enums';

export const updateComposedPartSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    }),
    body: z.object({
        reference: z.string().min(1, 'Referência é obrigatória'),
        designation: z.string().min(1, 'Designação é obrigatória'),
        components: z.array(z.object({
            partId: z.number().int().positive(),
            quantity: z.number().int().positive()
        }))
    })
});

export const updateStockSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    }),
    body: z.object({
        quantity: z.number(),
        fromOrder: z.boolean().optional(),
        targetStock: z.nativeEnum(StockType).optional()
    })
});

export const updateOrderSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    }),
    body: z.object({
        quantity: z.number().positive(),
        targetStock: z.nativeEnum(StockType).optional()
    })
});

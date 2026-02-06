import { z } from 'zod';
import { StockType } from '../constants/enums';

export const createPartSchema = z.object({
    body: z.object({
        reference: z.string().min(1, 'Referência é obrigatória'),
        designation: z.string().min(1, 'Designação é obrigatória'),
        stock_quantity: z.number().int().min(0).optional(),
        is_composed: z.boolean().optional()
    })
});

export const updatePartSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    }),
    body: z.object({
        reference: z.string().min(1, 'Referência é obrigatória'),
        designation: z.string().min(1, 'Designação é obrigatória')
    })
});


export const createComposedPartSchema = z.object({
    body: z.object({
        reference: z.string().min(1, 'Referência é obrigatória'),
        designation: z.string().min(1, 'Designação é obrigatória'),
        components: z.array(z.object({
            partId: z.number().int().positive(),
            quantity: z.number().int().positive()
        }))
    })
});

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

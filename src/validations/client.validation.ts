import { z } from 'zod';

export const createClientSchema = z.object({
    body: z.object({
        name: z.string().min(1, 'Nome é obrigatório'),
        nif: z.string().min(9, 'NIF inválido').max(15, 'NIF inválido').optional().or(z.literal('')),
        email: z.string().email('Email inválido').optional().or(z.literal('')),
        phone: z.string().optional().or(z.literal('')),
        address: z.string().optional().or(z.literal('')),
        hasContract: z.boolean().optional(),
    })
});

export const updateClientSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    }),
    body: z.object({
        name: z.string().min(1).optional(),
        nif: z.string().min(9).max(15).optional().or(z.literal('')),
        email: z.string().email().optional().or(z.literal('')),
        phone: z.string().optional().or(z.literal('')),
        address: z.string().optional().or(z.literal('')),
        hasContract: z.boolean().optional(),
    })
});

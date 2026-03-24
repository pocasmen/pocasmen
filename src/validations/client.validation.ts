//Horas de desenvolvimento activo=2,0
import { z } from 'zod';

export const createClientSchema = z.object({
    body: z.object({
        name: z.string()
            .min(2, 'Nome deve ter pelo menos 2 caracteres')
            .max(200, 'Nome não pode exceder 200 caracteres')
            .trim(),
        address: z.string()
            .max(500, 'Morada não pode exceder 500 caracteres')
            .optional()
            .or(z.literal('')),
        city: z.string()
            .max(100, 'Cidade não pode exceder 100 caracteres')
            .optional()
            .or(z.literal('')),
        postCode: z.string()
            .regex(/^\d{4}-\d{3}$/, 'Código postal inválido (formato: 1234-567)')
            .optional()
            .or(z.literal('')),
        nif: z.string()
            .regex(/^\d{9}$/, 'NIF deve ter exatamente 9 dígitos')
            .optional()
            .or(z.literal('')),
    })
});

export const updateClientSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido')
    }),
    body: z.object({
        name: z.string().min(2).max(200).trim().optional(),
        address: z.string().max(500).optional().or(z.literal('')),
        city: z.string().max(100).optional().or(z.literal('')),
        postCode: z.string().regex(/^\d{4}-\d{3}$/, 'Formato: 1234-567').optional().or(z.literal('')),
        nif: z.string().regex(/^\d{9}$/, 'Deve ter 9 dígitos').optional().or(z.literal('')),
    })
});

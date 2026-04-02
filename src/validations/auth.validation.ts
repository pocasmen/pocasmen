//Horas de desenvolvimento activo=1,5
import { z } from 'zod';
import { UserRole } from '../constants/enums';

export const loginSchema = z.object({
    body: z.object({
        email: z.string().email('Email inválido'),
        password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres')
    })
});

export const selfRegisterSchema = z.object({
    body: z.object({
        email: z.string().email('Email inválido'),
        firstName: z.string().min(1, 'Primeiro nome é obrigatório'),
        lastName: z.string().min(1, 'Último nome é obrigatório'),
        companyName: z.string().min(1, 'Nome da empresa é obrigatório'),
        website: z.string().optional(),
    })
});

export const inviteUserSchema = z.object({
    body: z.object({
        email: z.string().email('Email inválido'),
        client_id: z.number().int().positive().optional(),
        role: z.nativeEnum(UserRole),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
    }).passthrough()
});

export const approveUserSchema = z.object({
    body: z.object({
        userId: z.string().uuid('ID de utilizador inválido'),
        client_ids: z.array(z.number().int().positive('ID de cliente inválido')).min(1, 'Selecione pelo menos uma empresa')
    })
});

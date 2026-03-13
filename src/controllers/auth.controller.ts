//Horas de desenvolvimento activo=6,5
import { Request, Response } from 'express';

import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import * as emailService from '../services/emailService';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { UserRole } from '../constants/enums';
import { ProfileUpdate, Client as DbClient } from '../types/supabase';

export const login = catchAsync(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new UnauthorizedError(error.message);
    res.json(data);
});

export const getImpersonatedUser = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { data: { user }, error } = await supabase.auth.admin.getUserById(id);
    if (error || !user) throw new ApiError(404, 'Utilizador não encontrado no sistema de autenticação.');
    res.json(user);
});

export const selfRegister = catchAsync(async (req: Request, res: Response) => {
    const { email, firstName, lastName, companyName } = req.body;
    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: {
            first_name: firstName,
            last_name: lastName,
            company_name: companyName,
            role: UserRole.PENDING_CLIENT,
            must_set_password: true
        },
        // S3 — Redirect to the intermediate page so email scanners cannot
        // prefetch/consume the OTP token before the real user clicks.
        redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invite`,
    });

    if (error) {
        if (error.message.includes('unique constraint') || error.message.includes('already exists')) {
            throw new ApiError(409, 'Um utilizador com este email já existe.');
        }
        throw new ApiError(500, error.message);
    }

    res.status(200).json({ message: `Convite de registo enviado para ${email}. Por favor, verifique o seu email para continuar.` });
});

export const inviteUser = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { email, client_id, role, ...meta } = req.body;

    const requestingUserRole = req.user.user_metadata?.role;
    if (role === UserRole.SUPER_ADMIN && requestingUserRole !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenError('Only Super Admin can create Super Admin users.');
    }

    const inviteData: any = {
        role: role,
        must_set_password: true,
        ...meta
    };

    if (client_id) {
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', Number(client_id))
            .single();
        if (clientError || !client) throw new NotFoundError('Client not found.');

        inviteData.client_id = client_id;
        // Injetar dados da empresa se for convite de cliente para manter consistência com auto-registo
        if (role === UserRole.CLIENT) {
            inviteData.company_name = client.name;
        }
    }

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: inviteData,
        // S3 — Same intermediate page redirect for admin-sent invites.
        redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invite`,
    });
    if (error) throw new ApiError(500, error.message);

    // Se o utilizador já foi convidado por um técnico/admin com a role CLIENT, 
    // podemos opcionalmente marcar como aprovado logo no perfil se o trigger o criar.
    // No entanto, o USER disse que quando ele define a password aparece "aguarda aprovação".
    // Isso acontece porque o CompleteRegistrationPage.tsx assume que role PENDING_CLIENT aguarda aprovação.
    // Se o invite já tem role: "client", o CompleteRegistrationPage não deve mostrar "aguarda aprovação".

    res.status(200).json({ message: `Invite sent to ${email}.` });
});

export const getPendingUsers = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) throw new ApiError(500, 'Failed to fetch users', error.message);
    const pendingUsers = users.filter(u => u.user_metadata?.role === UserRole.PENDING_CLIENT);
    res.json(pendingUsers);
});

import { withTransaction } from '../config/db';

export const approveUser = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { userId, client_ids } = req.body;

    const updatedUser = await withTransaction(req, async (db) => {
        const primaryClientId = Array.isArray(client_ids) && client_ids.length > 0 ? Number(client_ids[0]) : null;

        const { rowCount } = await db.query(
            'UPDATE profiles SET client_id = $1, role = $2 WHERE id = $3',
            [primaryClientId, UserRole.CLIENT, userId]
        );
        if (rowCount === 0) throw new NotFoundError('Perfil não encontrado.');

        if (Array.isArray(client_ids)) {
            for (const id of client_ids) {
                await db.query(`
                    INSERT INTO client_users (user_id, client_id) 
                    VALUES ($1, $2)
                    ON CONFLICT (user_id, client_id) DO NOTHING
                `, [userId, Number(id)]);
            }
        }

        const { data: user, error: userError } = await supabase.auth.admin.updateUserById(
            userId,
            { user_metadata: { role: UserRole.CLIENT, must_set_password: false } }
        );

        if (userError) throw new ApiError(500, `Failed to update user role: ${userError.message}`);
        return user;
    });

    res.status(200).json({ message: 'User approved and associated successfully.', user: updatedUser });

    if (updatedUser.user && updatedUser.user.email) {
        const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;

        logger.info({ email: updatedUser.user.email }, `[APPROVAL] Sending approval email via template`);
        emailService.sendEmailWithTemplate(
            updatedUser.user.email,
            'approval',
            { login_url: loginUrl }
        ).catch(err => logger.error(err, "Failed to send approval email async:"));
    }

});

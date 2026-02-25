//Horas de desenvolvimento activo=6,0
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

export const selfRegister = catchAsync(async (req: Request, res: Response) => {
    const { email, firstName, lastName, companyName } = req.body;
    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: {
            first_name: firstName,
            last_name: lastName,
            company_name: companyName,
            role: UserRole.PENDING_CLIENT,
            must_set_password: true
        }
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

    const inviteData: any = { role: role, must_set_password: true, ...meta };
    if (client_id) {
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', Number(client_id))
            .single();
        if (clientError || !client) throw new NotFoundError('Client not found.');
        inviteData.client_id = client_id;
    }

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { data: inviteData });
    if (error) throw new ApiError(500, error.message);

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
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const loginUrl = `${frontendUrl}/login`;

        let emailSubject = 'Aprovação de Conta - Project1';
        let emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2>Bem-vindo ao Project1!</h2>
          <p>A sua conta foi aprovada pelo administrador.</p>
          <p>Já pode aceder à plataforma e gerir os seus pedidos de assistência.</p>
          <p>
            <a href="${loginUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Aceder à Plataforma
            </a>
          </p>
          <p style="font-size: 0.9em; color: #777; margin-top: 20px;">
            Se o botão acima não funcionar, copie e cole este link no seu browser:<br>
            ${loginUrl}
          </p>
        </div>
      `;

        let emailFrom = undefined;
        try {
            const { data: settingsData } = await supabase.from('settings').select('*').eq('id', 1).single(); // Assuming settings table for email templates
            if (settingsData && (settingsData as any).email_templates) {
                const templates = (settingsData as any).email_templates;
                if (templates.approval) {
                    emailSubject = templates.approval.subject || emailSubject;
                    emailFrom = templates.approval.from || undefined;
                    if (templates.approval.body) {
                        emailHtml = templates.approval.body.replace(/{{login_url}}/g, loginUrl);
                    }
                }
            }
        } catch (e) {
            logger.error(e, "Error loading email template, using default:");
        }

        logger.info({ email: updatedUser.user.email }, `[APPROVAL] Sending approval email`);
        emailService.sendEmail(updatedUser.user.email, emailSubject, emailHtml, emailFrom).catch(err => {
            logger.error(err, "Failed to send approval email async:");
        });
    }
});

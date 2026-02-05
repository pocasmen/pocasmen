import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import * as emailService from '../services/emailService';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { UserRole } from '../constants/enums';

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
        const { data: client, error: clientError } = await supabase.from('clients').select('id').eq('id', client_id).single();
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

export const approveUser = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { userId, client_id } = req.body;

    // Update profile: set client_id AND role to 'client'
    const { error: profileError } = await supabase
        .from('profiles')
        .update({
            client_id: client_id,
            role: UserRole.CLIENT
        })
        .eq('id', userId);

    if (profileError) {
        throw new ApiError(500, `Failed to associate user with client: ${profileError.message}`);
    }

    // Update auth.users metadata - clear must_set_password and set role to client
    const { data: updatedUser, error: userError } = await supabase.auth.admin.updateUserById(
        userId,
        { user_metadata: { role: UserRole.CLIENT, must_set_password: false } }
    );

    if (userError) {
        throw new ApiError(500, `Failed to update user role: ${userError.message}`);
    }

    res.status(200).json({ message: 'User approved and associated successfully.', user: updatedUser });

    // Send confirmation email
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
        // Try to fetch custom template
        try {
            const { data: settingsData } = await supabase.from('settings').select('value').eq('key', 'email_templates').single();
            if (settingsData && settingsData.value) {
                const templates = JSON.parse(settingsData.value);
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

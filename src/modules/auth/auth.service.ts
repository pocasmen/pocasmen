import { SupabaseClient } from '@supabase/supabase-js';
import { pool, withTransactionAs } from '../../config/db';
import { supabase } from '../../config/supabase';
import { ApiError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/ApiError';
import { ClientRepository } from '../client/client.repository';
import * as emailService from '../../services/emailService';
import { logger } from '../../utils/logger';
import { UserRole } from '../../constants/enums';

export class AuthService {
    constructor(private clientRepo: ClientRepository) {}

    async login(data: any) {
        const { email, password } = data;
        const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new UnauthorizedError(error.message);
        return authData;
    }

    async getImpersonatedUser(id: string) {
        const { data: { user }, error } = await supabase.auth.admin.getUserById(id);
        if (error || !user) throw new ApiError(404, 'Utilizador não encontrado no sistema de autenticação.');
        return user;
    }

    async selfRegister(data: any) {
        // Honeypot check
        if (data.website) {
            logger.info({ ip: 'unknown', email: data.email }, '[SELF-REGISTER] Honeypot hit! Bot blocked.');
            // We tell the bot it succeeded so it doesn't try other things
            return { message: 'Pedido recebido com sucesso. Verifique o seu email.' };
        }

        const { email, firstName, lastName, companyName } = data;
        const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
            data: {
                first_name: firstName,
                last_name: lastName,
                company_name: companyName,
                role: UserRole.PENDING_CLIENT,
                must_set_password: true
            },
            redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invite`,
        });

        if (error) {
            if (error.message.includes('unique constraint') || error.message.includes('already exists')) {
                throw new ApiError(409, 'Um utilizador com este email já existe.');
            }
            throw new ApiError(500, error.message);
        }

        return { message: `Convite de registo enviado para ${email}. Por favor, verifique o seu email para continuar.` };
    }

    async inviteUser(data: any, requestingUserRole?: string) {
        const { email, client_id, role, ...meta } = data;

        if (role === UserRole.SUPER_ADMIN && requestingUserRole !== UserRole.SUPER_ADMIN) {
            throw new ForbiddenError('Only Super Admin can create Super Admin users.');
        }

        const inviteData: any = {
            role: role,
            must_set_password: true,
            ...meta
        };

        if (client_id) {
            // Usa query manual via pool para não injetar QueryRunner aqui, ou usa clientRepo passando pool
            const client = await this.clientRepo.findById(Number(client_id), pool);
            if (!client) throw new NotFoundError('Client not found.');

            inviteData.client_id = client_id;
            if (role === UserRole.CLIENT) {
                inviteData.company_name = client.name;
            }
        }

        const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
            data: inviteData,
            redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invite`,
        });
        if (error) throw new ApiError(500, error.message);

        return { message: `Invite sent to ${email}.` };
    }

    async getPendingUsers() {
        const { data: { users }, error } = await supabase.auth.admin.listUsers();
        if (error) throw new ApiError(500, 'Failed to fetch users: ' + error.message);
        return users.filter(u => u.user_metadata?.role === UserRole.PENDING_CLIENT);
    }

    async approveUser(data: any, adminUserId: string) {
        const { userId: targetUserId, client_ids } = data;

        // Fetch current user confirmation status from Supabase
        const { data: { user: currentUser }, error: fetchError } = await supabase.auth.admin.getUserById(targetUserId);
        if (fetchError || !currentUser) throw new NotFoundError('Utilizador não encontrado no sistema de autenticação.');

        const isConfirmed = !!currentUser.email_confirmed_at;

        const updatedUser = await withTransactionAs(adminUserId, async (db) => {
            const primaryClientId = Array.isArray(client_ids) && client_ids.length > 0 ? Number(client_ids[0]) : null;

            // Update local profile
            const { rowCount } = await db.query(
                'UPDATE profiles SET client_id = $1, role = $2 WHERE id = $3',
                [primaryClientId, UserRole.CLIENT, targetUserId]
            );
            if (rowCount === 0) throw new NotFoundError('Perfil não encontrado.');

            // Update client associations
            if (Array.isArray(client_ids)) {
                for (const id of client_ids) {
                    await db.query(`
                        INSERT INTO client_users (user_id, client_id) 
                        VALUES ($1, $2)
                        ON CONFLICT (user_id, client_id) DO NOTHING
                    `, [targetUserId, Number(id)]);
                }
            }

            // Sync with Supabase Auth
            // Crucial: only set must_set_password: false if they already have an active/confirmed account
            const { data: user, error: userError } = await supabase.auth.admin.updateUserById(
                targetUserId,
                { user_metadata: { role: UserRole.CLIENT, must_set_password: !isConfirmed } }
            );

            if (userError) throw new ApiError(500, `Erro ao atualizar função do utilizador: ${userError.message}`);
            return user;
        });

        if (updatedUser.user && updatedUser.user.email) {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const loginUrl = `${frontendUrl}/login`;
            const firstName = updatedUser.user.user_metadata?.first_name || '';

            if (!isConfirmed) {
                // User hasn't set their password yet.
                // We'll generate a fresh link just in case the previous one expired or was lost.
                logger.info({ email: updatedUser.user.email }, `[APPROVAL] Account approved but password not yet set. Generating invite link.`);
                
                const { data: linkGen, error: linkError } = await supabase.auth.admin.generateLink({
                    type: 'invite',
                    email: updatedUser.user.email,
                    options: { redirectTo: `${frontendUrl}/accept-invite` }
                });

                const setupUrl = linkGen?.properties?.action_link || `${frontendUrl}/accept-invite`;

                emailService.sendEmailWithTemplate(
                    updatedUser.user.email,
                    'approval_pending_password',
                    { 
                        login_url: loginUrl, 
                        setup_url: setupUrl,
                        first_name: firstName 
                    }
                ).catch(err => logger.error(err, "Failed to send approval_pending_password email:"));
            } else {
                logger.info({ email: updatedUser.user.email }, `[APPROVAL] Sending regular approval email`);
                emailService.sendEmailWithTemplate(
                    updatedUser.user.email,
                    'approval',
                    { login_url: loginUrl, first_name: firstName }
                ).catch(err => logger.error(err, "Failed to send approval email:"));
            }
        }

        return updatedUser;
    }
}

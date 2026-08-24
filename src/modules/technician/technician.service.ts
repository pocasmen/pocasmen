import { pool, withTransactionAs } from '../../config/db';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/ApiError';
import { UserRole } from '../../constants/enums';
import { ProfileRepository } from './profile.repository';
import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

export class TechnicianService {
    constructor(private profileRepo: ProfileRepository) {}

    async getTechnicians() {
        return this.profileRepo.findTechnicians(pool);
    }

    async getExternalUsers(filters: { search?: string, category?: string } = {}) {
        return this.profileRepo.findExternalUsers(pool, filters);
    }

    async getMe(userId: string) {
        const profile = await this.profileRepo.findById(userId, pool);
        if (!profile) throw new NotFoundError('User profile not found');
        return profile;
    }

    async updateTechnician(targetId: string, data: any, requesterId: string, requesterRole: string) {
        if (requesterRole !== UserRole.ADMIN && requesterRole !== UserRole.SUPER_ADMIN && requesterId !== targetId) {
            throw new ForbiddenError('Forbidden');
        }

        return withTransactionAs(requesterId, async (db) => {
            const updated = await this.profileRepo.update(targetId, data, db);
            if (!updated) throw new NotFoundError('Perfil não encontrado.');

            // Sync metadata to Supabase Auth - Use the UPDATED profile from DB
            try {
                // Determine the role to set in Supabase
                // If user was PENDING_CLIENT and now has complete profile, promote to CLIENT
                let authRole = updated.role;
                if (updated.role === UserRole.PENDING_CLIENT &&
                    updated.first_name &&
                    updated.last_name &&
                    updated.client_role) {
                    authRole = UserRole.CLIENT;
                    // Also update the role in the local profiles table
                    await db.query(
                        'UPDATE profiles SET role = $1 WHERE id = $2',
                        [authRole, targetId]
                    );
                }

                // Build comprehensive metadata from the UPDATED profile
                const metadata: Record<string, any> = {
                    first_name: updated.first_name ?? '',
                    last_name: updated.last_name ?? '',
                    client_role: updated.client_role ?? '',
                    phone: updated.phone ?? '',
                    telegramchatid: updated.telegramchatid ?? '',
                    signature: updated.signature ?? '',
                    color: updated.color ?? '',
                    daily_notifications_enabled: updated.daily_notifications_enabled ?? false,
                    notification_time: updated.notification_time ?? '',
                    google_calendar_color_id: updated.google_calendar_color_id ?? '',
                    notification_prefs: updated.notification_prefs ?? {},
                    role: authRole,
                    // When profile is complete, password should be set
                    must_set_password: authRole === UserRole.PENDING_CLIENT
                };

                await supabase.auth.admin.updateUserById(targetId, { user_metadata: metadata });

                logger.info({ userId: targetId, role: authRole }, 'Auth metadata synchronized successfully');
            } catch (err) {
                logger.error(err, 'Failed to sync auth metadata');
                // Don't throw - the DB update succeeded, auth sync is best-effort
            }

            // Re-fetch to return the potentially updated role
            const finalProfile = await this.profileRepo.findById(targetId, db);
            return finalProfile;
        });
    }

    async deleteTechnician(targetId: string, requesterRole: string) {
        if (requesterRole !== UserRole.ADMIN && requesterRole !== UserRole.SUPER_ADMIN) {
            throw new ForbiddenError('Only admins can delete users.');
        }

        let newRole = UserRole.INACTIVE_TECHNICIAN;

        await withTransactionAs(null, async (db) => {
            const currentProfile = await this.profileRepo.findById(targetId, db);
            if (!currentProfile) {
                throw new NotFoundError('Perfil não encontrado.');
            }

            if (currentProfile.role === UserRole.CLIENT || currentProfile.role === UserRole.PENDING_CLIENT) {
                newRole = UserRole.INACTIVE_CLIENT;
            }

            await db.query(
                `UPDATE profiles 
                 SET role = $1, 
                     daily_notifications_enabled = false, 
                     telegramchatid = NULL 
                 WHERE id = $2`,
                [newRole, targetId]
            );
        });

        try {
            await supabase.auth.admin.updateUserById(targetId, {
                user_metadata: { role: newRole },
                ban_duration: '876600h' // Ban the user for 100 years to prevent login
            });
        } catch (err) {
            logger.error(err, 'Failed to update user role and ban in auth');
        }
    }

    async hardDeleteUser(targetId: string, requesterRole: string) {
        if (requesterRole !== UserRole.ADMIN && requesterRole !== UserRole.SUPER_ADMIN) {
            throw new ForbiddenError('Apenas administradores podem eliminar utilizadores permanentemente.');
        }

        const profile = await this.profileRepo.findById(targetId, pool);
        if (!profile) {
            throw new NotFoundError('Perfil não encontrado.');
        }

        // Dependency checks
        const checks = [
            { name: 'relatórios', sql: 'SELECT 1 FROM reports WHERE created_by = $1 OR updated_by = $1 OR deleted_by = $1 LIMIT 1' },
            { name: 'intervenções em relatórios', sql: 'SELECT 1 FROM report_technicians WHERE technician_id = $1 LIMIT 1' },
            { name: 'tickets', sql: 'SELECT 1 FROM tickets WHERE created_by_user_id = $1 OR responsible_technician_id = $1 LIMIT 1' },
            { name: 'respostas a tickets', sql: 'SELECT 1 FROM ticket_responses WHERE user_id = $1 LIMIT 1' },
            { name: 'anexos de tickets', sql: 'SELECT 1 FROM ticket_attachments WHERE uploaded_by_user_id = $1 LIMIT 1' },
            { name: 'agendamentos', sql: 'SELECT 1 FROM schedules WHERE created_by = $1 OR updated_by = $1 LIMIT 1' },
            { name: 'atribuições de agendamento', sql: 'SELECT 1 FROM schedule_technicians WHERE technician_id = $1 LIMIT 1' },
            { name: 'tarefas internas', sql: 'SELECT 1 FROM internal_tasks WHERE created_by = $1 OR updated_by = $1 OR user_id = $1 LIMIT 1' }
        ];

        const blockedReasons: string[] = [];
        for (const check of checks) {
            try {
                const { rowCount } = await pool.query(check.sql, [targetId]);
                if ((rowCount ?? 0) > 0) {
                    blockedReasons.push(check.name);
                }
            } catch {
                // Ignore if table/column does not exist
            }
        }

        if (blockedReasons.length > 0) {
            throw new BadRequestError(
                `Não é possível eliminar permanentemente este utilizador porque existem registos associados (${blockedReasons.join(', ')}). Utilize a opção "Inativar" para preservar o histórico.`
            );
        }

        // Clean up client_users associations
        await pool.query('DELETE FROM client_users WHERE user_id = $1', [targetId]);

        // Delete from profiles
        await pool.query('DELETE FROM profiles WHERE id = $1', [targetId]);

        // Delete from Supabase Auth
        try {
            await supabase.auth.admin.deleteUser(targetId);
        } catch (err) {
            logger.error(err, 'Failed to delete user from Supabase auth');
        }

        return { success: true, message: 'Utilizador e conta de autenticação eliminados permanentemente.' };
    }

    async reactivateUser(targetId: string, requesterRole: string) {
        if (requesterRole !== UserRole.ADMIN && requesterRole !== UserRole.SUPER_ADMIN) {
            throw new ForbiddenError('Apenas administradores podem reativar utilizadores.');
        }

        const profile = await this.profileRepo.findById(targetId, pool);
        if (!profile) {
            throw new NotFoundError('Perfil não encontrado.');
        }

        const restoredRole = profile.role === UserRole.INACTIVE_TECHNICIAN 
            ? UserRole.TECHNICIAN 
            : UserRole.CLIENT;

        await withTransactionAs(null, async (db) => {
            await db.query(
                `UPDATE profiles SET role = $1 WHERE id = $2`,
                [restoredRole, targetId]
            );
        });

        try {
            await supabase.auth.admin.updateUserById(targetId, {
                user_metadata: { role: restoredRole },
                ban_duration: 'none'
            });
        } catch (err) {
            logger.error(err, 'Failed to unban and update role in auth');
        }

        return { success: true, message: 'Utilizador reativado com sucesso.', role: restoredRole };
    }
}

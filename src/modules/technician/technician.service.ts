import { pool, withTransactionAs } from '../../config/db';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/ApiError';
import { UserRole } from '../../constants/enums';
import { ProfileRepository } from './profile.repository';
import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

export class TechnicianService {
    constructor(private profileRepo: ProfileRepository) {}

    async getTechnicians() {
        return this.profileRepo.findTechnicians(pool);
    }

    async getExternalUsers() {
        return this.profileRepo.findExternalUsers(pool);
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

            // Sync metadata to Supabase Auth
            try {
                const metadata: any = { first_name: data.first_name, last_name: data.last_name };
                if (data.client_role) metadata.client_role = data.client_role;
                await supabase.auth.admin.updateUserById(targetId, { user_metadata: metadata });
            } catch (err) {
                logger.error(err, 'Failed to sync auth metadata');
            }

            return updated;
        });
    }

    async deleteTechnician(targetId: string, requesterRole: string) {
        if (requesterRole !== UserRole.ADMIN && requesterRole !== UserRole.SUPER_ADMIN) {
            throw new ForbiddenError('Only admins can delete users.');
        }

        await withTransactionAs(null, async (db) => {
            await db.query(
                `UPDATE profiles 
                 SET role = $1, 
                     daily_notifications_enabled = false, 
                     telegramchatid = NULL 
                 WHERE id = $2`,
                [UserRole.INACTIVE_TECHNICIAN, targetId]
            );
        });

        try {
            await supabase.auth.admin.updateUserById(targetId, {
                user_metadata: { role: UserRole.INACTIVE_TECHNICIAN },
                ban_duration: '876600h' // Ban the user for 100 years to prevent login
            });
        } catch (err) {
            logger.error(err, 'Failed to update user role and ban in auth');
        }
    }
}

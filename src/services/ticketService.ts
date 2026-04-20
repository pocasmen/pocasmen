import { supabase } from '../config/supabase';
//Horas de desenvolvimento activo=14,0
import { PoolClient } from 'pg';
import { TicketStatus } from '../constants/enums';
import { sendTelegramNotification } from './telegramService';
import { Ticket } from '../types/supabase';
import { logger } from '../utils/logger';
import { broadcastTicketUpdate } from './realtimeService';
import { notifyUsers } from './notificationService';
import { pool } from '../config/db';

/**
 * Creates a ticket and sends notifications
 */
export async function createFullTicket(db: PoolClient, data: any, creatorId: string) {
    const { client_id, equipmentId, title, faultDescription, status } = data;

    const { rows } = await db.query<Ticket>(
        'INSERT INTO tickets (client_id, "equipmentId", title, "faultDescription", status, created_by_user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [Number(client_id), Number(equipmentId), title, faultDescription, status || TicketStatus.OPEN, creatorId]
    );

    const ticket = rows[0];

    // Side effects (Notifications & Realtime)
    setImmediate(async () => {
        try {
            broadcastTicketUpdate(supabase, ticket.id);
            const { data: clientData } = await supabase.from('clients').select('name').eq('id', Number(client_id)).single();
            const { data: equipData } = await supabase.from('equipments').select('brand, model').eq('id', Number(equipmentId)).single();
            const telegramMessage = `🆕 *Novo Ticket Criado *\n\n*Título:* ${title}\n*Cliente:* ${clientData?.name || 'Cliente'}\n*Equipamento:* ${equipData ? `${equipData.brand} ${equipData.model}` : '?'}\n*Descrição:* ${faultDescription}`;
            sendTelegramNotification(telegramMessage);
        } catch (err) {
            logger.error({ err }, 'Failed to process ticket side effects');
        }
    });

    return ticket;
}

/**
 * Replies to a ticket and updates its timestamp
 */
export async function replyToFullTicket(db: PoolClient, ticketId: number, userId: string, message: string) {
    const { rows: profileRows } = await db.query('SELECT id FROM profiles WHERE id = $1', [userId]);
    if (profileRows.length === 0) throw new Error('Profile not found');

    const { rows: updatedRows } = await db.query<Ticket>(
        'UPDATE tickets SET "updatedAt" = $1, status = CASE WHEN status = $2 THEN $3 ELSE status END WHERE id = $4 RETURNING *',
        [new Date().toISOString(), TicketStatus.OPEN, TicketStatus.ACKNOWLEDGED, ticketId]
    );

    await db.query(
        'INSERT INTO ticket_responses (ticket_id, user_id, message, "isNew", created_at) VALUES ($1, $2, $3, $4, $5)',
        [ticketId, userId, message.trim(), true, new Date().toISOString()]
    );

    // Mark other responses as read (internal logic)
    await db.query(
        'UPDATE ticket_responses SET "isNew" = false WHERE ticket_id = $1 AND "isNew" = true AND user_id != $2',
        [ticketId, userId]
    );

    if (updatedRows[0]) {
        broadcastTicketUpdate(supabase, ticketId);

        // Notificar clientes associados
        setImmediate(async () => {
            try {
                // Procurar utilizadores do tipo 'client' associados a este ticket (via client_users)
                const { rows: recipients } = await pool.query(`
                    SELECT cu.user_id, t.title
                    FROM tickets t
                    JOIN client_users cu ON cu.client_id = t.client_id
                    JOIN profiles p ON p.id = cu.user_id
                    WHERE t.id = $1 AND p.role = 'client' AND cu.user_id != $2
                `, [ticketId, userId]);

                if (recipients.length > 0) {
                    const ticketTitle = recipients[0].title;
                    const userIds = recipients.map(r => r.user_id);
                    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

                    await notifyUsers(userIds, 'ticket_reply', {
                        templateKey: 'ticket_reply',
                        variables: {
                            ticketId: String(ticketId),
                            ticketTitle: ticketTitle,
                            message: message,
                            clientUrl: clientUrl
                        },
                        telegramText: `💬 *Nova resposta no Ticket #${ticketId}*\n\n*Ticket:* ${ticketTitle}\n*Mensagem:* ${message}\n\n[Ver Detalhes](${clientUrl}/tickets/${ticketId})`
                    });
                }
            } catch (err) {
                logger.error({ err, ticketId }, 'Failed to send ticket reply notifications');
            }
        });
    }

    return updatedRows[0] || null;
}

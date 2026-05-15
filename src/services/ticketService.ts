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

            // Notificar o cliente que criou o ticket (e outros associados ao mesmo cliente)
            const { rows: recipients } = await pool.query(`
                SELECT cu.user_id, p.first_name
                FROM client_users cu
                JOIN profiles p ON p.id = cu.user_id
                WHERE cu.client_id = $1 AND p.role = 'client'
            `, [Number(client_id)]);

            if (recipients.length > 0) {
                const userIds = recipients.map(r => r.user_id);
                const firstName = recipients.find(r => r.user_id === creatorId)?.first_name || 'Cliente';
                const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

                await notifyUsers(userIds, 'ticket_opened', {
                    templateKey: 'ticket_opened',
                    variables: {
                        first_name: firstName,
                        ticketId: String(ticket.id),
                        ticketTitle: title,
                        clientUrl: clientUrl
                    },
                    telegramText: `🆕 *Confirmação de Ticket Aberto*\n\nRecebemos o seu pedido: *#${ticket.id} - ${title}*\n\n[Acompanhar no Portal](${clientUrl}/tickets/${ticket.id})`
                });
            }
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

/**
 * Links a ticket to an existing schedule (bidirectional)
 */
export async function linkTicketToSchedule(db: PoolClient, ticketId: number, scheduleId: number, userId: string) {
    // 1. Update Ticket
    const { rows: ticketRows } = await db.query<Ticket>(
        'UPDATE tickets SET "scheduleId" = $1, status = $2, "updatedAt" = $3 WHERE id = $4 RETURNING *',
        [scheduleId, TicketStatus.SCHEDULED, new Date().toISOString(), ticketId]
    );

    if (ticketRows.length === 0) throw new Error('Ticket not found');

    // 2. Update Schedule
    await db.query(
        'UPDATE schedules SET "ticketId" = $1 WHERE id = $2',
        [ticketId, scheduleId]
    );

    const ticket = ticketRows[0];

    // Side effects (Notifications & Realtime)
    setImmediate(async () => {
        try {
            broadcastTicketUpdate(supabase, ticketId);

            // Get schedule info for the notification
            const { data: scheduleData } = await supabase
                .from('schedules')
                .select('startDate, title')
                .eq('id', scheduleId)
                .single();

            const dateStr = scheduleData?.startDate
                ? new Date(scheduleData.startDate).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Data não definida';

            const telegramMessage = `🔗 *Ticket Vinculado a Agendamento*\n\n*Ticket:* #${ticketId} - ${ticket.title}\n*Agendamento:* ${scheduleData?.title || 'Visita Técnica'}\n*Data:* ${dateStr}\n\nO ticket foi associado a um agendamento existente.`;
            sendTelegramNotification(telegramMessage);
        } catch (err) {
            logger.error({ err }, 'Failed to process ticket link side effects');
        }
    });

    return ticket;
}

/**
 * Closes a ticket directly with a mandatory final response.
 * Used for "Express Tickets" that don't require scheduling.
 */
export async function closeTicketDirectly(db: PoolClient, ticketId: number, userId: string, message: string) {
    if (!message || message.trim().length === 0) {
        throw new Error('A response message is mandatory to close the ticket.');
    }

    // 1. Update Ticket Status
    const { rows: updatedRows } = await db.query<Ticket>(
        'UPDATE tickets SET status = $1, "updatedAt" = $2 WHERE id = $3 RETURNING *',
        [TicketStatus.CLOSED, new Date().toISOString(), ticketId]
    );

    if (updatedRows.length === 0) throw new Error('Ticket not found');

    // 2. Add Final Response
    await db.query(
        'INSERT INTO ticket_responses (ticket_id, user_id, message, "isNew", created_at) VALUES ($1, $2, $3, $4, $5)',
        [ticketId, userId, message.trim(), true, new Date().toISOString()]
    );

    // Side effects
    const ticket = updatedRows[0];
    setImmediate(async () => {
        try {
            broadcastTicketUpdate(supabase, ticketId);
            
            // Send standard reply notification first
            const { rows: recipients } = await pool.query(`
                SELECT cu.user_id, t.title
                FROM tickets t
                JOIN client_users cu ON cu.client_id = t.client_id
                JOIN profiles p ON p.id = cu.user_id
                WHERE t.id = $1 AND p.role = 'client'
            `, [ticketId]);

            if (recipients.length > 0) {
                const userIds = recipients.map(r => r.user_id);
                const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

                // Notification for the final reply
                await notifyUsers(userIds, 'ticket_reply', {
                    templateKey: 'ticket_reply',
                    variables: {
                        ticketId: String(ticketId),
                        ticketTitle: ticket.title || 'Sem Título',
                        message: message,
                        clientUrl: clientUrl
                    },
                    telegramText: `💬 *Resposta Final no Ticket #${ticketId}*\n\n*Ticket:* ${ticket.title || 'Sem Título'}\n*Mensagem:* ${message}\n\n[Ver Detalhes](${clientUrl}/tickets/${ticketId})`
                });

                // Notification for closing
                await notifyUsers(userIds, 'ticket_closed', {
                    templateKey: 'ticket_closed',
                    variables: {
                        first_name: 'Cliente',
                        ticketId: String(ticketId),
                        ticketTitle: ticket.title || 'Sem Título',
                        clientUrl: clientUrl
                    },
                    telegramText: `✅ *Ticket Fechado*\n\nO seu pedido *#${ticketId} - ${ticket.title || 'Sem Título'}* foi concluído.\n\n[Ver Detalhes](${clientUrl}/tickets/${ticketId})`
                });
            }
        } catch (err) {
            logger.error({ err, ticketId }, 'Failed to process ticket close side effects');
        }
    });

    return ticket;
}

/**
 * Notifica os clientes quando um ticket é fechado/resolvido.
 */
export async function notifyTicketClosed(ticketId: number) {
    try {
        const { rows: ticketRows } = await pool.query(`
            SELECT t.id, t.title, t.client_id
            FROM tickets t
            WHERE t.id = $1
        `, [ticketId]);

        if (ticketRows.length === 0) return;
        const ticket = ticketRows[0];

        const { rows: recipients } = await pool.query(`
            SELECT cu.user_id, p.first_name
            FROM client_users cu
            JOIN profiles p ON p.id = cu.user_id
            WHERE cu.client_id = $1 AND p.role = 'client'
        `, [ticket.client_id]);

        if (recipients.length > 0) {
            const userIds = recipients.map(r => r.user_id);
            const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

            await notifyUsers(userIds, 'ticket_closed', {
                templateKey: 'ticket_closed',
                variables: {
                    first_name: recipients[0].first_name || 'Cliente',
                    ticketId: String(ticket.id),
                    ticketTitle: ticket.title,
                    clientUrl: clientUrl
                },
                telegramText: `✅ *Ticket Fechado*\n\nO seu pedido *#${ticket.id} - ${ticket.title}* foi fechado.\n\n[Ver Detalhes](${clientUrl}/tickets/${ticket.id})`
            });
        }
    } catch (err) {
        logger.error({ err, ticketId }, 'Failed to send ticket closed notifications');
    }
}

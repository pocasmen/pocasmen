import { supabase } from '../config/supabase';
//Horas de desenvolvimento activo=13,5
import { PoolClient } from 'pg';
import { TicketStatus } from '../constants/enums';
import { sendTelegramNotification } from './telegramService';
import { Ticket } from '../types/supabase';

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

    // Side effects (Notifications) - run outside or after transaction is usually better but here we can do it after
    // Note: Since this is often called within withTransaction, the transaction commits after this returns.
    // We can use a post-commit hook if needed, but for now, simple async call.
    setImmediate(async () => {
        try {
            const { data: clientData } = await supabase.from('clients').select('name').eq('id', Number(client_id)).single();
            const { data: equipData } = await supabase.from('equipments').select('brand, model').eq('id', Number(equipmentId)).single();
            const telegramMessage = `🆕 *Novo Ticket Criado (Interno)*\n\n*Título:* ${title}\n*Cliente:* ${clientData?.name || 'Cliente'}\n*Equipamento:* ${equipData ? `${equipData.brand} ${equipData.model}` : '?'}\n*Descrição:* ${faultDescription}`;
            sendTelegramNotification(telegramMessage);
        } catch (err) {
            console.error('Failed to send telegram notification for ticket', err);
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

    return updatedRows[0] || null;
}

//Horas de desenvolvimento activo=14,0
import * as cron from 'node-cron';
import { SupabaseClient } from '@supabase/supabase-js';
import { sendTelegramNotification } from './telegramService';
import { logger } from '../utils/logger';
import { TicketStatus } from '../constants/enums';
import { Database } from '../types/db.types';
import { Profile } from '../types/supabase';
import { withTransaction } from '../config/db';

let scheduledTask: cron.ScheduledTask | null = null;

export async function runTicketCheck(supabase: SupabaseClient<Database>) {
    logger.debug('Running pending ticket check...');
    try {
        const { count, error } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .in('status', [TicketStatus.OPEN, TicketStatus.ACKNOWLEDGED]);

        if (error) throw error;
        if (count && count > 0) {
            const message = `🔔 *Daily Reminder:* There are *${count}* pending ticket(s).`;
            sendTelegramNotification(message);
        }
    } catch (error) {
        logger.error(error, 'Error running ticket check:');
    }
}

export async function runDailyReminders(supabase: SupabaseClient<Database>) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 15 * 60000);
    const windowEnd = new Date(now.getTime() + 15 * 60000);

    try {
        const { data: profiles, error: pError } = await supabase
            .from('profiles')
            .select('id')
            .eq('daily_notifications_enabled', true);

        if (pError) throw pError;
        if (!profiles) return;

        for (const p of profiles) {
            await withTransaction({} as any, async (db) => {
                // LOCK individual do profile para evitar race conditions entre múltiplos workers
                const { rows: profileRows } = await db.query<Profile>(
                    `SELECT id, telegramchatid, first_name, notification_time, last_notification_sent 
                     FROM profiles WHERE id = $1 FOR UPDATE`,
                    [p.id]
                );

                if (profileRows.length === 0) return;
                const profile = profileRows[0];

                if (!profile.telegramchatid || !profile.notification_time) return;

                if (profile.last_notification_sent) {
                    const lastSentDate = new Date(profile.last_notification_sent);
                    if (lastSentDate.toDateString() === now.toDateString()) return;
                }

                const [pArgHours, pArgMinutes] = profile.notification_time.split(':');
                const targetTime = new Date(now);
                targetTime.setHours(parseInt(pArgHours, 10), parseInt(pArgMinutes, 10), 0, 0);

                if (targetTime >= windowStart && targetTime <= windowEnd) {
                    const dayOfWeek = now.getDay();
                    if (dayOfWeek === 0 || dayOfWeek === 6) return; // Silent skip for weekends

                    let daysToAdd = 1;
                    let dateLabel = 'amanhã';
                    if (dayOfWeek === 5) {
                        daysToAdd = 3;
                        dateLabel = 'próxima segunda-feira';
                    }

                    const scheduleDate = new Date();
                    scheduleDate.setDate(scheduleDate.getDate() + daysToAdd);
                    const scheduleDateStr = scheduleDate.toISOString().split('T')[0];

                    const { data: techSchedules, error: sError } = await supabase
                        .from('schedule_technicians')
                        .select(`
                            scheduleId,
                            schedules!inner(id, startDate, serviceType, clients(name), equipments(brand, model, serialNumber))
                        `)
                        .eq('technicianId', profile.id)
                        .gte('schedules.startDate', `${scheduleDateStr}T00:00:00.000Z`)
                        .lte('schedules.startDate', `${scheduleDateStr}T23:59:59.999Z`);

                    if (!sError && techSchedules && techSchedules.length > 0) {
                        let message = `Olá, *${profile.first_name || 'Técnico'}*!\n\n`;
                        message += `Lembramos os seus agendamentos para ${dateLabel} (*${scheduleDate.toLocaleDateString('pt-PT')}*):\n\n`;

                        techSchedules.forEach((ts: any) => {
                            const s = ts.schedules;
                            const startTime = new Date(s.startDate).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });
                            const clientName = s.clients?.name || (Array.isArray(s.clients) ? s.clients[0]?.name : 'Cliente Desconhecido');
                            const eq = s.equipments;
                            let eqDesc = 'Equipamento Desconhecido';
                            if (eq) {
                                const e = Array.isArray(eq) ? eq[0] : eq;
                                eqDesc = `${e.brand || ''} ${e.model || ''}`.trim();
                            }
                            message += `• *${startTime}* - ${s.serviceType || 'Serviço'} | ${clientName}\n  _${eqDesc}_\n\n`;
                        });

                        await sendTelegramNotification(message, profile.telegramchatid);

                        await db.query(
                            'UPDATE profiles SET last_notification_sent = NOW() WHERE id = $1',
                            [profile.id]
                        );

                        logger.info({ profileId: profile.id }, 'Daily reminder notification sent and recorded');
                    }
                }
            });
        }
    } catch (error) {
        logger.error(error, 'Error in runDailyReminders:');
    }
}

export async function scheduleTicketCheck(supabase: SupabaseClient<Database>) {
    try {
        const { data, error } = await supabase.from('settings').select('*');
        if (error) throw error;
        const settings = (data || []).reduce((acc: any, row) => ({ ...acc, [row.key]: row.value }), {} as Record<string, string>);

        if (settings['ticket_notification_active'] !== 'true') {
            if (scheduledTask) scheduledTask.stop();
            return;
        }

        const [hour, minute] = (settings['ticket_notification_time'] || '17:00').split(':');
        const cronExpression = `${minute} ${hour} * * 1-5`;

        if (scheduledTask) scheduledTask.stop();
        scheduledTask = cron.schedule(cronExpression, () => runTicketCheck(supabase), { timezone: "Europe/Lisbon" });
    } catch (error) {
        logger.error(error, 'Error scheduling ticket check:');
    }
}

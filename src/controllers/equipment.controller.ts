//Horas de desenvolvimento activo=8,0
import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, BadRequestError, ForbiddenError, NotFoundError } from '../utils/ApiError';
import { UserRole } from '../constants/enums';
import { withTransaction } from '../config/db';
import { Equipment, EquipmentUpdate, EquipmentInsert, Equipment as DbEquipment, Client as DbClient, Profile as DbProfile } from '../types/supabase';

export const getEquipments = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const search = req.query.search as string;
    let query = supabase
        .from('equipments')
        .select('id, brand, model, "serialNumber", "additionalInfo", clients(name)')
        .order('id', { ascending: true });

    if (search) {
        const { data: clients } = await supabase
            .from('clients')
            .select('*')
            .ilike('name', `%${search}%`);

        const clientIds = (clients || []).map(c => c.id);

        let orQuery = `brand.ilike.%${search}%,model.ilike.%${search}%,serialNumber.ilike.%${search}%`;
        if (clientIds.length > 0) {
            orQuery += `,clientId.in.(${clientIds.join(',')})`;
        }
        query = query.or(orQuery);
    }

    const { data, error } = await query;
    if (error) throw new ApiError(500, 'Failed to fetch equipments', error.message);

    const result = (data || []).map((e: any) => ({
        id: e.id,
        brand: e.brand,
        model: e.model,
        serialNumber: e.serialNumber,
        additionalInfo: e.additionalInfo,
        clientName: Array.isArray(e.clients) ? e.clients[0]?.name : (e.clients as any)?.name || 'Cliente Desconhecido',
    }));

    res.json(result);
});

export const getClientEquipments = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const clientIdParam = Number(req.params.id);
    const { data, error } = await supabase
        .from('equipments')
        .select('id, brand, model, "serialNumber", "additionalInfo", clients(name)')
        .eq('clientId', clientIdParam)
        .order('id', { ascending: true });

    if (error) throw new ApiError(500, 'Failed to fetch client equipments', error.message);

    const result = (data || []).map((e: any) => ({
        id: e.id,
        brand: e.brand,
        model: e.model,
        serialNumber: e.serialNumber,
        additionalInfo: e.additionalInfo,
        clientName: Array.isArray(e.clients) ? e.clients[0]?.name : (e.clients as any)?.name || 'Cliente Desconhecido',
    }));

    res.json(result);
});

export const createEquipment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { brand, model, serialNumber, clientId, additionalInfo } = req.body;

    const result = await withTransaction(req, async (db) => {
        const { rows: existing } = await db.query('SELECT 1 FROM equipments WHERE "serialNumber" = $1 LIMIT 1', [serialNumber]);
        if (existing.length > 0) {
            throw new BadRequestError('Já existe um equipamento com este número de série.');
        }

        const { rows: clientRows } = await db.query('SELECT name FROM clients WHERE id = $1', [Number(clientId)]);
        if (clientRows.length === 0) throw new NotFoundError('Client not found.');
        const clientName = clientRows[0].name;

        const { rows } = await db.query<Equipment>(
            'INSERT INTO equipments (brand, model, "serialNumber", "clientId", "additionalInfo") VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [brand, model, serialNumber, Number(clientId), additionalInfo]
        );

        return {
            ...rows[0],
            clientName
        };
    });

    res.status(201).json(result);
});

export const updateEquipment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { brand, model, serialNumber, clientId, additionalInfo } = req.body;

    const result = await withTransaction(req, async (db) => {
        const { rows: existing } = await db.query('SELECT 1 FROM equipments WHERE "serialNumber" = $1 AND id != $2 LIMIT 1', [serialNumber, Number(id)]);
        if (existing.length > 0) {
            throw new BadRequestError('Já existe um equipamento com este número de série.');
        }

        const { rows: clientRows } = await db.query('SELECT name FROM clients WHERE id = $1', [Number(clientId)]);
        if (clientRows.length === 0) throw new NotFoundError('Client not found.');
        const clientName = clientRows[0].name;

        const { rows, rowCount } = await db.query<Equipment>(
            'UPDATE equipments SET brand = $1, model = $2, "serialNumber" = $3, "clientId" = $4, "additionalInfo" = $5 WHERE id = $6 RETURNING *',
            [brand, model, serialNumber, Number(clientId), additionalInfo, Number(id)]
        );

        if (rowCount === 0) throw new NotFoundError('Equipamento não encontrado.');

        return {
            ...rows[0],
            clientName
        };
    });

    res.json(result);
});

export const deleteEquipment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    await withTransaction(req, async (db) => {
        const { rowCount } = await db.query('DELETE FROM equipments WHERE id = $1', [Number(id)]);
        if (rowCount === 0) throw new NotFoundError('Equipamento não encontrado.');
    });

    res.sendStatus(204);
});

export const getEquipmentHistory = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const equipmentId = Number(req.params.id);
    const { data: equipment, error: equipmentError } = await supabase
        .from('equipments')
        .select('*')
        .eq('id', equipmentId)
        .single();
    if (equipmentError || !equipment) throw new NotFoundError('Equipment not found');

    if (!req.user) throw new ApiError(401, 'Unauthorized');
    const userRole = req.user.user_metadata?.role;
    if (userRole === UserRole.CLIENT) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', req.user.id).single();
        if (!profile || (profile as DbProfile).client_id !== equipment.clientId) {
            throw new ForbiddenError('Permission denied');
        }
    }

    const [clientRes, ticketsRes, rawSchedules, reportsRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', equipment.clientId || 0).single(),
        supabase.from('tickets').select('*').eq('equipmentId', equipmentId).order('createdAt', { ascending: false }),
        supabase.from('schedules').select('id, title, startDate, isCompleted, schedule_technicians(technicianId)').eq('equipmentId', equipmentId).order('startDate', { ascending: false }),
        supabase.from('reports').select('*').eq('equipmentId', equipmentId).is('deleted_at', null).order('serviceDate', { ascending: false })
    ]);

    const schedulesData = rawSchedules.data || [];
    const technicianIds = [...new Set(schedulesData.flatMap((s: any) => (s.schedule_technicians as any[] || []).map((st: any) => st.technicianId)))];

    let technicianMap = new Map<string, string>();
    if (technicianIds.length > 0) {
        const { data: techProfiles } = await supabase.from('profiles').select('*').in('id', technicianIds);
        if (techProfiles) {
            technicianMap = new Map((techProfiles as DbProfile[]).map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));
        }
    }

    const schedules = schedulesData.map((s: any) => ({
        id: s.id,
        title: s.title,
        startDate: s.startDate,
        isCompleted: s.isCompleted,
        technicians: (s.schedule_technicians as any[] || []).map((st: any) => technicianMap.get(st.technicianId) || 'Técnico Desconhecido')
    }));

    res.json({
        details: { ...equipment, clientName: (clientRes.data as DbClient)?.name || 'Cliente Desconhecido' },
        tickets: ticketsRes.data || [],
        schedules,
        reports: reportsRes.data || [],
    });
});

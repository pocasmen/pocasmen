import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, BadRequestError, ForbiddenError, NotFoundError } from '../utils/ApiError';
import { UserRole } from '../constants/enums';

export const getEquipments = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const search = req.query.search as string;
    let query = supabase
        .from('equipments')
        .select('id, brand, model, serialNumber, clients(name)')
        .order('id', { ascending: true });

    if (search) {
        query = query.or(`brand.ilike.%${search}%,model.ilike.%${search}%,serialNumber.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw new ApiError(500, 'Failed to fetch equipments', error.message);

    const result = (data || []).map((e: any) => ({
        id: e.id,
        brand: e.brand,
        model: e.model,
        serialNumber: e.serialNumber,
        clientName: Array.isArray(e.clients) ? e.clients[0]?.name : (e.clients as any)?.name || 'Cliente Desconhecido',
    }));

    res.json(result);
});

export const getClientEquipments = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const clientIdParam = Number(req.params.id);
    const { data, error } = await supabase
        .from('equipments')
        .select('id, brand, model, serialNumber, clients(name)')
        .eq('clientId', clientIdParam)
        .order('id', { ascending: true });
    if (error) throw new ApiError(500, 'Failed to fetch client equipments', error.message);

    const result = (data || []).map((e: any) => ({
        id: e.id,
        brand: e.brand,
        model: e.model,
        serialNumber: e.serialNumber,
        clientName: Array.isArray(e.clients) ? e.clients[0]?.name : (e.clients as any)?.name || 'Cliente Desconhecido',
    }));

    res.json(result);
});

export const createEquipment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { brand, model, serialNumber, clientId } = req.body;
    const { data: existing, error: checkError } = await supabase
        .from('equipments')
        .select('id')
        .eq('serialNumber', serialNumber)
        .maybeSingle();

    if (checkError) throw new ApiError(500, 'Check unique serial error', checkError.message);
    if (existing) {
        throw new BadRequestError('Já existe um equipamento com este número de série.');
    }

    const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .single();
    if (clientError || !client) throw new NotFoundError('Client not found.');

    const { data, error } = await supabase
        .from('equipments')
        .insert({ brand, model, serialNumber, clientId })
        .select('id, brand, model, serialNumber, clients(name)');
    if (error) throw new ApiError(500, 'Failed to create equipment', error.message);

    const created = data?.[0];
    res.status(201).json(created ? {
        id: created.id,
        brand: created.brand,
        model: created.model,
        serialNumber: created.serialNumber,
        clientName: Array.isArray(created.clients) ? created.clients[0]?.name : (created.clients as any)?.name || 'Cliente Desconhecido',
    } : null);
});

export const updateEquipment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { brand, model, serialNumber, clientId } = req.body;

    const { data: existing, error: checkError } = await supabase
        .from('equipments')
        .select('id')
        .eq('serialNumber', serialNumber)
        .neq('id', id)
        .maybeSingle();

    if (checkError) throw new ApiError(500, 'Check unique serial error', checkError.message);
    if (existing) {
        throw new BadRequestError('Já existe um equipamento com este número de série.');
    }

    const { data, error } = await supabase
        .from('equipments')
        .update({ brand, model, serialNumber, clientId })
        .eq('id', id)
        .select('id, brand, model, serialNumber, clients(name)');

    if (error) throw new ApiError(500, 'Failed to update equipment', error.message);

    const updated = data?.[0];
    res.json(updated ? {
        id: updated.id,
        brand: updated.brand,
        model: updated.model,
        serialNumber: updated.serialNumber,
        clientName: Array.isArray(updated.clients) ? updated.clients[0]?.name : (updated.clients as any)?.name || 'Cliente Desconhecido',
    } : null);
});

export const deleteEquipment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { error } = await supabase
        .from('equipments')
        .delete()
        .eq('id', id);

    if (error) throw new ApiError(500, 'Failed to delete equipment', error.message);
    res.sendStatus(204);
});

export const getEquipmentHistory = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const equipmentId = Number(req.params.id);
    const { data: equipment, error: equipmentError } = await supabase
        .from('equipments')
        .select('id, brand, model, serialNumber, clientId')
        .eq('id', equipmentId)
        .single();
    if (equipmentError || !equipment) throw new NotFoundError('Equipment not found');

    if (!req.user) throw new ApiError(401, 'Unauthorized');
    const userRole = req.user.user_metadata?.role;
    if (userRole === UserRole.CLIENT) {
        const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', req.user.id).single();
        if (!profile || profile.client_id !== equipment.clientId) {
            throw new ForbiddenError('Permission denied');
        }
    }

    const [clientRes, ticketsRes, rawSchedules, reportsRes] = await Promise.all([
        supabase.from('clients').select('name').eq('id', equipment.clientId).single(),
        supabase.from('tickets').select('id, createdAt, faultDescription, status').eq('equipmentId', equipmentId).order('createdAt', { ascending: false }),
        supabase.from('schedules').select('id, title, startDate, isCompleted, schedule_technicians(technicianId)').eq('equipmentId', equipmentId).order('startDate', { ascending: false }),
        supabase.from('reports').select('id, serviceDate, hours, description').eq('equipmentId', equipmentId).order('serviceDate', { ascending: false })
    ]);

    const schedulesData = rawSchedules.data || [];
    const technicianIds = [...new Set(schedulesData.flatMap((s: any) => s.schedule_technicians?.map((st: any) => st.technicianId) || []))];

    let technicianMap = new Map<string, string>();
    if (technicianIds.length > 0) {
        const { data: techProfiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', technicianIds);
        if (techProfiles) {
            technicianMap = new Map(techProfiles.map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));
        }
    }

    const schedules = schedulesData.map((s: any) => ({
        id: s.id,
        title: s.title,
        startDate: s.startDate,
        isCompleted: s.isCompleted,
        technicians: s.schedule_technicians?.map((st: any) => technicianMap.get(st.technicianId) || 'Técnico Desconhecido') || []
    }));

    res.json({
        details: { ...equipment, clientName: clientRes.data?.name || 'Cliente Desconhecido' },
        tickets: ticketsRes.data || [],
        schedules,
        reports: reportsRes.data || [],
    });
});

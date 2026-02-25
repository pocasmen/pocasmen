//Horas de desenvolvimento activo=18,0
import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import * as inventoryService from '../services/inventoryService';
import * as scheduleService from '../services/scheduleService';
import * as billingService from '../services/billingService';
import * as reportService from '../services/reportService';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, ForbiddenError, NotFoundError, UnauthorizedError, BadRequestError } from '../utils/ApiError';
import { UserRole, StockType, EnrichedPart, BillingStatus } from '../types';
import { logger } from '../utils/logger';
import {
    Report as DbReport,
    Client as DbClient,
    Equipment as DbEquipment,
    Profile as DbProfile,
    ReportTechnician as DbReportTechnician,
} from '../types/supabase';

export const getReports = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { search, dateFilter, serviceType } = req.query;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    logger.info({ search, dateFilter, serviceType, page, limit }, 'Fetching reports with filters');

    let query = supabase.from('reports')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('serviceDate', { ascending: false });

    if (dateFilter) {
        const today = new Date();
        let startDate: Date | null = null;
        let endDate: Date | null = null;

        if (dateFilter === 'today') {
            startDate = new Date(today.setHours(0, 0, 0, 0));
            endDate = new Date(today.setHours(23, 59, 59, 999));
        } else if (dateFilter === 'week') {
            const day = today.getDay();
            const diff = today.getDate() - day + (day === 0 ? -6 : 1);
            const start = new Date(today.setDate(diff));
            start.setHours(0, 0, 0, 0);
            startDate = start;
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
        } else if (dateFilter === 'month') {
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
        }

        if (startDate && endDate) {
            query = query.gte('serviceDate', startDate.toISOString()).lte('serviceDate', endDate.toISOString());
        }
    }

    if (serviceType) {
        const serviceTypes = Array.isArray(serviceType) ? serviceType : [serviceType];
        query = query.filter('serviceType', 'cs', JSON.stringify(serviceTypes));
    }

    if (search) {
        const searchTerm = `%${search}%`;
        const { data: clients } = await supabase.from('clients').select('*').ilike('name', searchTerm);
        const clientIds = (clients as DbClient[])?.map(c => c.id) || [];

        const { data: equipments } = await supabase.from('equipments').select('*').or(`brand.ilike.${searchTerm},model.ilike.${searchTerm},serialNumber.ilike.${searchTerm}`);
        const equipmentIds = (equipments as DbEquipment[])?.map(e => e.id) || [];

        const conditions = [];
        if (clientIds.length > 0) conditions.push(`clientId.in.(${clientIds.join(',')})`);
        if (equipmentIds.length > 0) conditions.push(`equipmentId.in.(${equipmentIds.join(',')})`);

        if (conditions.length > 0) {
            query = query.or(conditions.join(','));
        } else {
            return res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
        }
    }

    query = query.range(offset, offset + limit - 1);

    const { data: reportsRaw, error: reportsError, count: totalCount } = await query;
    const reports = reportsRaw as DbReport[] || [];

    if (reportsError) {
        logger.error({ err: reportsError }, 'Failed to fetch reports');
        throw new ApiError(500, 'Failed to fetch reports', reportsError.message);
    }

    if (!reports || reports.length === 0) {
        return res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    }

    const clientIds = [...new Set(reports.map(r => r.clientId).filter((id): id is number => !!id))];
    const equipmentIds = [...new Set(reports.map(r => r.equipmentId).filter((id): id is number => !!id))];
    const reportIds = reports.map(r => r.id);

    const [clientsRes, equipmentsRes, techniciansRes, partsRes] = await Promise.all([
        clientIds.length > 0 ? supabase.from('clients').select('*').in('id', clientIds) : Promise.resolve({ data: [] }),
        equipmentIds.length > 0 ? supabase.from('equipments').select('*').in('id', equipmentIds) : Promise.resolve({ data: [] }),
        reportIds.length > 0 ? supabase.from('report_technicians').select('*').in('reportId', reportIds) : Promise.resolve({ data: [] }),
        reportIds.length > 0 ? supabase.from('report_parts').select('reportId, partId, quantity, stock_type, parts(id, reference, designation, stock_quantity, reserved_quantity, stock_quantity_contract, reserved_quantity_contract)').in('reportId', reportIds) : Promise.resolve({ data: [] }),
    ]);

    const clientsData = clientsRes.data as DbClient[] || [];
    const equipmentsData = equipmentsRes.data as DbEquipment[] || [];
    const techniciansData = techniciansRes.data as DbReportTechnician[] || [];
    const partsData = partsRes.data || [];

    const clientMap = new Map(clientsData.map(c => [c.id, c.name]));
    const equipmentMap = new Map(equipmentsData.map(e => [e.id, e]));

    const techIds = [...new Set(techniciansData.map(rt => rt.technicianId).filter((id): id is string => !!id))];
    const { data: profiles } = techIds.length > 0 ? await supabase.from('profiles').select('*').in('id', techIds) : { data: [] };
    const profileMap = new Map((profiles as DbProfile[])?.map(p => [p.id, p]) || []);

    const techMap = new Map<number, any[]>();
    techniciansData.forEach(rt => {
        const p = profileMap.get(rt.technicianId);
        if (p) {
            if (!techMap.has(rt.reportId)) techMap.set(rt.reportId, []);
            techMap.get(rt.reportId)!.push({
                id: p.id,
                name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                color: p.color,
                signature: rt.signature
            });
        }
    });

    const partsMap = new Map<number, EnrichedPart[]>();
    (partsData as any[])?.forEach(rp => {
        if (!partsMap.has(rp.reportId)) partsMap.set(rp.reportId, []);
        partsMap.get(rp.reportId)!.push({
            id: rp.parts.id,
            reference: rp.parts.reference,
            designation: rp.parts.designation,
            quantity: rp.quantity,
            stockType: rp.stock_type || StockType.GENERAL,
            stock_quantity: rp.parts.stock_quantity,
            reserved_quantity: rp.parts.reserved_quantity,
            stock_quantity_contract: rp.parts.stock_quantity_contract,
            reserved_quantity_contract: rp.parts.reserved_quantity_contract
        });
    });

    const result = reports.map(r => {
        let eq = null;
        if (r.equipmentId !== null && r.equipmentId !== undefined) {
            eq = equipmentMap.get(r.equipmentId);
        }

        let clientName = 'Cliente Desconhecido';
        if (r.clientId !== null && r.clientId !== undefined) {
            clientName = clientMap.get(r.clientId) || 'Cliente Desconhecido';
        }

        return {
            ...r,
            serviceType: scheduleService.getServiceTypeKeys(r.serviceType),
            clientName,
            equipmentBrand: eq?.brand || '',
            equipmentModel: eq?.model || '',
            technicians: techMap.get(r.id) || [],
            parts: partsMap.get(r.id) || [],
            timeBlocks: r.time_blocks,
            internalNotes: r.internal_notes
        };
    });

    res.json({
        data: result,
        pagination: {
            page,
            limit,
            total: totalCount || 0,
            totalPages: Math.ceil((totalCount || 0) / limit)
        }
    });
});

export const getReportById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { id } = req.params;
    const userRole = req.user.user_metadata?.role;
    const userId = req.user.id;

    const { data: report, error } = await supabase.from('reports')
        .select('*')
        .eq('id', Number(id))
        .is('deleted_at', null)
        .maybeSingle();

    if (error) throw new ApiError(500, 'Failed to fetch report', error.message);
    if (!report) throw new NotFoundError('Relatório não encontrado');

    if (userRole === UserRole.CLIENT) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (!profile || !profile.client_id || report.clientId !== profile.client_id) {
            throw new ForbiddenError('Permission denied.');
        }
    }

    const [clientRes, equipmentRes, techRes, timeBlocksRes, partsRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', Number(report.clientId)).single(),
        supabase.from('equipments').select('*').eq('id', Number(report.equipmentId)).single(),
        supabase.from('report_technicians').select('*').eq('reportId', Number(report.id)),
        (!report.time_blocks && report.scheduleId)
            ? supabase.from('schedule_time_blocks').select('*').eq('schedule_id', Number(report.scheduleId))
            : Promise.resolve({ data: [] }),
        supabase.from('report_parts').select('partId, quantity, stock_type, parts(id, reference, designation, stock_quantity, reserved_quantity, stock_quantity_contract, reserved_quantity_contract)').eq('reportId', Number(report.id))
    ]);

    const client = clientRes.data as DbClient | null;
    const equipment = equipmentRes.data as DbEquipment | null;
    const reportTechs = techRes.data as DbReportTechnician[] || [];

    let technicianNames = '';
    let technicians: any[] = [];

    if (reportTechs.length > 0) {
        const techIds = reportTechs.map((rt) => rt.technicianId);
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', techIds);
        if (profiles) {
            technicians = (profiles as DbProfile[]).map((p) => {
                const techRel = reportTechs.find((rt) => rt.technicianId === p.id);
                return {
                    id: p.id,
                    name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                    color: p.color,
                    signature: techRel?.signature
                };
            });
            technicianNames = technicians.map(t => t.name).join(', ');
        }
    }

    let timeBlocks: any[] = [];
    if (Array.isArray(report.time_blocks)) {
        timeBlocks = report.time_blocks;
    } else if (timeBlocksRes.data && timeBlocksRes.data.length > 0) {
        timeBlocks = (timeBlocksRes.data as any[]).map((tb: any) => ({
            id: tb.id,
            start: tb.start_time,
            end: tb.end_time
        }));
    }

    res.json({
        ...report,
        serviceType: scheduleService.getServiceTypeKeys(report.serviceType),
        clientName: client?.name || 'Cliente Desconhecido',
        clientAddress: client?.address || '',
        clientNif: client?.nif || '',
        equipmentBrand: equipment?.brand || '',
        equipmentModel: equipment?.model || '',
        equipmentSerialNumber: equipment?.serialNumber || '',
        technicianName: technicianNames,
        technicians: technicians,
        parts: (partsRes.data as any[] || []).map((rp: any) => ({
            id: rp.parts.id,
            reference: rp.parts.reference,
            designation: rp.parts.designation,
            quantity: rp.quantity,
            stockType: rp.stock_type || StockType.GENERAL,
            stock_quantity: rp.parts.stock_quantity,
            reserved_quantity: rp.parts.reserved_quantity,
            stock_quantity_contract: rp.parts.stock_quantity_contract,
            reserved_quantity_contract: rp.parts.reserved_quantity_contract
        })),
        internalNotes: report.internal_notes,
        timeBlocks: timeBlocks
    });
});

export const getReportBySchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const scheduleId = Number(req.params.scheduleId);
    const { data: report, error } = await supabase.from('reports')
        .select('*')
        .eq('scheduleId', scheduleId)
        .is('deleted_at', null)
        .maybeSingle();

    if (error) throw new ApiError(500, 'Failed to fetch report', error.message);
    if (!report) throw new NotFoundError('Report not found');

    const [techRes, partsRes, timeBlocksRes] = await Promise.all([
        supabase.from('report_technicians').select('*').eq('reportId', report.id),
        supabase.from('report_parts').select('partId, quantity, stock_type, parts(id, reference, designation, stock_quantity, reserved_quantity, stock_quantity_contract, reserved_quantity_contract)').eq('reportId', report.id),
        (!report.time_blocks && report.scheduleId)
            ? supabase.from('schedule_time_blocks').select('*').eq('schedule_id', Number(report.scheduleId))
            : Promise.resolve({ data: [] })
    ]);

    const reportTechnicians = techRes.data as DbReportTechnician[];
    const reportParts = partsRes.data;

    let technicians: any[] = [];
    if (reportTechnicians && reportTechnicians.length > 0) {
        const techIds = reportTechnicians.map((rt) => rt.technicianId);
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', techIds);

        if (profiles) {
            technicians = (profiles as DbProfile[]).map((p) => ({
                id: p.id,
                name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                color: p.color
            }));
        }
    }

    const parts = (reportParts as any[] || []).map((rp: any) => ({
        id: rp.parts.id,
        reference: rp.parts.reference,
        designation: rp.parts.designation,
        quantity: rp.quantity,
        stockType: rp.stock_type || StockType.GENERAL,
        stock_quantity: rp.parts.stock_quantity,
        reserved_quantity: rp.parts.reserved_quantity,
        stock_quantity_contract: rp.parts.stock_quantity_contract,
        reserved_quantity_contract: rp.parts.reserved_quantity_contract
    }));

    let timeBlocks: any[] = [];
    if (Array.isArray(report.time_blocks)) {
        timeBlocks = report.time_blocks;
    } else if (timeBlocksRes.data && timeBlocksRes.data.length > 0) {
        timeBlocks = (timeBlocksRes.data as any[]).map((tb: any) => ({
            id: tb.id,
            start: tb.start_time,
            end: tb.end_time
        }));
    }

    res.json({
        ...report,
        serviceType: scheduleService.getServiceTypeKeys(report.serviceType),
        technicians,
        parts,
        timeBlocks,
        internalNotes: report.internal_notes
    });
});

import { withTransaction } from '../config/db';

export const createReport = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();

    const reportId = await withTransaction(req, async (db) => {
        return await reportService.createFullReport(db, req.body, req.user!.id);
    });

    res.status(201).json({ message: 'Relatório criado com sucesso!', reportId });
});


export const updateReport = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const reportId = Number(req.params.id);

    await withTransaction(req, async (db) => {
        await reportService.updateFullReport(db, reportId, req.body);
    });

    res.json({ message: 'Relatório atualizado!', reportId });
});

export const deleteReport = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const reportId = Number(req.params.id);
    const restoreParts = req.query.restoreParts === 'true';
    const userId = req.user?.id;

    if (!userId) throw new UnauthorizedError();

    await withTransaction(req, async (db) => {
        await reportService.deleteFullReport(db, reportId, userId, restoreParts);
    });

    res.status(200).json({ message: 'Relatório removido com sucesso.' });
});

import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import * as inventoryService from '../services/inventoryService';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, ForbiddenError, NotFoundError, UnauthorizedError, BadRequestError } from '../utils/ApiError';
import { UserRole, StockType } from '../constants/enums';

export const getReports = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { data: reports, error: reportsError } = await supabase
        .from('reports')
        .select('*')
        .order('serviceDate', { ascending: false });

    if (reportsError) throw new ApiError(500, 'Failed to fetch reports', reportsError.message);
    if (!reports || reports.length === 0) return res.json([]);

    const clientIds = [...new Set(reports.map(r => r.clientId).filter(Boolean))];
    const equipmentIds = [...new Set(reports.map(r => r.equipmentId).filter(Boolean))];
    const reportIds = reports.map(r => r.id);

    const [clientsRes, equipmentsRes, techniciansRes] = await Promise.all([
        clientIds.length > 0 ? supabase.from('clients').select('id, name').in('id', clientIds) : Promise.resolve({ data: [] }),
        equipmentIds.length > 0 ? supabase.from('equipments').select('id, brand, model').in('id', equipmentIds) : Promise.resolve({ data: [] }),
        reportIds.length > 0 ? supabase.from('report_technicians').select('reportId, technicianId, signature').in('reportId', reportIds) : Promise.resolve({ data: [] })
    ]);

    const clientMap = new Map(clientsRes.data?.map(c => [c.id, (c as any).name]) || []);
    const equipmentMap = new Map(equipmentsRes.data?.map(e => [e.id, e]) || []);

    const techIds = [...new Set(techniciansRes.data?.map(rt => rt.technicianId).filter(Boolean) || [])];
    const { data: profiles } = techIds.length > 0 ? await supabase.from('profiles').select('id, first_name, last_name, color').in('id', techIds) : { data: [] };
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const techMap = new Map<number, any[]>();
    techniciansRes.data?.forEach(rt => {
        const p = profileMap.get(rt.technicianId);
        if (p) {
            if (!techMap.has(rt.reportId)) techMap.set(rt.reportId, []);
            techMap.get(rt.reportId)!.push({
                id: p.id,
                name: `${(p as any).first_name || ''} ${(p as any).last_name || ''}`.trim(),
                color: (p as any).color,
                signature: rt.signature
            });
        }
    });

    const result = reports.map(r => {
        const eq = equipmentMap.get(r.equipmentId);
        return {
            ...r,
            clientName: clientMap.get(r.clientId) || 'Cliente Desconhecido',
            equipmentBrand: (eq as any)?.brand || '',
            equipmentModel: (eq as any)?.model || '',
            technicians: techMap.get(r.id) || [],
            internalNotes: r.internal_notes
        };
    });

    res.json(result);
});

export const getReportById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { id } = req.params;
    const userRole = req.user.user_metadata?.role;
    const userId = req.user.id;

    const { data: report, error } = await supabase
        .from('reports')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw new ApiError(500, 'Failed to fetch report', error.message);
    if (!report) throw new NotFoundError('Report not found');

    if (userRole === UserRole.CLIENT) {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('client_id')
            .eq('id', userId)
            .single();

        if (profileError || !profile || !profile.client_id || report.clientId !== profile.client_id) {
            throw new ForbiddenError('Permission denied.');
        }
    }

    const [clientRes, equipmentRes, techRes, timeBlocksRes] = await Promise.all([
        supabase.from('clients').select('id, name, address, nif').eq('id', report.clientId).single(),
        supabase.from('equipments').select('id, brand, model, serialNumber').eq('id', report.equipmentId).single(),
        supabase.from('report_technicians').select('technicianId, signature').eq('reportId', report.id),
        report.scheduleId
            ? supabase.from('schedule_time_blocks').select('id, start_time, end_time').eq('schedule_id', report.scheduleId)
            : Promise.resolve({ data: [] })
    ]);

    const client = clientRes.data;
    const equipment = equipmentRes.data;
    const reportTechs = techRes.data || [];

    let technicianNames = '';
    let technicians: any[] = [];

    if (reportTechs.length > 0) {
        const techIds = reportTechs.map((rt: any) => rt.technicianId);
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, color').in('id', techIds);
        if (profiles) {
            technicians = profiles.map((p: any) => {
                const techRel = reportTechs.find((rt: any) => rt.technicianId === p.id);
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

    res.json({
        ...report,
        clientName: (client as any)?.name || 'Cliente Desconhecido',
        clientAddress: (client as any)?.address || '',
        clientNif: (client as any)?.nif || '',
        equipmentBrand: (equipment as any)?.brand || '',
        equipmentModel: (equipment as any)?.model || '',
        equipmentSerialNumber: (equipment as any)?.serialNumber || '',
        technicianName: technicianNames,
        technicians: technicians,
        internalNotes: report.internal_notes,
        timeBlocks: (timeBlocksRes as any).data?.map((tb: any) => ({
            id: tb.id,
            start: tb.start_time,
            end: tb.end_time
        })) || []
    });
});

export const getReportBySchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const scheduleId = Number(req.params.scheduleId);
    const { data: report, error } = await supabase
        .from('reports')
        .select('*')
        .eq('scheduleId', scheduleId)
        .maybeSingle();

    if (error) throw new ApiError(500, 'Failed to fetch report', error.message);
    if (!report) throw new NotFoundError('Report not found');

    const { data: reportTechnicians } = await supabase
        .from('report_technicians')
        .select('technicianId')
        .eq('reportId', report.id);

    let technicians: any[] = [];
    if (reportTechnicians && reportTechnicians.length > 0) {
        const techIds = reportTechnicians.map((rt: any) => rt.technicianId);
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, color').in('id', techIds);

        if (profiles) {
            technicians = profiles.map((p: any) => ({
                id: p.id,
                name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                color: p.color
            }));
        }
    }

    res.json({ ...report, technicians, internalNotes: (report as any).internal_notes });
});

export const createReport = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { clientId, equipmentId, scheduleId, technicianIds, serviceDate, hours, parts, description, damage, serviceType, internalNotes, signature, technician_signature } = req.body;

    const { data: scheduleData } = await supabase.from('schedules').select('startDate').eq('id', scheduleId).single();
    if (!scheduleData) throw new ApiError(500, 'Erro ao obter dados do agendamento.');

    const scheduleYear = new Date((scheduleData as any).startDate).getFullYear();
    const minReportNum = scheduleYear * 10000;
    const maxReportNum = minReportNum + 9999;

    const { data: maxReport } = await supabase
        .from('reports')
        .select('report_number')
        .gte('report_number', minReportNum)
        .lte('report_number', maxReportNum)
        .order('report_number', { ascending: false })
        .limit(1)
        .maybeSingle();

    let nextSequence = 1;
    if ((maxReport as any)?.report_number) {
        nextSequence = parseInt(String((maxReport as any).report_number).slice(4), 10) + 1;
    }
    const newReportNumber = `${scheduleYear}${String(nextSequence).padStart(4, '0')}`;

    const { data: report, error: reportError } = await supabase
        .from('reports')
        .insert({
            clientId, equipmentId, scheduleId, serviceDate, hours, parts: parts || [],
            description, damage: damage || '', serviceType: serviceType || [], internal_notes: internalNotes || '',
            report_number: newReportNumber, signature: signature || '', technician_signature: technician_signature || '',
            includes_travel: req.body.includesTravel !== undefined ? req.body.includesTravel : false
        })
        .select('id').single();

    if (reportError) throw new ApiError(500, 'Erro ao criar relatório.', reportError.message);

    if (technicianIds.length > 0) {
        const reportTechnicians = technicianIds.map((techId: number) => ({
            reportId: report.id,
            technicianId: techId,
            signature: req.body.technicianSignatures ? req.body.technicianSignatures[techId] : null
        }));
        await supabase.from('report_technicians').insert(reportTechnicians);
    }

    await supabase.from('schedules').update({ hasReport: true }).eq('id', scheduleId);

    if (Array.isArray(parts)) {
        for (const p of parts) {
            if (p.id && p.quantity > 0) {
                await inventoryService.abatePartInventory(supabase, p.id, Number(p.quantity), p.stockType || StockType.GENERAL);
            }
        }
    }

    res.status(201).json({ message: 'Relatório criado com sucesso!', reportId: report.id });
});

export const updateReport = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const reportId = req.params.id;
    const { clientId, equipmentId, scheduleId, technicianIds, serviceDate, hours, parts, description, damage, serviceType, internalNotes, signature, technician_signature } = req.body;

    const { data: updatedReport, error: reportError } = await supabase
        .from('reports')
        .update({
            clientId, equipmentId, scheduleId, serviceDate, hours, parts: parts || [],
            description, damage: damage || '', serviceType: serviceType || [], internal_notes: internalNotes || '',
            signature: signature, technician_signature: technician_signature, includes_travel: req.body.includesTravel
        })
        .eq('id', reportId)
        .select('id').single();

    if (reportError) throw new ApiError(500, 'Erro ao atualizar relatório.', reportError.message);

    await supabase.from('report_technicians').delete().eq('reportId', reportId);
    if (technicianIds && technicianIds.length > 0) {
        const reportTechnicians = technicianIds.map((techId: number) => ({
            reportId: updatedReport.id,
            technicianId: techId,
            signature: req.body.technicianSignatures ? req.body.technicianSignatures[techId] : null
        }));
        await supabase.from('report_technicians').insert(reportTechnicians);
    }

    res.json({ message: 'Relatório atualizado!', reportId: updatedReport.id });
});

export const deleteReport = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { data: report } = await supabase.from('reports').select('scheduleId').eq('id', id).single();
    if ((report as any)?.scheduleId) {
        await supabase.from('schedules').update({ hasReport: false }).eq('id', (report as any).scheduleId);
    }
    await supabase.from('report_technicians').delete().eq('reportId', id);
    const { error } = await supabase.from('reports').delete().eq('id', id);
    if (error) throw new ApiError(500, 'Failed to delete report', error.message);
    res.sendStatus(204);
});

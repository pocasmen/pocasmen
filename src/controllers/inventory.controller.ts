import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import * as inventoryService from '../services/inventoryService';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, BadRequestError, NotFoundError } from '../utils/ApiError';
import { StockType } from '../constants/enums';

export const getInventory = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { data: parts, error } = await supabase
        .from('parts')
        .select('id, reference, designation, stock_quantity, reserved_quantity, ordered_quantity, stock_quantity_contract, reserved_quantity_contract, ordered_quantity_contract, is_composed')
        .order('designation', { ascending: true });

    if (error) throw new ApiError(500, 'Failed to fetch inventory', error.message);

    const { data: allComponents, error: compError } = await supabase
        .from('part_components')
        .select('parent_part_id, child_part_id, quantity');

    if (compError) throw new ApiError(500, 'Failed to fetch components', compError.message);

    const partsMap = new Map((parts || []).map(p => [p.id, p]));
    const componentsByParent = new Map<number, any[]>();
    (allComponents || []).forEach(c => {
        if (!componentsByParent.has(c.parent_part_id)) componentsByParent.set(c.parent_part_id, []);
        componentsByParent.get(c.parent_part_id)!.push(c);
    });

    const calculateVirtualStock = (partId: number, visited = new Set<number>()): number => {
        if (visited.has(partId)) return 0;
        visited.add(partId);
        const part = partsMap.get(partId);
        if (!part) return 0;
        if (!part.is_composed) return (part.stock_quantity || 0) - (part.reserved_quantity || 0);
        const components = componentsByParent.get(partId);
        if (!components || components.length === 0) return 0;
        let minPossible = Infinity;
        for (const comp of components) {
            const compStock = calculateVirtualStock(comp.child_part_id, new Set(visited));
            const possible = Math.floor(compStock / (comp.quantity || 1));
            if (possible < minPossible) minPossible = possible;
        }
        return minPossible === Infinity ? 0 : minPossible;
    };

    const finalResult = (parts || []).map(p => {
        if (p.is_composed) {
            const computeAvailableGeneral = (pid: number, v = new Set<number>()): number => {
                if (v.has(pid)) return 0;
                v.add(pid);
                const pt = partsMap.get(pid);
                if (!pt) return 0;
                if (!pt.is_composed) return (pt.stock_quantity || 0) - (pt.reserved_quantity || 0);
                const comps = componentsByParent.get(pid);
                if (!comps) return 0;
                let minP = Infinity;
                for (const c of comps) {
                    const possible = Math.floor(computeAvailableGeneral(c.child_part_id, new Set(v)) / (c.quantity || 1));
                    if (possible < minP) minP = possible;
                }
                return minP === Infinity ? 0 : minP;
            };

            const computeAvailableContract = (pid: number, v = new Set<number>()): number => {
                if (v.has(pid)) return 0;
                v.add(pid);
                const pt = partsMap.get(pid);
                if (!pt) return 0;
                if (!pt.is_composed) return (pt.stock_quantity_contract || 0) - (pt.reserved_quantity_contract || 0);
                const comps = componentsByParent.get(pid);
                if (!comps) return 0;
                let minP = Infinity;
                for (const c of comps) {
                    const possible = Math.floor(computeAvailableContract(c.child_part_id, new Set(v)) / (c.quantity || 1));
                    if (possible < minP) minP = possible;
                }
                return minP === Infinity ? 0 : minP;
            };

            return {
                ...p,
                stock_quantity: computeAvailableGeneral(p.id) + (p.reserved_quantity || 0),
                stock_quantity_contract: computeAvailableContract(p.id) + (p.reserved_quantity_contract || 0),
                virtual_stock: calculateVirtualStock(p.id)
            };
        }
        return p;
    });

    res.json(finalResult);
});

export const getPartReservations = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const partId = req.params.id;
    const { data, error } = await supabase
        .from('schedule_parts')
        .select('quantity, stock_type, schedules(id, title, startDate, clients(name))')
        .eq('partId', partId)
        .eq('schedules.isCompleted', false);

    if (error) throw new ApiError(500, 'Failed to fetch reservations', error.message);

    const reservations = (data || [])
        .filter((item: any) => item.schedules)
        .map((item: any) => ({
            scheduleId: item.schedules.id,
            title: item.schedules.title,
            startDate: item.schedules.startDate,
            clientName: item.schedules.clients?.name || 'Cliente Desconhecido',
            quantityReserved: item.quantity,
            stockType: item.stock_type || StockType.GENERAL
        }));

    res.json(reservations);
});

export const deletePart = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const partId = req.params.id;
    const { count: scheduleCount, error: scheduleError } = await supabase
        .from('schedule_parts')
        .select('*', { count: 'exact', head: true })
        .eq('partId', partId);

    if (scheduleError) throw new ApiError(500, 'Failed to check dependencies', scheduleError.message);
    if (scheduleCount && scheduleCount > 0) throw new BadRequestError('Não é possível apagar a peça: Está a ser utilizada em agendamentos existentes.');

    const { count: parentCount, error: parentError } = await supabase
        .from('part_components')
        .select('*', { count: 'exact', head: true })
        .eq('child_part_id', partId);

    if (parentError) throw new ApiError(500, 'Failed to check dependencies', parentError.message);
    if (parentCount && parentCount > 0) throw new BadRequestError('Não é possível apagar a peça: Faz parte da composição de outros itens (Kits).');

    await supabase.from('part_components').delete().eq('parent_part_id', partId);
    const { error } = await supabase.from('parts').delete().eq('id', partId);

    if (error) throw new ApiError(500, 'Failed to delete part', error.message);
    res.sendStatus(204);
});

export const getPartByReference = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const reference = req.params.reference;

    const { data, error } = await supabase
        .from('parts')
        .select('id, reference, designation, stock_quantity, reserved_quantity, stock_quantity_contract, reserved_quantity_contract')
        .eq('reference', reference)
        .single();

    if (error) {
        if (error.code === 'PGRST116') throw new NotFoundError('Part not found.');
        throw new ApiError(500, 'Failed to fetch part', error.message);
    }
    res.json(data);
});

export const updateComposedPart = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const parentId = req.params.id;
    const { reference, designation, components } = req.body;
    const { data: parentPart, error: parentError } = await supabase.from('parts').update({ reference, designation }).eq('id', parentId).select().single();
    if (parentError) throw new ApiError(500, 'Failed to update part', parentError.message);
    await supabase.from('part_components').delete().eq('parent_part_id', parentId);
    const componentsData = components.map((comp: any) => ({ parent_part_id: parentId, child_part_id: comp.partId, quantity: comp.quantity }));
    if (componentsData.length > 0) await supabase.from('part_components').insert(componentsData);
    res.json({ ...parentPart, components: componentsData });
});

export const updateStock = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const partId = req.params.id;
    const { quantity, fromOrder, targetStock } = req.body;
    const { data: currentPart, error: fetchError } = await supabase.from('parts').select('stock_quantity, ordered_quantity, stock_quantity_contract, ordered_quantity_contract').eq('id', partId).single();
    if (fetchError || !currentPart) throw new NotFoundError('Part not found');

    const result = inventoryService.processStockUpdate({
        stock: currentPart.stock_quantity || 0,
        ordered: currentPart.ordered_quantity || 0,
        stockContract: currentPart.stock_quantity_contract || 0,
        orderedContract: currentPart.ordered_quantity_contract || 0
    }, quantity, !!fromOrder, targetStock || StockType.GENERAL);

    const { data, error } = await supabase.from('parts').update({
        stock_quantity: result.newStock,
        ordered_quantity: result.newOrdered,
        stock_quantity_contract: result.newStockContract,
        ordered_quantity_contract: result.newOrderedContract
    }).eq('id', partId).select().single();

    if (error) throw new ApiError(500, 'Failed to update stock', error.message);
    res.json(data);
});

export const updateOrder = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const partId = req.params.id;
    const { quantity, targetStock } = req.body;
    const { data: currentPart, error: fetchError } = await supabase.from('parts').select('ordered_quantity, ordered_quantity_contract').eq('id', partId).single();
    if (fetchError || !currentPart) throw new NotFoundError('Part not found');

    const newOrdered = inventoryService.calculateNewQuantity(
        (targetStock === StockType.CONTRACT ? currentPart.ordered_quantity_contract : currentPart.ordered_quantity) || 0,
        quantity
    );

    const updateData: any = {};
    if (targetStock === StockType.CONTRACT) updateData.ordered_quantity_contract = newOrdered;
    else updateData.ordered_quantity = newOrdered;

    const { data, error } = await supabase.from('parts').update(updateData).eq('id', partId).select().single();
    if (error) throw new ApiError(500, 'Failed to update order', error.message);
    res.json(data);
});

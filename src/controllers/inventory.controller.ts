//Horas de desenvolvimento activo=8,5
import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import * as inventoryService from '../services/inventoryService';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, BadRequestError, NotFoundError } from '../utils/ApiError';
import { withTransaction } from '../config/db';
import { StockType } from '../constants/enums';
import { Part, PartComponent, PartInsert, PartUpdate } from '../types/supabase';

import { pool } from '../config/db';

export const getInventory = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100)); // Default 100 parts

    const finalResult = await inventoryService.getEnrichedInventory(pool, page, limit);
    res.json(finalResult);
});

export const getPartReservations = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const partId = Number(req.params.id);
    const reservations = await inventoryService.getPartReservations(supabase, partId);
    res.json(reservations);
});

export const deletePart = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const partId = req.params.id;

    await withTransaction(req, async (db) => {
        // Dependencies check
        const { rows: scheRows } = await db.query('SELECT 1 FROM schedule_parts WHERE "partId" = $1 LIMIT 1', [Number(partId)]);
        if (scheRows.length > 0) {
            throw new BadRequestError('Não é possível apagar a peça: Está a ser utilizada em agendamentos existentes.');
        }

        const { rows: repRows } = await db.query('SELECT 1 FROM report_parts WHERE "partId" = $1 LIMIT 1', [Number(partId)]);
        if (repRows.length > 0) {
            throw new BadRequestError('Não é possível apagar a peça: Está a ser utilizada em relatórios existentes.');
        }

        const { rows: componentRows } = await db.query('SELECT 1 FROM part_components WHERE child_part_id = $1 LIMIT 1', [Number(partId)]);
        if (componentRows.length > 0) {
            throw new BadRequestError('Não é possível apagar a peça: Faz parte da composição de outros itens (Kits).');
        }

        // Deletions
        await db.query('DELETE FROM part_components WHERE parent_part_id = $1', [Number(partId)]);
        const { rowCount } = await db.query('DELETE FROM parts WHERE id = $1', [Number(partId)]);

        if (rowCount === 0) throw new NotFoundError('Peça não encontrada.');
    });

    res.sendStatus(204);
});

export const getPartComponents = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const partId = req.params.id;
    if (!partId || isNaN(Number(partId))) throw new BadRequestError('ID da peça inválido');

    const result = await withTransaction(req, async (db) => {
        const query = `
          WITH RECURSIVE component_hierarchy AS (
            SELECT parent_part_id, child_part_id, quantity, 1 as level
            FROM part_components 
            WHERE parent_part_id = $1
            UNION ALL
            SELECT pc.parent_part_id, pc.child_part_id, pc.quantity, ch.level + 1
            FROM part_components pc
            INNER JOIN component_hierarchy ch ON pc.parent_part_id = ch.child_part_id
            WHERE ch.level < 10
          )
          SELECT ch.child_part_id as "partId", ch.quantity, ch.level, ch.parent_part_id, p.reference, p.designation
          FROM component_hierarchy ch
          LEFT JOIN parts p ON ch.child_part_id = p.id
          ORDER BY level, child_part_id;
        `;
        const { rows } = await db.query<{
            partId: number;
            quantity: number;
            level: number;
            parent_part_id: number;
            reference: string;
            designation: string;
        }>(query, [partId]);
        return rows;
    });
    res.json(result);
});

export const getPartByReference = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const reference = req.params.reference;
    const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('reference', reference)
        .single();

    if (error) {
        if (error.code === 'PGRST116') throw new NotFoundError('Part not found.');
        throw new ApiError(500, 'Failed to fetch part', error.message);
    }
    res.json(data);
});



export const updateComposedPart = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const parentId = Number(req.params.id);

    const result = await withTransaction(req, async (db) => {
        return await inventoryService.updateComposedPart(db, parentId, req.body);
    });
    res.json(result);
});

export const updateStock = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const partId = Number(req.params.id);

    const result = await withTransaction(req, async (db) => {
        return await inventoryService.updatePartStock(db, partId, req.body);
    });
    res.json(result);
});

export const updateOrder = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const partId = Number(req.params.id);
    const { quantity, targetStock } = req.body;

    const result = await withTransaction(req, async (db) => {
        const { rows: partRows } = await db.query<Part>('SELECT ordered_quantity, ordered_quantity_foss FROM parts WHERE id = $1 FOR UPDATE', [partId]);
        if (partRows.length === 0) throw new NotFoundError('Part not found');
        const currentPart = partRows[0];

        const newOrdered = Math.max(0, ((targetStock === StockType.FOSS ? currentPart.ordered_quantity_foss : currentPart.ordered_quantity) || 0) + Number(quantity));

        const sql = targetStock === StockType.FOSS
            ? 'UPDATE parts SET ordered_quantity_foss = $1 WHERE id = $2'
            : 'UPDATE parts SET ordered_quantity = $1 WHERE id = $2';

        await db.query(sql, [newOrdered, partId]);

        const { rows: updatedRows } = await db.query('SELECT * FROM parts WHERE id = $1', [partId]);
        return inventoryService.enrichPart(updatedRows[0]);
    });
    res.json(result);
});

export const createPart = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { reference, designation, stock_quantity, is_composed } = req.body;

    const result = await withTransaction(req, async (db) => {
        const { rows: existing } = await db.query('SELECT 1 FROM parts WHERE reference = $1', [reference]);
        if (existing.length > 0) throw new BadRequestError('Já existe uma peça com esta referência.');

        const { rows } = await db.query<Part>(
            'INSERT INTO parts (reference, designation, stock_quantity, is_composed) VALUES ($1, $2, $3, $4) RETURNING *',
            [reference, designation, stock_quantity || 0, !!is_composed]
        );
        return rows[0];
    });

    res.status(201).json(result);
});

export const createComposedPart = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const result = await withTransaction(req, async (db) => {
        return await inventoryService.createComposedPart(db, req.body);
    });
    res.status(201).json(result);
});

export const updatePart = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { reference, designation } = req.body;

    const result = await withTransaction(req, async (db) => {
        const { rows, rowCount } = await db.query<Part>(
            'UPDATE parts SET reference = $1, designation = $2 WHERE id = $3 RETURNING *',
            [reference, designation, Number(id)]
        );
        if (rowCount === 0) throw new NotFoundError('Peça não encontrada.');
        return inventoryService.enrichPart(rows[0]);
    });

    res.json(result);
});

export const syncPartStock = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const partId = Number(req.params.id);

    const result = await withTransaction(req, async (db) => {
        return await inventoryService.syncPartStock(db, partId);
    });
    res.json(result);
});

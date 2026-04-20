import { pool, withTransactionAs } from '../../config/db';
import { BadRequestError, NotFoundError, ApiError } from '../../utils/ApiError';
import { StockType } from '../../constants/enums';
import { Part } from '../../types/supabase';
import * as inventoryService from '../../services/inventoryService';
import { InventoryRepository } from './inventory.repository';
import { supabase, INVENTORY_BUCKET } from '../../config/supabase';

import { PartsTransactionRepository } from './partsTransaction.repository';

export class InventoryService {
    constructor(private repo: InventoryRepository, private transactionRepo: PartsTransactionRepository) {}

    async uploadBatchImages(files: Express.Multer.File[], userId: string) {
        const results = {
            success: 0,
            failed: 0,
            errors: [] as { file: string; error: string }[]
        };

        for (const file of files) {
            try {
                // Get reference from filename (e.g., "REF-123.jpg" -> "REF-123")
                const reference = file.originalname.split('.')[0];
                
                // Find part by reference
                const part = await this.repo.findByReference(reference);
                
                if (!part) {
                    results.failed++;
                    results.errors.push({ file: file.originalname, error: `Peça com referência "${reference}" não encontrada.` });
                    continue;
                }

                const fileExt = file.originalname.split('.').pop() || 'jpg';
                const filePath = `items/${reference}.${fileExt}`;

                // Upload to Supabase (upsert: true to replace silently)
                const { error: uploadError } = await supabase.storage.from(INVENTORY_BUCKET).upload(filePath, file.buffer, { 
                    contentType: file.mimetype,
                    upsert: true 
                });

                if (uploadError) throw new Error(uploadError.message);

                // Update DB path
                await pool.query('UPDATE parts SET image_path = $1 WHERE id = $2', [filePath, part.id]);

                results.success++;
            } catch (err: any) {
                results.failed++;
                results.errors.push({ file: file.originalname, error: err.message || 'Erro desconhecido' });
            }
        }

        return results;
    }

    async getInventory(page: number, limit: number, search?: string, view?: string) {
        return inventoryService.getEnrichedInventory(pool, page, limit, search, view);
    }

    async getPartReservations(partId: number) {
        return this.repo.getPartReservations(partId);
    }

    async deletePart(partId: number, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const deps = await this.repo.checkDependencies(partId, db);
            
            // Se estiver em agendamentos, relatórios ou encomendas, NÃO podemos apagar fisicamente.
            // Nestes casos, usamos soft delete para manter a integridade referencial e o histórico.
            if (deps.hasSchedules || deps.hasReports || deps.isComponentOfKit || deps.hasOrders) {
                await this.repo.softDelete(partId, userId, db);
                return;
            }

            // Se apenas tiver transações (movimentos de stock manuais, etc.) ou nada, 
            // apagamos completamente conforme solicitado, incluindo as transações.
            await this.repo.delete(partId, db);
        });
    }

    async getPartComponents(partId: number) {
        return this.repo.findHierarchy(partId);
    }

    async getPartByReference(reference: string) {
        const part = await this.repo.findByReference(reference);
        if (!part) throw new NotFoundError('Peça não encontrada pela referência.');
        return part;
    }

    async getPartById(id: number) {
        const part = await this.repo.findById(id, pool);
        if (!part) throw new NotFoundError('Peça não encontrada pelo ID.');
        
        // Also fetch components if it's a kit
        if (part.is_composed) {
            const components = await this.repo.findHierarchy(id);
            (part as any).components = components;
        }
        
        return part;
    }

    async updateComposedPart(parentId: number, data: any, userId: string) {
        return withTransactionAs(userId, (db) => inventoryService.updateComposedPart(db, parentId, data));
    }

    async updateStock(partId: number, data: any, userId: string) {
        return withTransactionAs(userId, (db) => inventoryService.updatePartStock(db, partId, data, userId));
    }

    async registerDirectSale(data: any, userId: string) {
        return withTransactionAs(userId, (db) => inventoryService.registerDirectSale(db, data, userId));
    }

    async updateOrder(partId: number, quantity: number, targetStock: string, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const { rows } = await db.query<Part>('SELECT ordered_quantity, ordered_quantity_foss FROM parts WHERE id = $1 FOR UPDATE', [partId]);
            if (rows.length === 0) throw new NotFoundError('Part not found');
            const current = rows[0];
            const newOrdered = Math.max(
                0,
                ((targetStock === StockType.FOSS ? current.ordered_quantity_foss : current.ordered_quantity) || 0) + Number(quantity)
            );
            const sql = targetStock === StockType.FOSS
                ? 'UPDATE parts SET ordered_quantity_foss = $1 WHERE id = $2'
                : 'UPDATE parts SET ordered_quantity = $1 WHERE id = $2';
            await db.query(sql, [newOrdered, partId]);
            const { rows: updated } = await db.query('SELECT * FROM parts WHERE id = $1', [partId]);
            return inventoryService.enrichPart(updated[0]);
        });
    }

    async createPart(data: any, userId: string) {
        return withTransactionAs(userId, async (db) => {
            let { reference, designation, stock_quantity, is_composed, min_stock, min_stock_foss, price, notes, track_stock } = data;
            
            if (reference) reference = reference.trim().replace(/\s+/g, ' ');
            if (designation) designation = designation.trim().replace(/\s+/g, ' ');
            
            const { rows: existing } = await db.query('SELECT 1 FROM parts WHERE reference = $1', [reference]);
            if (existing.length > 0) throw new BadRequestError('Já existe uma peça com esta referência.');
            const { rows } = await db.query<Part>(
                'INSERT INTO parts (reference, designation, stock_quantity, is_composed, min_stock, min_stock_foss, price, notes, track_stock) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
                [reference, designation, stock_quantity || 0, !!is_composed, min_stock || 0, min_stock_foss || 0, price || 0, notes || '', track_stock !== false]
            );
            return rows[0];
        });
    }

    async createComposedPart(data: any, userId: string) {
        return withTransactionAs(userId, (db) => inventoryService.createComposedPart(db, data));
    }

    async updatePart(id: number, data: any, userId: string) {
        return withTransactionAs(userId, async (db) => {
            let { reference, designation, min_stock, min_stock_foss, price, notes, track_stock } = data;
            
            if (reference) reference = reference.trim().replace(/\s+/g, ' ');
            if (designation) designation = designation.trim().replace(/\s+/g, ' ');
            
            const { rows, rowCount } = await db.query<Part>(
                'UPDATE parts SET reference = $1, designation = $2, min_stock = $3, min_stock_foss = $4, price = $5, notes = $6, track_stock = $7 WHERE id = $8 RETURNING *',
                [reference, designation, min_stock || 0, min_stock_foss || 0, price || 0, notes || '', track_stock !== false, id]
            );
            if (rowCount === 0) throw new NotFoundError('Peça não encontrada.');
            return inventoryService.enrichPart(rows[0]);
        });
    }

    async syncPartStock(partId: number, userId: string) {
        return withTransactionAs(userId, (db) => inventoryService.syncPartStock(db, partId));
    }

    async getInventoryAll() {
        return inventoryService.getEnrichedInventory(pool, 1, 10000);
    }

    async importPrices(items: { reference: string, price: number }[], userId: string) {
        return withTransactionAs(userId, async (db) => {
            const results = { updated: 0, notFound: 0 };
            for (const item of items) {
                if (!item.reference) continue;
                
                // Remove all dots or spaces (thousand separators), then replace comma with dot
                // e.g., "1.234,56" -> "1234.56"
                // e.g., "1 234,56" -> "1234.56"
                let priceStr = String(item.price || 0)
                    .replace(/\./g, '')
                    .replace(/\s/g, '')
                    .replace(',', '.');
                let priceValue = parseFloat(priceStr);
                if (isNaN(priceValue)) priceValue = 0;

                const { rowCount } = await db.query(
                    'UPDATE parts SET price = $1 WHERE reference = $2',
                    [priceValue, item.reference]
                );
                
                if (rowCount && rowCount > 0) {
                    results.updated++;
                } else {
                    results.notFound++;
                }
            }
            return results;
        });
    }


    async getPartHistory(partId: number) {
        return this.transactionRepo.getHistoryByPartId(pool, partId);
    }

    async getTransactions(page: number, limit: number) {
        return this.transactionRepo.getTransactions(pool, limit, page);
    }
}

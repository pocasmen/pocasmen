import { pool, withTransactionAs } from '../../config/db';
import { PartsSaleRepository } from './partsSale.repository';
import * as inventoryService from '../../services/inventoryService';
import { StockType } from '../../constants/enums';
import { NotFoundError, BadRequestError } from '../../utils/ApiError';

export class PartsSaleService {
    constructor(private repo: PartsSaleRepository) {}

    private getSaleTypeLabel(type: string): string {
        const labels: Record<string, string> = {
            'SALE': 'Venda',
            'GIVEAWAY': 'Oferta',
            'DISCARD': 'Descarte'
        };
        return labels[type] || type;
    }

    async createSale(data: any, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const { document_number, sale_type, notes, items, stockType } = data;
            const saleLabel = this.getSaleTypeLabel(sale_type);
            
            // Only allow physical inventories (Geral or Foss)
            if (stockType !== StockType.GENERAL && stockType !== StockType.FOSS) {
                throw new BadRequestError(`Tipo de stock inválido para venda: ${stockType}. Apenas Geral ou Foss são permitidos.`);
            }

            // 1. Create Sale record
            const sale = await this.repo.createSale(db, { 
                document_number, 
                user_id: userId, 
                sale_type, 
                stock_type: stockType,
                notes 
            });
            
            for (const item of items) {
                const { partId, designation, quantity } = item;
                
                // 2. Add Sale Item
                await this.repo.addSaleItem(db, {
                    sale_id: sale.id,
                    part_id: partId,
                    designation: designation || '',
                    quantity
                });
                
                // 3. Register movement in ledger (DIRECT_SALE)
                await inventoryService.registerDirectSale(db, {
                    part_id: partId,
                    quantity: quantity,
                    stock_type: stockType,
                    notes: `Saída via ${saleLabel} #${document_number}`,
                    reference_id: String(sale.id)
                }, userId);
            }
            
            return sale;
        });
    }

    async getSales(filters: any) {
        return this.repo.getSales(pool, filters);
    }

    async getSaleById(id: number) {
        const sale = await this.repo.getSaleById(pool, id);
        if (!sale) throw new NotFoundError('Venda/Saída não encontrada');
        return sale;
    }

    async addItemsToSale(saleId: number, items: any[], userId: string) {
        return withTransactionAs(userId, async (db) => {
            const sale = await this.repo.getSaleById(db, saleId);
            if (!sale) throw new NotFoundError('Venda/Saída não encontrada');
            
            const saleLabel = this.getSaleTypeLabel(sale.sale_type);

            for (const item of items) {
                const { partId, designation, quantity } = item;
                
                await this.repo.addSaleItem(db, {
                    sale_id: saleId,
                    part_id: partId,
                    designation: designation || '',
                    quantity
                });
                
                // Register movement in ledger (DIRECT_SALE)
                await inventoryService.registerDirectSale(db, {
                    part_id: partId,
                    quantity: quantity,
                    stock_type: sale.stock_type,
                    notes: `Saída via ${saleLabel} #${sale.document_number}`,
                    reference_id: String(sale.id)
                }, userId);
            }
            
            return this.repo.getSaleById(db, saleId);
        });
    }

    async deleteSaleItem(saleId: number, itemId: number, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const sale = await this.repo.getSaleById(db, saleId);
            if (!sale) throw new NotFoundError('Venda/Saída não encontrada');
            const item = sale.items.find((i: any) => i.id === itemId);
            if (!item) throw new NotFoundError('Item de saída não encontrado');
            
            const saleLabel = this.getSaleTypeLabel(sale.sale_type);

            // Restore stock for this item
            await inventoryService.registerDirectSale(db, {
                part_id: item.part_id,
                quantity: -item.quantity,
                stock_type: sale.stock_type,
                notes: `Reposição de item por eliminação de ${saleLabel} #${sale.document_number}`,
                reference_id: String(sale.id)
            }, userId);

            // Delete the item
            await db.query(`DELETE FROM parts_sale_items WHERE id = $1`, [itemId]);
        });
    }

    async deleteSale(id: number, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const sale = await this.repo.getSaleById(db, id);
            if (!sale) throw new NotFoundError('Venda/Saída não encontrada');
            
            const saleLabel = this.getSaleTypeLabel(sale.sale_type);

            // Restore stock for each item
            for (const item of sale.items) {
                await inventoryService.registerDirectSale(db, {
                    part_id: item.part_id,
                    quantity: -item.quantity, // Negative quantity to restore (minus negative is positive in the ledger logic)
                    stock_type: sale.stock_type,
                    notes: `Reposição por eliminação de ${saleLabel} #${sale.document_number}`,
                    reference_id: String(sale.id)
                }, userId);
            }

            await this.repo.deleteSale(db, id);
        });
    }
}

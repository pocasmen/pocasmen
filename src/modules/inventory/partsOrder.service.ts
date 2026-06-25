import { pool, withTransactionAs } from '../../config/db';
import { PartsOrderRepository } from './partsOrder.repository';
import * as inventoryService from '../../services/inventoryService';
import { StockType } from '../../constants/enums';
import { NotFoundError, BadRequestError } from '../../utils/ApiError';

export class PartsOrderService {
    constructor(private repo: PartsOrderRepository) {}

    async createOrder(data: any, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const { document_number, notes, items } = data;
            const order = await this.repo.createOrder(db, { document_number, user_id: userId, notes });
            
            for (const item of items) {
                let { designation, reference, quantity, stockType } = item;
                let currentPartId = item.partId;

                if (reference) reference = reference.trim().replace(/\s+/g, ' ');
                if (designation) designation = designation.trim().replace(/\s+/g, ' ');

                if (!currentPartId && reference) {
                    const cleanedRef = reference.trim();
                    const { rows: existing } = await db.query('SELECT id FROM parts WHERE reference = $1 OR TRIM(reference) = $1', [cleanedRef]);
                    if (existing.length > 0) {
                        currentPartId = existing[0].id;
                    } else {
                        const { rows } = await db.query(
                            'INSERT INTO parts (reference, designation, stock_quantity, is_composed, min_stock, min_stock_foss, price, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
                            [cleanedRef, designation || '', 0, false, 0, 0, 0, '']
                        );
                        currentPartId = rows[0].id;
                    }
                }

                if (!currentPartId) continue; // Safety check

                await this.repo.addOrderItem(db, {
                    order_id: order.id,
                    part_id: currentPartId,
                    designation: designation || '',
                    quantity_ordered: quantity,
                    stock_type: stockType, // Use the original stockType from item
                    note: item.note // Added field
                });
                
                // Increment ordered_quantity on the part
                // Only StockType.FOSS goes to FOSS columns. Everything else (general, contract, msd) goes to standard columns.
                const stockTypeEnum = (stockType === StockType.FOSS) 
                    ? StockType.FOSS 
                    : StockType.GENERAL;
                    
                await inventoryService.updatePartOrderedQuantity(db, currentPartId, quantity, stockTypeEnum);
            }
            
            return order;
        });
    }

    async getOrders(filters: any) {
        return this.repo.getOrders(pool, filters);
    }

    async getOrderById(id: number) {
        const order = await this.repo.getOrderById(pool, id);
        if (!order) throw new NotFoundError('Encomenda não encontrada');
        return order;
    }

    async receiveItems(orderId: number, itemsReceived: { itemId: number, quantity: number }[], userId: string) {
        return withTransactionAs(userId, async (db) => {
            const order = await this.repo.getOrderById(db, orderId);
            if (!order) throw new NotFoundError('Encomenda não encontrada');
            
            for (const itemRec of itemsReceived) {
                const orderItem = order.items.find((i: any) => i.id === itemRec.itemId);
                if (!orderItem) continue;
                
                const qty = Number(itemRec.quantity);
                if (qty <= 0) continue;
                
                // Update quantity_received in parts_order_items
                await this.repo.updateOrderItemReceived(db, itemRec.itemId, qty);
                
                // Register movement in ledger (PURCHASE_ORDER)
                // This will automatically:
                // 1. Increment stock_quantity
                // 2. Decrement ordered_quantity (via our trigger)
                await inventoryService.updatePartStock(db, orderItem.part_id, {
                    quantity: qty,
                    fromOrder: true,
                    targetStock: (orderItem.stock_type === StockType.FOSS) ? StockType.FOSS : StockType.GENERAL,
                    notes: `Receção Encomenda #${order.document_number}`,
                    type: 'PURCHASE_ORDER',
                    reference_id: String(orderId)
                }, userId);
            }
            
            // Re-check status
            await this.syncOrderStatus(db, orderId);
            
            return this.repo.getOrderById(db, orderId);
        });
    }

    async revertReception(orderId: number, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const order = await this.repo.getOrderById(db, orderId);
            if (!order) throw new NotFoundError('Encomenda não encontrada');
            
            let revertedAny = false;

            for (const item of order.items) {
                if (item.quantity_received > 0) {
                    const qtyToRevert = item.quantity_received;
                    
                    // 1. Reset received quantity in parts_order_items
                    await this.repo.updateOrderItemReceived(db, item.id, -qtyToRevert);
                    
                    // 2. Abate from physical stock
                    await inventoryService.updatePartStock(db, item.part_id, {
                        quantity: -qtyToRevert,
                        fromOrder: false,
                        targetStock: (item.stock_type === StockType.FOSS) ? StockType.FOSS : StockType.GENERAL,
                        notes: `Reversão Receção Encomenda #${order.document_number}`,
                        type: 'MANUAL_ADJUST',
                        reference_id: String(orderId)
                    }, userId);
                    
                    // 3. Restore ordered quantity
                    const stockEnum = (item.stock_type === StockType.FOSS) ? StockType.FOSS : StockType.GENERAL;
                    await inventoryService.updatePartOrderedQuantity(db, item.part_id, qtyToRevert, stockEnum);

                    revertedAny = true;
                }
            }

            if (revertedAny) {
                await this.repo.updateOrderStatus(db, orderId, 'PENDING');
            }

            return this.repo.getOrderById(db, orderId);
        });
    }

    async addItemsToOrder(orderId: number, items: any[], userId: string) {
        return withTransactionAs(userId, async (db) => {
            const order = await this.repo.getOrderById(db, orderId);
            if (!order) throw new NotFoundError('Encomenda não encontrada');

            for (const item of items) {
                let { designation, reference, quantity, stockType } = item;
                let currentPartId = item.partId;

                if (reference) reference = reference.trim().replace(/\s+/g, ' ');
                if (designation) designation = designation.trim().replace(/\s+/g, ' ');

                if (!currentPartId && reference) {
                    const cleanedRef = reference.trim();
                    const { rows: existing } = await db.query('SELECT id FROM parts WHERE reference = $1 OR TRIM(reference) = $1', [cleanedRef]);
                    if (existing.length > 0) {
                        currentPartId = existing[0].id;
                    } else {
                        const { rows } = await db.query(
                            'INSERT INTO parts (reference, designation, stock_quantity, is_composed, min_stock, min_stock_foss, price, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
                            [cleanedRef, designation || '', 0, false, 0, 0, 0, '']
                        );
                        currentPartId = rows[0].id;
                    }
                }

                if (!currentPartId) continue; // Safety check

                await this.repo.addOrderItem(db, {
                    order_id: orderId,
                    part_id: currentPartId,
                    designation: designation || '',
                    quantity_ordered: quantity,
                    stock_type: stockType, // Use the original stockType
                    note: item.note // Added field
                });

                // Increment ordered_quantity on the part
                const stockTypeEnum = (stockType === StockType.FOSS) 
                    ? StockType.FOSS 
                    : StockType.GENERAL;
                    
                await inventoryService.updatePartOrderedQuantity(db, currentPartId, quantity, stockTypeEnum);
            }

            // Re-check status
            await this.syncOrderStatus(db, orderId);

            return this.repo.getOrderById(db, orderId);
        });
    }

    private async syncOrderStatus(db: any, orderId: number) {
        const updatedOrder = await this.repo.getOrderById(db, orderId);
        const allCompleted = updatedOrder.items.every((i: any) => i.quantity_received >= i.quantity_ordered);
        const someReceived = updatedOrder.items.some((i: any) => i.quantity_received > 0);

        let newStatus = 'PENDING';
        if (allCompleted) newStatus = 'COMPLETED';
        else if (someReceived) newStatus = 'PARTIAL';

        if (newStatus !== updatedOrder.status) {
            await this.repo.updateOrderStatus(db, orderId, newStatus);
        }
    }

    async deleteOrderItem(orderId: number, itemId: number, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const order = await this.repo.getOrderById(db, orderId);
            if (!order) throw new NotFoundError('Encomenda não encontrada');
            const item = order.items.find((i: any) => i.id === itemId);
            if (!item) throw new NotFoundError('Item de encomenda não encontrado');
            
            if (item.quantity_received > 0) {
                throw new BadRequestError('Não é possível apagar um item que já tenha peças recebidas');
            }

            // Restore ordered count on the physical part
            // Foss -> FOSS column. Everything else -> standard columns.
            const stockEnum = (item.stock_type === StockType.FOSS) ? StockType.FOSS : StockType.GENERAL;
            await inventoryService.updatePartOrderedQuantity(db, item.part_id, -item.quantity_ordered, stockEnum);
            
            // Delete the item
            await this.repo.deleteOrderItem(db, orderId, itemId);

            // Re-check status (e.g. if the removed item was the only non-received one, it should go to COMPLETED)
            await this.syncOrderStatus(db, orderId);
        });
    }

    async deleteOrder(orderId: number, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const order = await this.repo.getOrderById(db, orderId);
            if (!order) throw new NotFoundError('Encomenda não encontrada');
            
            const someReceived = order.items.some((i: any) => i.quantity_received > 0);
            if (someReceived) {
                throw new BadRequestError('Não é possível apagar uma encomenda que já tenha peças recebidas');
            }

            // Delete all items correctly abating stock
            for (const item of order.items) {
                const stockEnum = (item.stock_type === StockType.FOSS) ? StockType.FOSS : StockType.GENERAL;
                await inventoryService.updatePartOrderedQuantity(db, item.part_id, -item.quantity_ordered, stockEnum);
                await this.repo.deleteOrderItem(db, orderId, item.id);
            }

            await this.repo.deleteOrder(db, orderId);
        });
    }
}

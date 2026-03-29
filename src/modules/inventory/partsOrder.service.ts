import { pool, withTransactionAs } from '../../config/db';
import { PartsOrderRepository } from './partsOrder.repository';
import * as inventoryService from '../../services/inventoryService';
import { StockType } from '../../constants/enums';
import { NotFoundError } from '../../utils/ApiError';

export class PartsOrderService {
    constructor(private repo: PartsOrderRepository) {}

    async createOrder(data: any, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const { document_number, notes, items } = data;
            const order = await this.repo.createOrder(db, { document_number, user_id: userId, notes });
            
            for (const item of items) {
                const { partId, designation, quantity, stockType } = item;
                await this.repo.addOrderItem(db, {
                    order_id: order.id,
                    part_id: partId,
                    designation,
                    quantity_ordered: quantity,
                    stock_type: stockType === 'contract' ? 'contract' : 'general'
                });
                
                // Increment ordered_quantity on the part
                const stockTypeEnum = (stockType === 'contract' || stockType === StockType.FOSS || stockType === StockType.CONTRACT) 
                    ? StockType.FOSS 
                    : StockType.GENERAL;
                    
                await inventoryService.updatePartOrderedQuantity(db, partId, quantity, stockTypeEnum);
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
                    targetStock: (orderItem.stock_type === 'contract' || orderItem.stock_type === StockType.FOSS) ? StockType.FOSS : StockType.GENERAL,
                    notes: `Receção Encomenda #${order.document_number}`,
                    type: 'PURCHASE_ORDER',
                    reference_id: String(orderId)
                }, userId);
            }
            
            // Check if order is fully completed
            const updatedOrder = await this.repo.getOrderById(db, orderId);
            const allCompleted = updatedOrder.items.every((i: any) => i.quantity_received >= i.quantity_ordered);
            const someReceived = updatedOrder.items.some((i: any) => i.quantity_received > 0);
            
            let newStatus = 'PENDING';
            if (allCompleted) newStatus = 'COMPLETED';
            else if (someReceived) newStatus = 'PARTIAL';
            
            if (newStatus !== order.status) {
                await this.repo.updateOrderStatus(db, orderId, newStatus);
            }
            
            return this.repo.getOrderById(db, orderId);
        });
    }
}

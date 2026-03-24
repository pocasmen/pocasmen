import { QueryRunner } from '../../types/db.types';
import { ParsedInvoice, ParsedInvoiceItem } from '../../utils/pdfParser';

export class InvoiceRepository {
  async listInvoices(db: QueryRunner) {
    const { rows } = await db.query(`
      SELECT 
        i.*,
        (SELECT json_agg(it) FROM invoice_items it WHERE it.invoice_id = i.id) as items
      FROM invoices i
      ORDER BY i.created_at DESC
    `);
    return rows;
  }

  async saveInvoice(db: QueryRunner, data: ParsedInvoice, fileUrl: string) {
    // 1. Upsert the invoice record
    const { rows: [invoice] } = await db.query(`
      INSERT INTO invoices (
        invoice_number, customer_name, customer_nif, vendor, 
        issue_date, due_date, reference, incidence, 
        vat_total, total_value, file_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (invoice_number) DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        customer_nif = EXCLUDED.customer_nif,
        vendor = EXCLUDED.vendor,
        issue_date = EXCLUDED.issue_date,
        due_date = EXCLUDED.due_date,
        reference = EXCLUDED.reference,
        incidence = EXCLUDED.incidence,
        vat_total = EXCLUDED.vat_total,
        total_value = EXCLUDED.total_value,
        file_url = EXCLUDED.file_url
      RETURNING id
    `, [
      data.invoiceNumber, data.customerName, data.customerNif, data.vendor,
      data.issueDate, data.dueDate, data.reference, data.incidence,
      data.vatTotal, data.totalValue, fileUrl
    ]);

    const invoiceId = invoice.id;

    // 2. Clear previous items to avoid duplicates if reprocessing
    await db.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);

    // 3. Insert new items
    for (const item of data.items) {
      await db.query(`
        INSERT INTO invoice_items (
          invoice_id, code, description, quantity, unit_price, total_price
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        invoiceId, item.code, item.description, item.quantity, 
        item.unitPrice, item.totalPrice
      ]);
    }

    return invoiceId;
  }
}

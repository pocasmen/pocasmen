import { InvoiceRepository } from './invoice.repository';
import { pool } from '../../config/db';
import { parseMicroAtomoInvoice } from '../../utils/pdfParser';
import { supabase } from '../../config/supabase';

export class InvoiceService {
  constructor(private repo: InvoiceRepository) {}

  async uploadAndParseInvoice(file: Express.Multer.File, userId: string) {
    try {
      console.log('>>> [STEP 1] Uploading to Supabase...');
      const fileName = `${Date.now()}_${file.originalname}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(fileName, file.buffer, { contentType: 'application/pdf' });

      if (uploadError) throw new Error(`Supabase error: ${uploadError.message}`);
      const { data: { publicUrl } } = supabase.storage.from('invoices').getPublicUrl(uploadData.path);
      console.log('>>> [STEP 1] SUCCESS. URL:', publicUrl);

      console.log('>>> [STEP 2] Parsing PDF...');
      const parsedData = await parseMicroAtomoInvoice(file.buffer);
      console.log('>>> [STEP 2] PARSING SUCCESS. Invoice #:', parsedData.invoiceNumber);

      console.log('>>> [STEP 3] Saving to Database...');
      const client = await pool.connect();
      try {
        const id = await this.repo.saveInvoice(client, parsedData, publicUrl);
        console.log('>>> [STEP 3] DB SUCCESS. ID:', id);
      } catch (dbErr: any) {
        console.error('>>> [STEP 3] DB FAILED:', dbErr.message);
        throw dbErr;
      } finally {
        client.release();
      }

      return parsedData;
    } catch (err: any) {
      console.error('!!! [UPLOAD FAILED] !!!');
      console.error(err);
      throw err;
    }
  }

  async list() {
    const client = await pool.connect();
    try {
      return await this.repo.listInvoices(client);
    } finally {
      client.release();
    }
  }
}

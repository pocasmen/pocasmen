import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Pool } from 'pg';

// --- INTERFACES ---
interface Client {
  id: number;
  name: string;
  address: string;
  nif: string;
}

interface Equipment {
  id: number;
  brand: string;
  model: string;
  serialNumber: string;
  clientId: number; // Campo adicionado
}

interface Report {
  id: number;
  clientId: number;
  equipmentId: number;
  serviceDate: string;
  hours: number;
  parts: string;
  description: string;
  serviceType: 'manutencao' | 'reparacao' | 'assistencia' | 'instalacao'; // Campo adicionado
}

interface Technician {
  id: number;
  name: string;
}

interface Schedule {
  id: number;
  clientId: number;
  equipmentId: number;
  technicianId: number;
  startDate: string;
  endDate: string;
  title: string;
}

// --- CONFIGURAÇÃO DA APP E BASE DE DADOS ---
const app = express();
const port = 5000;

const pool = new Pool({
  connectionString: 'postgresql://postgres.uygvqanyuigpvsoekxpw:sofia123ramos@aws-1-eu-north-1.pooler.supabase.com:6543/postgres',
});

app.use(cors());
app.use(bodyParser.json());

// --- ENDPOINTS ---

app.get('/', (req, res) => {
  res.send('Servidor a postos e conectado à base de dados Supabase!');
});

// Endpoints de Clientes
app.get('/clients', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/clients', async (req, res) => {
  try {
    const { name, address, nif } = req.body as Client;
    const result = await pool.query(
      'INSERT INTO clients (name, address, nif) VALUES ($1, $2, $3) RETURNING *',
      [name, address, nif]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/clients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address, nif } = req.body as Client;
        const result = await pool.query(
            'UPDATE clients SET name = $1, address = $2, nif = $3 WHERE id = $4 RETURNING *',
            [name, address, nif, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/clients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM clients WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Endpoints de Equipamentos
app.get('/equipments', async (req, res) => {
  try {
    // Query melhorada para incluir o nome do cliente
    const query = `
      SELECT e.*, c.name as "clientName"
      FROM equipments e
      JOIN clients c ON e."clientId" = c.id
      ORDER BY e.id DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/equipments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM equipments WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint para obter equipamentos de um cliente específico
app.get('/equipments/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const result = await pool.query('SELECT * FROM equipments WHERE "clientId" = $1 ORDER BY id DESC', [clientId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/equipments', async (req, res) => {
  try {
    const { brand, model, serialNumber, clientId } = req.body as Equipment;
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }
    const result = await pool.query(
      'INSERT INTO equipments (brand, model, "serialNumber", "clientId") VALUES ($1, $2, $3, $4) RETURNING *',
      [brand, model, serialNumber, clientId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoints de Técnicos
app.get('/technicians', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM technicians ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/technicians', async (req, res) => {
  try {
    const { name } = req.body as Technician;
    const result = await pool.query(
      'INSERT INTO technicians (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoints de Relatórios
app.get('/reports', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reports ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM reports WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint para obter um relatório específico com detalhes
app.get('/report/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT
        r.*,
        c.name as "clientName",
        c.address as "clientAddress",
        c.nif as "clientNif",
        e.brand as "equipmentBrand",
        e.model as "equipmentModel",
        e."serialNumber" as "equipmentSerialNumber"
      FROM reports r
      LEFT JOIN clients c ON r."clientId" = c.id
      LEFT JOIN equipments e ON r."equipmentId" = e.id
      WHERE r.id = $1
    `;
    const result = await pool.query(query, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoints de Agendamentos
app.get('/schedules', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM schedules');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/schedules', async (req, res) => {
  try {
    const { title, startDate, endDate, clientId, equipmentId, technicianId } = req.body as Schedule;
    const result = await pool.query(
      'INSERT INTO schedules (title, "startDate", "endDate", "clientId", "equipmentId", "technicianId") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, startDate, endDate, clientId, equipmentId, technicianId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint de Debug para listar todas as rotas (manual)
app.get('/debug/routes', (req, res) => {
  const routes: any[] = [];
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) { // Rotas diretas
      routes.push({
        path: middleware.route.path,
        method: Object.keys(middleware.route.methods)[0].toUpperCase()
      });
    } else if (middleware.name === 'router') { // Sub-routers
      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            method: Object.keys(handler.route.methods)[0].toUpperCase()
          });
        }
      });
    }
  });
  res.json(routes);
});


// --- INICIAR SERVIDOR ---
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
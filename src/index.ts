import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Pool } from 'pg';

console.log('Início da inicialização do servidor.');

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
console.log('Express app inicializada.');
const port = 5000;

const pool = new Pool({
  connectionString: 'postgresql://postgres.uygvqanyuigpvsoekxpw:sofia123ramos@aws-1-eu-north-1.pooler.supabase.com:6543/postgres',
});
console.log('Pool de base de dados configurado.');

// Configuração CORS explícita
app.use(cors({
  origin: 'https://statuesque-basbousa-e85493.netlify.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(bodyParser.json());
console.log('Middleware CORS e BodyParser aplicados.');

// --- ENDPOINTS ---

// Rota de teste simples
app.get('/health', (req, res) => {
  res.send('OK');
  console.log('Rota /health acedida.');
});
console.log('Rota /health registada.');

app.get('/', (req, res) => {
  res.send('Servidor a postos e conectado à base de dados Supabase!');
  console.log('Rota / acedida.');
});
console.log('Rota / registada.');

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
console.log('Rotas de Clientes registadas.');

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
console.log('Rotas de Equipamentos registadas.');

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
console.log('Rotas de Técnicos registadas.');

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
console.log('Rotas de Relatórios registadas.');

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
console.log('Rotas de Agendamentos registadas.');

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

// Endpoint para ATUALIZAR um agendamento
app.put('/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, startDate, endDate, clientId, equipmentId, technicianId } = req.body as Schedule;
    const result = await pool.query(
      'UPDATE schedules SET title = $1, "startDate" = $2, "endDate" = $3, "clientId" = $4, "equipmentId" = $5, "technicianId" = $6 WHERE id = $7 RETURNING *',
      [title, startDate, endDate, clientId, equipmentId, technicianId, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint para ELIMINAR um agendamento
app.delete('/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM schedules WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    res.status(204).send(); // 204 No Content para sucesso na eliminação
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// --- INICIAR SERVIDOR ---
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

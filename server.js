const express = require('express');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const projectRoot = __dirname;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contas (
      id TEXT PRIMARY KEY,
      titulo TEXT,
      tipo TEXT,
      centro TEXT,
      tipoDespesa TEXT,
      subtipo TEXT,
      valor REAL,
      data TEXT,
      pago BOOLEAN,
      obs TEXT,
      atualizadoEm TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS categorias (
      grupo TEXT,
      valor TEXT,
      PRIMARY KEY (grupo, valor)
    )
  `);
}

async function getCategoriasFromDb() {
  const { rows } = await pool.query('SELECT grupo, valor FROM categorias ORDER BY grupo, valor');

  const estrutura = { centros: [], tipos: [], subtipos: [] };
  rows.forEach((row) => {
    if (row.grupo === 'centros') estrutura.centros.push(row.valor);
    if (row.grupo === 'tipos') estrutura.tipos.push(row.valor);
    if (row.grupo === 'subtipos') estrutura.subtipos.push(row.valor);
  });

  return estrutura;
}

async function getContasFromDb() {
  const { rows } = await pool.query(
    `SELECT id, titulo, tipo, centro, tipoDespesa, subtipo, valor, data, pago, obs, atualizadoEm
     FROM contas ORDER BY data DESC, atualizadoEm DESC`
  );

  return rows.map((row) => ({
    id: row.id,
    titulo: row.titulo,
    tipo: row.tipo,
    centro: row.centro,
    tipoDespesa: row.tipoDespesa,
    subtipo: row.subtipo,
    valor: Number(row.valor || 0),
    data: row.data,
    pago: Boolean(row.pago),
    obs: row.obs,
    atualizadoEm: row.atualizadoEm
  }));
}

app.use(express.json());
app.use(express.static(projectRoot));

app.get('/api/categorias', async (req, res) => {
  try {
    const categorias = await getCategoriasFromDb();
    res.json(categorias);
  } catch (error) {
    console.error('Erro ao carregar categorias:', error);
    res.status(500).json({ error: 'Erro ao carregar categorias' });
  }
});

app.post('/api/categorias', async (req, res) => {
  const { grupo, valor } = req.body || {};
  if (!grupo || !valor || !String(valor).trim()) {
    return res.status(400).json({ error: 'Grupo e valor são obrigatórios' });
  }

  try {
    await pool.query(
      'INSERT INTO categorias (grupo, valor) VALUES ($1, $2) ON CONFLICT (grupo, valor) DO NOTHING',
      [grupo, String(valor).trim()]
    );

    const categorias = await getCategoriasFromDb();
    res.json(categorias);
  } catch (error) {
    console.error('Erro ao inserir categoria:', error);
    res.status(500).json({ error: 'Erro ao inserir categoria' });
  }
});

app.delete('/api/categorias', async (req, res) => {
  const { grupo, valor } = req.body || {};
  if (!grupo || !valor || !String(valor).trim()) {
    return res.status(400).json({ error: 'Grupo e valor são obrigatórios' });
  }

  try {
    await pool.query('DELETE FROM categorias WHERE grupo = $1 AND valor = $2', [grupo, String(valor).trim()]);
    const categorias = await getCategoriasFromDb();
    res.json(categorias);
  } catch (error) {
    console.error('Erro ao remover categoria:', error);
    res.status(500).json({ error: 'Erro ao remover categoria' });
  }
});

app.get('/api/contas', async (req, res) => {
  try {
    const contas = await getContasFromDb();
    res.json(contas);
  } catch (error) {
    console.error('Erro ao carregar contas:', error);
    res.status(500).json({ error: 'Erro ao carregar contas' });
  }
});

app.post('/api/contas', async (req, res) => {
  const conta = req.body;
  if (!conta || !conta.id) {
    return res.status(400).json({ error: 'Dados da conta inválidos' });
  }

  const payload = {
    id: conta.id,
    titulo: conta.titulo || '',
    tipo: conta.tipo || 'P',
    centro: conta.centro || '',
    tipoDespesa: conta.tipoDespesa || '',
    subtipo: conta.subtipo || '',
    valor: Number(conta.valor || 0),
    data: conta.data || '',
    pago: !!conta.pago,
    obs: conta.obs || '',
    atualizadoEm: conta.atualizadoEm || new Date().toISOString()
  };

  try {
    await pool.query(
      `INSERT INTO contas (id, titulo, tipo, centro, tipoDespesa, subtipo, valor, data, pago, obs, atualizadoEm)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         titulo = EXCLUDED.titulo,
         tipo = EXCLUDED.tipo,
         centro = EXCLUDED.centro,
         tipoDespesa = EXCLUDED.tipoDespesa,
         subtipo = EXCLUDED.subtipo,
         valor = EXCLUDED.valor,
         data = EXCLUDED.data,
         pago = EXCLUDED.pago,
         obs = EXCLUDED.obs,
         atualizadoEm = EXCLUDED.atualizadoEm`,
      [
        payload.id,
        payload.titulo,
        payload.tipo,
        payload.centro,
        payload.tipoDespesa,
        payload.subtipo,
        payload.valor,
        payload.data,
        payload.pago,
        payload.obs,
        payload.atualizadoEm
      ]
    );

    const contas = await getContasFromDb();
    res.json(contas);
  } catch (error) {
    console.error('Erro ao salvar conta:', error);
    res.status(500).json({ error: 'Erro ao salvar conta' });
  }
});

app.put('/api/contas/:id', async (req, res) => {
  const conta = req.body;
  if (!conta) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  try {
    await pool.query(
      `UPDATE contas SET
         titulo = $1,
         tipo = $2,
         centro = $3,
         tipoDespesa = $4,
         subtipo = $5,
         valor = $6,
         data = $7,
         pago = $8,
         obs = $9,
         atualizadoEm = $10
       WHERE id = $11`,
      [
        conta.titulo || '',
        conta.tipo || 'P',
        conta.centro || '',
        conta.tipoDespesa || '',
        conta.subtipo || '',
        Number(conta.valor || 0),
        conta.data || '',
        !!conta.pago,
        conta.obs || '',
        conta.atualizadoEm || new Date().toISOString(),
        req.params.id
      ]
    );

    const contas = await getContasFromDb();
    res.json(contas);
  } catch (error) {
    console.error('Erro ao atualizar conta:', error);
    res.status(500).json({ error: 'Erro ao atualizar conta' });
  }
});

app.delete('/api/contas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM contas WHERE id = $1', [req.params.id]);
    const contas = await getContasFromDb();
    res.json(contas);
  } catch (error) {
    console.error('Erro ao excluir conta:', error);
    res.status(500).json({ error: 'Erro ao excluir conta' });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, db: process.env.DATABASE_URL ? 'postgres' : 'not-configured' });
});

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL não configurada. Defina a variável de ambiente antes de subir o app.');
}

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
      console.log('PostgreSQL conectado via DATABASE_URL');
    });
  })
  .catch((error) => {
    console.error('Erro ao conectar com o PostgreSQL:', error);
    process.exit(1);
  });

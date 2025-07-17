import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
dotenv.config();

const { Pool } = pkg;
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : undefined,
});

// Table creation automatique (optionnel)
async function initTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sprints (
      id SERIAL PRIMARY KEY,
      team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
      name TEXT,
      capacity INTEGER,
      done INTEGER
    );
  `);
}
initTables();

// --- ROUTES ---

// Teams
app.get('/api/teams', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM teams ORDER BY name');
  res.json(rows);
});
app.post('/api/teams', async (req, res) => {
  const { name } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO teams(name) VALUES($1) RETURNING *', [name]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.delete('/api/teams/:id', async (req, res) => {
  await pool.query('DELETE FROM teams WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// Sprints
app.get('/api/sprints/:team_id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM sprints WHERE team_id=$1 ORDER BY id', [req.params.team_id]
  );
  res.json(rows);
});
app.post('/api/sprints', async (req, res) => {
  const { team_id, name, capacity, done } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO sprints(team_id, name, capacity, done) VALUES($1,$2,$3,$4) RETURNING *',
    [team_id, name, capacity, done]
  );
  res.json(rows[0]);
});
app.delete('/api/sprints/:id', async (req, res) => {
  await pool.query('DELETE FROM sprints WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});
app.delete('/api/sprints/team/:team_id', async (req, res) => {
  await pool.query('DELETE FROM sprints WHERE team_id=$1', [req.params.team_id]);
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});

// --- CAPACITIES ---
// Liste des capacities d'une équipe (tous sprints)
app.get('/api/capacities/:team_id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM capacities WHERE team_id=$1 ORDER BY date_calculated DESC`, [req.params.team_id]
  );
  res.json(rows);
});

// Récupère une capacité pour une équipe et un sprint précis
app.get('/api/capacity/:team_id/:sprint_id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM capacities WHERE team_id=$1 AND sprint_id=$2`, [req.params.team_id, req.params.sprint_id]
  );
  res.json(rows[0] || null);
});

// Crée ou MAJ la capacité d'une équipe pour un sprint (upsert simple)
app.post('/api/capacity', async (req, res) => {
  const { team_id, sprint_id, days_sprint, percent_run } = req.body;
  // Vérifie si la capacité existe déjà
  const { rows: exist } = await pool.query(
    `SELECT * FROM capacities WHERE team_id=$1 AND sprint_id=$2`, [team_id, sprint_id]
  );
  let cap;
  if (exist.length > 0) {
    // Update
    const { rows } = await pool.query(
      `UPDATE capacities SET days_sprint=$1, percent_run=$2, date_calculated=NOW()
       WHERE id=$3 RETURNING *`,
      [days_sprint, percent_run, exist[0].id]
    );
    cap = rows[0];
  } else {
    // Insert
    const { rows } = await pool.query(
      `INSERT INTO capacities (team_id, sprint_id, days_sprint, percent_run)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [team_id, sprint_id, days_sprint, percent_run]
    );
    cap = rows[0];
  }
  res.json(cap);
});

// --- CAPACITY ROLES ---
// Liste des rôles pour une capacité
app.get('/api/capacity_roles/:capacity_id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM capacity_roles WHERE capacity_id=$1`, [req.params.capacity_id]
  );
  res.json(rows);
});

// Ajout ou mise à jour d'un rôle (si id fourni, fait update)
app.post('/api/capacity_role', async (req, res) => {
  const { id, capacity_id, role, nbr_personnes, jours_absence } = req.body;
  if (id) {
    const { rows } = await pool.query(
      `UPDATE capacity_roles SET role=$1, nbr_personnes=$2, jours_absence=$3 WHERE id=$4 RETURNING *`,
      [role, nbr_personnes, jours_absence, id]
    );
    res.json(rows[0]);
  } else {
    const { rows } = await pool.query(
      `INSERT INTO capacity_roles (capacity_id, role, nbr_personnes, jours_absence)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [capacity_id, role, nbr_personnes, jours_absence]
    );
    res.json(rows[0]);
  }
});

// Suppression d'un rôle
app.delete('/api/capacity_role/:id', async (req, res) => {
  await pool.query('DELETE FROM capacity_roles WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});


async function initCapacityTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS capacities (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      sprint_id INTEGER NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
      days_sprint INTEGER NOT NULL,
      percent_run NUMERIC(5,2) DEFAULT 100,
      date_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS capacity_roles (
      id SERIAL PRIMARY KEY,
      capacity_id INTEGER NOT NULL REFERENCES capacities(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      nbr_personnes INTEGER NOT NULL,
      jours_absence NUMERIC(5,2) DEFAULT 0
    );
  `);
}
initCapacityTables();


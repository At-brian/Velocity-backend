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

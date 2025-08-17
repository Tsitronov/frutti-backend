const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); 
const bcrypt = require('bcrypt');
require('dotenv').config();

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  }
});

// ✅ Funzione per creare le tabelle (PostgreSQL style)
async function createTables() {
  try {
    await db.query(`ALTER TABLE utenti RENAME COLUMN accessori TO dentiera;`);
    await db.query(`ALTER TABLE utenti RENAME COLUMN vestiti TO malattia;`);
    console.log('✅ Tabella utenti aggiornata');
  } catch (err) {
    console.error('❌ Errore nella creazione delle tabelle:', err);
  }
}

createTables();


async function inserisciUtente() {
  const username = 'squadra';
  const plainPassword = 'perlavoro25';
  const hashedPassword = await bcrypt.hash(plainPassword, 10);
  const categoria = '1';

  try {
    const result = await db.query(
      'INSERT INTO password (username, password, categoria) VALUES ($1, $2, $3) RETURNING *',
      [username, hashedPassword, categoria]
    );
    console.log('✅ Utente inserito:', result.rows[0]);
  } catch (err) {
    console.error('❌ Errore inserimento:', err);
  } 
}

inserisciUtente();



// Test connection and show detailed info
db.connect()
  .then(client => {
    console.log("✅ PostgreSQL connected successfully");
    client.release();
    
    // Test a simple query
    return db.query('SELECT NOW() as current_time');
  })
  .then(result => {
    console.log("✅ Database query test successful:", result.rows[0]);
  })
  .catch(err => {
    console.error("❌ Database connection/query error:", err);
  });


const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await db.query('SELECT * FROM password WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Utente non trovato' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    
    if (!valid) {
      return res.status(401).json({ error: 'Password errata' });
    }

    res.json({ message: 'Login riuscito' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore db' });
  }
});

app.get('/api/frutti', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM frutti');
    res.json(result.rows);
  } catch (error) {
    console.error('Database error in /api/frutti:', error);
    res.status(500).json({ error: 'Errore nel server' });
  }
});


app.post('/api/frutti', async (req, res) => {
  const { nome, descrizione, categoria } = req.body;

  try {
    const result = await db.query(
      'INSERT INTO frutti (nome, descrizione, categoria) VALUES ($1, $2, $3) RETURNING *',
      [nome, descrizione, categoria]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Errore scrittura frutto:', err);
    res.status(500).json({ error: 'Errore scrittura frutto', details: err.message });
  }
});

app.put('/api/frutti/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { nome, descrizione, categoria } = req.body;

  try {
    const result = await db.query(
      'UPDATE frutti SET nome = $1, descrizione = $2, categoria = $3 WHERE id = $4 RETURNING *',
      [nome, descrizione, categoria, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Frutto non trovato' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Errore aggiornamento frutto:', err);
    res.status(500).json({ error: 'Errore aggiornamento frutto', details: err.message });
  }
});

app.delete('/api/frutti/:id', async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const result = await db.query('DELETE FROM frutti WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Frutto non trovato' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Errore cancellazione frutto:', err);
    res.status(500).json({ error: 'Errore cancellazione frutto', details: err.message });
  }
});

app.get('/api/utenti', async (req, res) => {
  console.log("👥 GET /api/utenti - Attempting to fetch utenti...");

  try {
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'utenti'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      return res.status(500).json({
        error: 'Tabella utenti non esiste',
        suggestion: 'Creare la tabella utenti nel database'
      });
    }

    const result = await db.query('SELECT * FROM utenti');
    console.log("✅ Query utenti completata:", result.rows.length, "record");
    res.json(result.rows);

  } catch (err) {
    console.error("❌ Database error in /api/utenti:", err);
    res.status(500).json({
      error: 'Errore lettura utenti',
      details: err.message,
      code: err.code
    });
  }
});

app.post('/api/utenti', async (req, res) => {
  const nuovo = req.body;

  try {
    const result = await db.query(
      'INSERT INTO utenti (reparto, stanza, cognome, bagno, barba, autonomia, malattia, alimentazione, dentiera, altro) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [
        nuovo.reparto,
        nuovo.stanza,
        nuovo.cognome,
        nuovo.bagno,
        nuovo.barba,
        nuovo.autonomia,
        nuovo.malattia,
        nuovo.alimentazione,
        nuovo.dentiera,
        nuovo.altro,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Errore inserimento utente:', err);
    res.status(500).json({ error: 'Errore inserimento utente', details: err.message });
  }
});

app.put('/api/utenti/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const modifiche = req.body;

  try {
    const result = await db.query(
      'UPDATE utenti SET reparto = $1, stanza = $2, cognome = $3, bagno = $4, barba = $5, autonomia = $6, malattia = $7, alimentazione = $8, dentiera = $9, altro = $10 WHERE id = $11 RETURNING *',
      [
        modifiche.reparto,
        modifiche.stanza,
        modifiche.cognome,
        modifiche.bagno,
        modifiche.barba,
        modifiche.autonomia,
        modifiche.malattia,
        modifiche.alimentazione,
        modifiche.dentiera,
        modifiche.altro,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Errore aggiornamento utente:', err);
    res.status(500).json({ error: 'Errore aggiornamento utente', details: err.message });
  }
});

app.delete('/api/utenti/:id', async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const result = await db.query('DELETE FROM utenti WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Errore cancellazione utente:', err);
    res.status(500).json({ error: 'Errore cancellazione utente', details: err.message });
  }
});
app.listen(PORT, () => {
  console.log(`✅ Server avviato su http://localhost:${PORT}`);
});

module.exports = app;
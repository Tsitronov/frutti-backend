const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

// ✅ Funzione per creare le tabelle (PostgreSQL style)
async function createTables() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS utenti (
        id SERIAL PRIMARY KEY,
        reparto VARCHAR(50),
        stanza VARCHAR(50),
        cognome VARCHAR(100),
        bagno VARCHAR(50),
        barba VARCHAR(50),
        autonomia VARCHAR(50),
        malattia TEXT,
        alimentazione VARCHAR(50),
        dentiera VARCHAR(10),
        altro TEXT
      );
    `);
    console.log('✅ Tabella utenti pronta');

    await db.query(`
      CREATE TABLE IF NOT EXISTS password (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50),
        password VARCHAR(255),
        categoria VARCHAR(50) DEFAULT '2'
      );
    `);
    console.log('✅ Tabella password pronta');

    await db.query(`
      CREATE TABLE IF NOT EXISTS frutti (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(50),
        categoria VARCHAR(50),
        descrizione TEXT
      );
    `);
    console.log('✅ Tabella frutti pronta');
  } catch (err) {
    console.error('❌ Errore nella creazione delle tabelle:', err);
  }
}

createTables();


async function inserisciUtente() {
  const username = 'admin';
  const plainPassword = '12345';
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
  } finally {
    db.end();
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

const bcrypt = require('bcrypt');
require('dotenv').config();

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
    res.status(500).json({ error: 'Errore DB' });
  }
});

app.get('/api/frutti', async (req, res) => {
  console.log("📋 GET /api/frutti - Attempting to fetch frutti...");
  
  try {
    // Check if table exists first
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'frutti'
      );
    `);
    
    console.log("Table 'frutti' exists:", tableCheck.rows[0].exists);
    
    if (!tableCheck.rows[0].exists) {
      return res.status(500).json({ 
        error: 'Tabella frutti non esiste',
        suggestion: 'Creare la tabella frutti nel database'
      });
    }
    
    const result = await db.query('SELECT * FROM frutti');
    console.log("✅ Query successful, found", result.rows.length, "records");
    res.json(result.rows);
    
  } catch (err) {
    console.error("❌ Database error in /api/frutti:", err);
    res.status(500).json({ 
      error: 'Errore lettura DB',
      details: err.message,
      code: err.code 
    });
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
    console.error(err);
    res.status(500).json({ error: 'Errore scrittura DB' });
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
      return res.status(404).json({ error: 'Elemento non trovato' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento' });
  }
});

app.delete('/api/frutti/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  
  try {
    const result = await db.query('DELETE FROM frutti WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Elemento non trovato' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore cancellazione' });
  }
});

app.get('/api/utenti', async (req, res) => {
  console.log("👥 GET /api/utenti - Attempting to fetch utenti...");
  
  try {
    // Check if table exists first
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'utenti'
      );
    `);
    
    console.log("Table 'utenti' exists:", tableCheck.rows[0].exists);
    
    if (!tableCheck.rows[0].exists) {
      return res.status(500).json({ 
        error: 'Tabella utenti non esiste',
        suggestion: 'Creare la tabella utenti nel database'
      });
    }
    
    const result = await db.query('SELECT * FROM utenti');
    console.log("✅ Query successful, found", result.rows.length, "records");
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
    console.error(err);
    res.status(500).json({ error: 'Errore inserimento' });
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
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento' });
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
    console.error(err);
    res.status(500).json({ error: 'Errore cancellazione' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server avviato su http://localhost:${PORT}`);
});

module.exports = app;
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

// 🔌 Подключение к PostgreSQL (Render)
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// ====================== CREATE TABLES ======================
async function createTables() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS passwordDemo (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        categoria VARCHAR(100)
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS utentiDemo (
        id SERIAL PRIMARY KEY,
        reparto VARCHAR(100),
        stanza VARCHAR(50),
        cognome VARCHAR(255),
        bagno VARCHAR(255),
        barba VARCHAR(255),
        autonomia VARCHAR(255),
        vestiti VARCHAR(255),
        alimentazione VARCHAR(100),
        accessori VARCHAR(255),
        altro TEXT
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS fruttiDemo (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255),
        descrizione TEXT,
        categoria VARCHAR(255)
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS appuntiDemo (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255),
        categoria VARCHAR(255),
        descrizione TEXT
      );
    `);

    console.log("✅ Tutte le tabelle demo pronte!");
  } catch (err) {
    console.error("❌ Errore nella creazione delle tabelle:", err);
  }
}

// ====================== DEMO DATA ======================
async function inserisciDemoDati() {
  try {
    // Admin demo
    const adminCheck = await db.query("SELECT * FROM passwordDemo");
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash("22121971Ts+", 10);
      await db.query(
        "INSERT INTO passwordDemo (username, password, categoria) VALUES ($1,$2,$3)",
        ["evgenii", hashedPassword, "3"]
      );
      console.log("✅ Admin demo inserito");
    }

    // Utenti demo
    const utentiCheck = await db.query("SELECT * FROM utentiDemo");
    if (utentiCheck.rows.length === 0) {
      await db.query(`
        INSERT INTO utentiDemo (reparto, stanza, cognome, bagno, barba, autonomia, vestiti, alimentazione, accessori, altro)
        VALUES 
        ('A', '101', 'Rossi', 'assistito', 'quotidiana', 'parziale', 'assistito', 'mista', 'occhiali', 'note generali'),
        ('B', '202', 'Bianchi', 'autonomo', 'saltuario', 'completa', 'autonomo', 'vegetariana', 'dentiera', 'nessun problema');
      `);
      console.log("✅ Utenti demo inseriti");
    }

    // Frutti demo
    const fruttiCheck = await db.query("SELECT * FROM fruttiDemo");
    if (fruttiCheck.rows.length === 0) {
      await db.query(`
        INSERT INTO fruttiDemo (nome, descrizione, categoria)
        VALUES 
        ('Mela', 'Frutto rosso dolce', 'cibo'),
        ('Banana', 'Frutto giallo ricco di potassio', 'cibo'),
        ('Arancia', 'Frutto agrumato ricco di vitamina C', 'cibo');
      `);
      console.log("✅ Frutti demo inseriti");
    }

    // Appunti demo
    const appuntiCheck = await db.query("SELECT * FROM appuntiDemo");
    if (appuntiCheck.rows.length === 0) {
      await db.query(`
        INSERT INTO appuntiDemo (nome, categoria, descrizione)
        VALUES 
        ('Nota 1', 'lavoro', 'Preparare documenti per riunione'),
        ('Nota 2', 'personale', 'Comprare frutta e verdura'),
        ('Nota 3', 'studio', 'Ripassare capitolo 5 React');
      `);
      console.log("✅ Appunti demo inseriti");
    }
  } catch (err) {
    console.error("❌ Errore inserimento dati demo:", err);
  }
}

// ====================== LOGINDemo ======================
app.post("/api/loginDemo", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query("SELECT * FROM passwordDemo WHERE username = $1", [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: "Utente non trovato" });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Password errata" });

    res.json({
      message: "Login riuscito",
      categoria: String(user.categoria),
    });
  } catch (err) {
    console.error("Errore login:", err);
    res.status(500).json({ error: "Errore DB" });
  }
});

// ====================== ADMIN ======================
app.get("/api/adminDemo", async (req, res) => {
  try {
    const results = await db.query("SELECT id, username, categoria FROM passwordDemo");
    res.json(results.rows);
  } catch (err) {
    res.status(500).json({ error: "Errore lettura DB", details: err.message });
  }
});

app.post("/api/adminDemo", async (req, res) => {
  const { username, password, categoria } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      "INSERT INTO passwordDemo (username, password, categoria) VALUES ($1, $2, $3) RETURNING *",
      [username, hashedPassword, categoria]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore scrittura DB", details: err.message });
  }
});

app.put("/api/adminDemo/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { username, categoria } = req.body;
  try {
    const result = await db.query(
      "UPDATE passwordDemo SET username = $1, categoria = $2 WHERE id = $3 RETURNING *",
      [username, categoria, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Elemento non trovato" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore aggiornamento", details: err.message });
  }
});

app.delete("/api/adminDemo/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const result = await db.query("DELETE FROM passwordDemo WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Elemento non trovato" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Errore cancellazione", details: err.message });
  }
});

// ====================== UTENTI ======================
app.get("/api/utentiDemo", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM utentiDemo ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Errore lettura utenti" });
  }
});

app.post("/api/utentiDemo", async (req, res) => {
  const { reparto, stanza, cognome, bagno, barba, autonomia, vestiti, alimentazione, accessori, altro } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO utentiDemo (reparto, stanza, cognome, bagno, barba, autonomia, vestiti, alimentazione, accessori, altro)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [reparto, stanza, cognome, bagno, barba, autonomia, vestiti, alimentazione, accessori, altro]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore scrittura utenti" });
  }
});

app.put("/api/utentiDemo/:id", async (req, res) => {
  const { id } = req.params;
  const { reparto, stanza, cognome, bagno, barba, autonomia, vestiti, alimentazione, accessori, altro } = req.body;
  try {
    const result = await db.query(
      `UPDATE utentiDemo SET reparto=$1, stanza=$2, cognome=$3, bagno=$4, barba=$5, autonomia=$6, vestiti=$7,
       alimentazione=$8, accessori=$9, altro=$10 WHERE id=$11 RETURNING *`,
      [reparto, stanza, cognome, bagno, barba, autonomia, vestiti, alimentazione, accessori, altro, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Utente non trovato" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore aggiornamento utenti" });
  }
});

app.delete("/api/utentiDemo/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("DELETE FROM utentiDemo WHERE id=$1", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Utente non trovato" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Errore cancellazione utenti" });
  }
});

// ====================== FRUTTI ======================
app.get("/api/fruttiDemo", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM fruttiDemo ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Errore lettura frutti" });
  }
});

app.post("/api/fruttiDemo", async (req, res) => {
  const { nome, descrizione, categoria } = req.body;
  try {
    const result = await db.query(
      "INSERT INTO fruttiDemo (nome, descrizione, categoria) VALUES ($1,$2,$3) RETURNING *",
      [nome, descrizione, categoria]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore scrittura frutti" });
  }
});

app.put("/api/fruttiDemo/:id", async (req, res) => {
  const { id } = req.params;
  const { nome, descrizione, categoria } = req.body;
  try {
    const result = await db.query(
      "UPDATE fruttiDemo SET nome=$1, descrizione=$2, categoria=$3 WHERE id=$4 RETURNING *",
      [nome, descrizione, categoria, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Frutto non trovato" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore aggiornamento frutti" });
  }
});

app.delete("/api/fruttiDemo/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("DELETE FROM fruttiDemo WHERE id=$1", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Frutto non trovato" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Errore cancellazione frutti" });
  }
});

// ====================== APPUNTI ======================
app.get("/api/appuntiDemo", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM appuntiDemo ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Errore lettura appunti" });
  }
});

app.post("/api/appuntiDemo", async (req, res) => {
  const { nome, descrizione, categoria } = req.body;
  try {
    const result = await db.query(
      "INSERT INTO appuntiDemo (nome, descrizione, categoria) VALUES ($1,$2,$3) RETURNING *",
      [nome, descrizione, categoria]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore scrittura appunti" });
  }
});

app.put("/api/appuntiDemo/:id", async (req, res) => {
  const { id } = req.params;
  const { nome, descrizione, categoria } = req.body;
  try {
    const result = await db.query(
      "UPDATE appuntiDemo SET nome=$1, descrizione=$2, categoria=$3 WHERE id=$4 RETURNING *",
      [nome, descrizione, categoria, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Appunto non trovato" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore aggiornamento appunti" });
  }
});

app.delete("/api/appuntiDemo/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("DELETE FROM appuntiDemo WHERE id=$1", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Appunto non trovato" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Errore cancellazione appunti" });
  }
});



// ====================== LOGIN ======================

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query("SELECT * FROM password WHERE username = $1", [username]);

    if (result.rows.length === 0) return res.status(401).json({ error: "Utente non trovato" });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Password errata" });

    res.json({ 
      message: "Login riuscito",
      categoria: String(user.categoria) // Преобразуем в строку для совместимости с фронтендом
    });
  } catch (err) {
    console.error("Errore login:", err);
    res.status(500).json({ error: "Errore DB" });
  }
});


// ====================== ADMIN ======================

// ✅ GET – tutti gli admin
app.get('/api/admin', async (req, res) => {
  try {
    const results = await db.query('SELECT id, username, categoria FROM password');
    res.json(results.rows);
  } catch (err) {
    res.status(500).json({ error: 'Errore lettura DB', details: err.message });
  }
});


app.post('/api/admin', async (req, res) => {
  const { username, password, categoria } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO password (username, password, categoria) VALUES ($1, $2, $3) RETURNING *',
      [username, hashedPassword, categoria]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Errore scrittura DB', details: err.message });
  }
});


// ✅ PUT – aggiorna admin
app.put('/api/admin/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { username, categoria } = req.body;
  try {
    const result = await db.query(
      'UPDATE password SET username = $1, categoria = $2 WHERE id = $3 RETURNING *',
      [username, categoria, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Elemento non trovato' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Errore aggiornamento', details: err.message });
  }
});


// ✅ DELETE – elimina admin
app.delete('/api/admin/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const result = await db.query('DELETE FROM password WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Elemento non trovato' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Errore cancellazione', details: err.message });
  }
});


// ====================== UTENTI ======================
// 📥 Tutti gli utenti
app.get("/api/utenti", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM utenti ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Errore lettura utenti" });
  }
});

// ➕ Aggiungi utente
app.post("/api/utenti", async (req, res) => {
  const { reparto, stanza, cognome, bagno, barba, autonomia, vestiti, alimentazione, accessori, altro } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO utenti (reparto, stanza, cognome, bagno, barba, autonomia, vestiti, alimentazione, accessori, altro)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [reparto, stanza, cognome, bagno, barba, autonomia, vestiti, alimentazione, accessori, altro]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore scrittura utenti" });
  }
});

// ✏️ Modifica utente
app.put("/api/utenti/:id", async (req, res) => {
  const { id } = req.params;
  const { reparto, stanza, cognome, bagno, barba, autonomia, vestiti, alimentazione, accessori, altro } = req.body;
  try {
    const result = await db.query(
      `UPDATE utenti SET reparto=$1, stanza=$2, cognome=$3, bagno=$4, barba=$5, autonomia=$6, vestiti=$7,
       alimentazione=$8, accessori=$9, altro=$10 WHERE id=$11 RETURNING *`,
      [reparto, stanza, cognome, bagno, barba, autonomia, vestiti, alimentazione, accessori, altro, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Utente non trovato" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore aggiornamento utenti" });
  }
});


// ❌ Elimina utente
app.delete("/api/utenti/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("DELETE FROM utenti WHERE id=$1", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Utente non trovato" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Errore cancellazione utenti" });
  }
});


// ====================== FRUTTI ======================
// 📥 Tutti i frutti
app.get("/api/frutti", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM frutti ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Errore lettura frutti" });
  }
});

// ➕ Aggiungi frutto
app.post("/api/frutti", async (req, res) => {
  const { nome, descrizione, categoria } = req.body;
  try {
    const result = await db.query(
      "INSERT INTO frutti (nome, descrizione, categoria) VALUES ($1,$2,$3) RETURNING *",
      [nome, descrizione, categoria]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore scrittura frutti" });
  }
});

// ✏️ Modifica frutto
app.put("/api/frutti/:id", async (req, res) => {
  const { id } = req.params;
  const { nome, descrizione, categoria } = req.body;
  try {
    const result = await db.query(
      "UPDATE frutti SET nome=$1, descrizione=$2, categoria=$3 WHERE id=$4 RETURNING *",
      [nome, descrizione, categoria, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Frutto non trovato" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore aggiornamento frutti" });
  }
});

// ❌ Elimina frutto
app.delete("/api/frutti/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("DELETE FROM frutti WHERE id=$1", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Frutto non trovato" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Errore cancellazione frutti" });
  }
});

// ====================== APPUNTI ======================
// 📥 Tutti i appunti
app.get("/api/appunti", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM appunti ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Errore lettura appunti" });
  }
});

// ➕ Aggiungi frutto
app.post("/api/appunti", async (req, res) => {
  const { nome, descrizione, categoria } = req.body;
  try {
    const result = await db.query(
      "INSERT INTO appunti (nome, descrizione, categoria) VALUES ($1,$2,$3) RETURNING *",
      [nome, descrizione, categoria]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore scrittura appunti" });
  }
});

// ✏️ Modifica frutto
app.put("/api/appunti/:id", async (req, res) => {
  const { id } = req.params;
  const { nome, descrizione, categoria } = req.body;
  try {
    const result = await db.query(
      "UPDATE appunti SET nome=$1, descrizione=$2, categoria=$3 WHERE id=$4 RETURNING *",
      [nome, descrizione, categoria, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Frutto non trovato" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore aggiornamento appunti" });
  }
});

// ❌ Elimina frutto
app.delete("/api/appunti/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("DELETE FROM appunti WHERE id=$1", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Frutto non trovato" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Errore cancellazione appunti" });
  }
});



// ====================== SERVER ======================
const PORT = process.env.PORT || 3004;
app.listen(PORT, async () => {
  console.log(`✅ Server avviato su porta ${PORT}`);
  await createTables();
  await inserisciDemoDati();
});

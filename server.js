import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import { Pool } from "pg";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs/promises"; // Используем промисы для await
import fsSync from "fs";
import { fileURLToPath } from 'url';
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());

// CORS
app.use(cors({
  origin: [
    'http://localhost:3000',      // Dev
    'https://frutti.vercel.app'   // Prod
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'user-categoria']
}));

app.options('*', cors());


// 📂 Cartella per i photo
const uploadDir = path.resolve("uploads");
app.use("/uploads", express.static(uploadDir));


const multer = require('multer');

// 📸 Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ dest: 'uploads/' });



const excelUpload = multer({ storage: multer.memoryStorage() });

// PostgreSQL
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Проверка подключения и создание таблиц
db.connect((err, client, release) => {
  if (err) {
    console.error('PG connect error:', err.message);
    return;
  }
  console.log("PostgreSQL подключён");

  const createExcelTable = `
    CREATE TABLE IF NOT EXISTS excel_data (
      id SERIAL PRIMARY KEY,
      data JSONB,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  client.query(createExcelTable, (err) => {
    if (err) throw err;
    console.log("Таблица 'excel_data' готова ✅");
  });

  const createPhotosTable = `
    DROP TABLE IF EXISTS photos;

    CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      path VARCHAR(255) NOT NULL,
      categoria VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  client.query(createPhotosTable, (err) => {
    if (err) throw err;
    console.log("Таблица 'photos' готова (глобально) ✅");
  });

  release();
});

// Middleware проверки админа
const requireAdmin = (req, res, next) => {
  const userCategoria = req.headers['user-categoria'];
  if (userCategoria !== '3') {
    return res.status(403).json({ error: 'Только админы (userCategoria=3)!' });
  }
  next();
};

// 📤 Upload foto
app.post('/api/upload-photos', upload.array('photos', 5), (req, res) => {
  try {
    console.log(req.files); // dovresti vedere i file caricati
    res.json({ photos: req.files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore caricamento foto' });
  }
  
  try {
    const categoria = req.headers["user-categoria"] || "default";
    const uploadedPhotos = [];

    for (const file of req.files) {
      const result = await db.query(
        "INSERT INTO photos (filename, path, categoria) VALUES ($1, $2, $3) RETURNING *",
        [file.originalname, file.path, categoria]
      );
      uploadedPhotos.push(result.rows[0]);
    }

    res.json({ photos: uploadedPhotos });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Errore nel salvataggio foto" });
  }
});

// 📥 Elenco фото
app.get("/api/photos", async (req, res) => {
  try {
    const categoria = req.headers["user-categoria"] || "default";
    const result = await db.query(
      "SELECT * FROM photos WHERE categoria = $1 ORDER BY id DESC",
      [categoria]
    );
    res.json({ photos: result.rows });
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Errore nel caricamento foto" });
  }
});

// ❌ Удаление фото
app.delete("/api/delete-photo/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.query("SELECT path FROM photos WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Foto non trovata" });
    }

    const photoPath = result.rows[0].path;

    // Асинхронное удаление файла
    try {
      await fs.unlink(photoPath);
    } catch (err) {
      if (err.code !== "ENOENT") { // игнорируем, если файла нет
        console.error("Errore eliminazione file:", err);
        return res.status(500).json({ error: "Errore nella cancellazione file" });
      }
    }

    await db.query("DELETE FROM photos WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Errore nella cancellazione foto" });
  }
});


// 📊 Загрузка Excel → PostgreSQL
app.post("/upload", excelUpload.single("excelFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл не выбран" });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) return res.status(400).json({ error: "Файл пустой" });

    const jsonData = JSON.stringify(data);
    await db.query("DELETE FROM excel_data");
    await db.query("INSERT INTO excel_data (data) VALUES ($1)", [jsonData]);

    res.json({ success: true, data });
  } catch (err) {
    console.error("Excel upload error:", err);
    res.status(500).json({ error: "Ошибка обработки файла: " + err.message });
  }
});

// 📈 Получить последние Excel-данные
app.get("/data", async (req, res) => {
  try {
    const result = await db.query("SELECT data FROM excel_data ORDER BY uploaded_at DESC LIMIT 1");
    if (result.rows.length === 0) return res.json({ success: false, data: [] });

    const rawData = result.rows[0].data;
    const parsed = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error("Fetch Excel data error:", err);
    res.status(500).json({ error: "Ошибка чтения из БД: " + err.message });
  }
});

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
    console.error('Update utenti error:', err); // 👉 Добавил лог
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
    console.error('Delete utenti error:', err); // 👉 Добавил лог
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
    console.error('Delete frutti error:', err); // 👉 Добавил лог
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
    if (result.rowCount === 0) return res.status(404).json({ error: "Appunto non trovato" });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete appunti error:', err); // 👉 Добавил лог
    res.status(500).json({ error: "Errore cancellazione appunti" });
  }
});


// ====================== SERVER ======================
const PORT = process.env.PORT || 3004;
app.listen(PORT, async () => {
  console.log(`✅ Server avviato su porta ${PORT}`);
});

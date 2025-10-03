import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import { Pool } from "pg";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// 👉 Фикс CORS: Multiple origins + preflight
app.use(cors({
  origin: [
    'https://frutti.vercel.app'   // Prod frontend
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'user-categoria']
}));

// 👉 Preflight OPTIONS для всех путей
app.options('*', cors());

// 👉 Error handler (лог + ответ)
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ error: 'Something broke!' });
});


// Папка для фото
const uploadDir = path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadDir));

// Multer
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const photoUpload = multer({ storage: photoStorage });
const excelUpload = multer({ storage: multer.memoryStorage() });




// 🔌 PG Pool (SSL fix)
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }  // Всегда для Render
});

// Проверка подключения и создание таблиц
db.connect((err, client, release) => {
  if (err) {
    console.error('PG connect error:', err.message);
    return; // Не throw, чтобы сервер стартовал
  }
  console.log("PostgreSQL подключён");

  // 👉 Создание таблицы если не существует
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
    CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      path VARCHAR(255) NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  client.query(createPhotosTable, (err) => {
    if (err) throw err;
    console.log("Таблица 'photos' готова (глобально) ✅");
  });

  release(); // Закрываем соединение
});

// Multer: загружаем файл в память (для Excel)
const upload = multer({ storage: multer.memoryStorage() });

// 👉 Middleware для проверки админа (из headers)
const requireAdmin = (req, res, next) => {
  const userCategoria = req.headers['user-categoria'];
  if (userCategoria !== '3') {
    return res.status(403).json({ error: 'Только админы (userCategoria=3)!' });
  }
  next();
};

// 🚀 Загрузка фото
app.post("/api/upload-photos", photoUpload.array("photos", 5), async (req, res) => {
  try {
    const files = req.files.map(f => f.filename);
    const saved = [];

    for (let file of files) {
      const result = await db.query(
        "INSERT INTO photos (path) VALUES ($1) RETURNING id, path",
        [file]
      );
      saved.push(result.rows[0]);
    }

    res.json({ photos: saved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка при загрузке" });
  }
});

// 📥 Получение всех фото
app.get("/api/photos", async (req, res) => {
  try {
    const result = await db.query("SELECT id, path FROM photos ORDER BY id ASC");
    res.json({ photos: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка при получении фото" });
  }
});

// ❌ Удаление фото
app.delete("/api/delete-photo/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query("SELECT path FROM photos WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Фото не найдено" });
    }

    const fileName = result.rows[0].path;
    const filePath = path.join(uploadDir, fileName);

    await db.query("DELETE FROM photos WHERE id = $1", [id]);

    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.warn("⚠ Не удалось удалить файл:", filePath);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка при удалении" });
  }
});



// Маршрут для загрузки и парсинга Excel + сохранение в БД
app.post('/upload', upload.single('excelFile'), (req, res) => {
  console.log('POST /upload вызван');

  if (!req.file) {
    return res.status(400).json({ error: 'Файл не выбран' });
  }

  try {
    // Парсим Excel из буфера
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Первый лист
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet); // В JSON-массив объектов

    if (data.length === 0) {
      return res.status(400).json({ error: 'Файл пустой или без данных' });
    }

    const jsonData = JSON.stringify(data);
    console.log(
      'Данные для БД (первые 2 ряда):',
      data.slice(0, 2)
    );

    // Удаляем старые данные перед вставкой
    db.query('DELETE FROM excel_data', (deleteErr) => {
      if (deleteErr) {
        console.error('Ошибка удаления старых данных:', deleteErr);
        return res.status(500).json({ error: 'Ошибка удаления: ' + deleteErr.message });
      }

      // Сохраняем новые данные в БД
      const query = 'INSERT INTO excel_data (data) VALUES ($1) RETURNING id';
      db.query(query, [jsonData], (insertErr, result) => {
        if (insertErr) {
          console.error('Ошибка сохранения в БД:', insertErr);
          return res.status(500).json({ error: 'Ошибка сохранения: ' + insertErr.message });
        }

        const newId = result.rows[0].id;
        console.log('Старые данные удалены. Новые сохранены! ID записи:', newId);

        res.json({
          success: true,
          id: newId,
          data // возвращаем клиенту данные в JSON, а не строку
        });
      });
    });
  } catch (error) {
    console.error('Ошибка парсинга Excel:', error);
    res.status(500).json({ error: 'Ошибка обработки файла: ' + error.message });
  }
});

// Маршрут: GET для загрузки последних данных из БД
app.get('/data', (req, res) => {
  console.log('GET /data вызван');

  const query = 'SELECT data FROM excel_data ORDER BY uploaded_at DESC LIMIT 1';

  db.query(query, (err, results) => {
    if (err) {
      console.error('Ошибка чтения из БД:', err);
      return res.status(500).json({ error: 'Ошибка чтения: ' + err.message });
    }

    if (results.rows.length === 0) {
      console.log('БД пуста — возвращаем []');
      return res.json({ success: false, data: [] });
    }

    const rawData = results.rows[0].data;
    console.log(
      'Сырые данные из БД (тип = %s): %s',
      typeof rawData,
      typeof rawData === 'string'
        ? rawData.substring(0, 100)
        : JSON.stringify(rawData).substring(0, 100)
    );

    try {
      let parsedData;

      if (Array.isArray(rawData)) {
        // pg сам распарсил JSONB → это массив
        parsedData = rawData;
      } else if (typeof rawData === 'object' && rawData !== null) {
        // pg сам распарсил JSONB → это объект (редкий кейс)
        parsedData = [rawData];
      } else if (typeof rawData === 'string') {
        // Если строка — пробуем парсить
        parsedData = JSON.parse(rawData);

        if (!Array.isArray(parsedData)) {
          console.warn('⚠️ JSON из строки не массив, оборачиваем в []');
          parsedData = [parsedData];
        }
      } else {
        console.warn('⚠️ Неизвестный тип данных:', typeof rawData);
        parsedData = [];
      }

      console.log('Парсинг успешен! Кол-во строк:', parsedData.length);
      res.json({ success: true, data: parsedData });

    } catch (parseErr) {
      console.error('Ошибка парсинга JSON из БД:', parseErr);
      res.status(500).json({
        error:
          'Ошибка парсинга данных: ' +
          parseErr.message +
          '. Очисти таблицу: DELETE FROM excel_data;'
      });
    }
  });
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
app.get("/api/utenti", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM utenti ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Errore lettura utenti" });
  }
});

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
app.get("/api/frutti", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM frutti ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Errore lettura frutti" });
  }
});

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
app.get("/api/appunti", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM appunti ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Errore lettura appunti" });
  }
});

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

app.put("/api/appunti/:id", async (req, res) => {
  const { id } = req.params;
  const { nome, descrizione, categoria } = req.body;
  try {
    const result = await db.query(
      "UPDATE appunti SET nome=$1, descrizione=$2, categoria=$3 WHERE id=$4 RETURNING *",
      [nome, descrizione, categoria, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Appunto non trovato" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore aggiornamento appunti" });
  }
});

app.delete("/api/appunti/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("DELETE FROM appunti WHERE id=$1", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Appunto non trovato" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Errore cancellazione appunti" });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Server avviato su http://localhost:${PORT}`);
});
const express = require('express');
const cors = require('cors');
const mysql = require("mysql2");

// Подключение к MySQL
const db = mysql.createConnection({
  host: "localhost",
  user: "evgenii",
  password: "60952",
  database: "DB_RSA"
});

// Проверка подключения
db.connect((err) => {
  if (err) throw err;
  console.log("MySQL подключён");
});


const bcrypt = require('bcrypt');
require('dotenv').config(); // <== carica .env

const app = express();
const PORT = process.env.PORT || 3001;


app.use(cors());
app.use(express.json());


app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  db.query('SELECT * FROM password WHERE username = ?', [username], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Errore DB' });
    if (results.length === 0) return res.status(401).json({ error: 'Utente non trovato' });

    const user = results[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Password errata' });

    res.json({ message: 'Login riuscito' });
  });
});


app.get('/api/frutti', (req, res) => {
  db.query('SELECT * FROM frutti', (err, results) => {
    if (err) return res.status(500).json({ error: 'Errore lettura DB' });
    res.json(results);
  });
});

app.post('/api/frutti', (req, res) => {
  const { nome, descrizione, categoria } = req.body;
  db.query(
    'INSERT INTO frutti (nome, descrizione, categoria) VALUES (?, ?, ?)',
    [nome, descrizione, categoria],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Errore scrittura DB' });
      res.json({ id: result.insertId, nome, descrizione, categoria });
    }
  );
});

app.put('/api/frutti/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { nome, descrizione, categoria } = req.body;
  db.query(
    'UPDATE frutti SET nome = ?, descrizione = ?, categoria = ? WHERE id = ?',
    [nome, descrizione, categoria, id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Errore aggiornamento' });
      res.json({ id, nome, descrizione, categoria });
    }
  );
});

app.delete('/api/frutti/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.query('DELETE FROM frutti WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Errore cancellazione' });
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Elemento non trovato' });
    res.json({ success: true });
  });
});



app.get('/api/utenti', (req, res) => {
  db.query('SELECT * FROM utenti', (err, results) => {
    if (err) return res.status(500).json({ error: 'Errore lettura utenti' });
    res.json(results);
  });
});

app.post('/api/utenti', (req, res) => {
  const nuovo = req.body;
  db.query(
    'INSERT INTO utenti (reparto, stanza, cognome, bagno, barba, autonomia, vestiti, alimentazione, accessori, altro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      nuovo.reparto,
      nuovo.stanza,
      nuovo.cognome,
      nuovo.bagno,
      nuovo.barba,
      nuovo.autonomia,
      nuovo.vestiti,
      nuovo.alimentazione,
      nuovo.accessori,
      nuovo.altro,
    ],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Errore inserimento' });
      res.json({ id: result.insertId, ...nuovo });
    }
  );
});

app.put('/api/utenti/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const modifiche = req.body;
  db.query(
    'UPDATE utenti SET reparto = ?, stanza = ?, cognome = ?, bagno = ?, barba = ?, autonomia = ?, vestiti = ?, alimentazione = ?, accessori = ?, altro = ? WHERE id = ?',
    [
      modifiche.reparto,
      modifiche.stanza,
      modifiche.cognome,
      modifiche.bagno,
      modifiche.barba,
      modifiche.autonomia,
      modifiche.vestiti,
      modifiche.alimentazione,
      modifiche.accessori,
      modifiche.altro,
      id,
    ],
    (err) => {
      if (err) return res.status(500).json({ error: 'Errore aggiornamento' });
      res.json({ id, ...modifiche });
    }
  );
});

app.delete('/api/utenti/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.query('DELETE FROM utenti WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Errore cancellazione' });
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Utente non trovato' });
    res.json({ success: true });
  });
});




app.listen(PORT, () => {
  console.log(`✅ Server avviato su http://localhost:${PORT}`);
});

module.exports = app;
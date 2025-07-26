const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config(); // <== carica .env

const app = express();
const PORT = process.env.PORT || 3001;

const USERS_PATH = path.resolve(__dirname, process.env.USERS_FILE);
const FRUTTI_PATH = path.resolve(__dirname, process.env.FRUTTI_FILE);
const UTENTI_PATH = path.resolve(__dirname, process.env.UTENTI_FILE);

app.use(cors());
app.use(express.json());

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const usersRaw = fs.readFileSync(USERS_PATH, 'utf-8');
  const users = JSON.parse(usersRaw);

  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Utente non trovato' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Password errata' });

  res.json({ message: 'Login riuscito' });
});

app.get('/api/frutti', (req, res) => {
  fs.readFile(FRUTTI_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Errore nella lettura del file' });
    res.json(JSON.parse(data));
  });
});

// ✅ Aggiungi un frutto
app.post('/api/frutti', (req, res) => {
  const nuovo = { ...req.body, id: Date.now() };
  fs.readFile(FRUTTI_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Errore nella lettura del file' });
    const frutti = JSON.parse(data);
    frutti.push(nuovo);
    fs.writeFile(FRUTTI_PATH, JSON.stringify(frutti, null, 2), err => {
      if (err) return res.status(500).json({ error: 'Errore nella scrittura' });
      res.json(nuovo);
    });
  });
});

// ✅ Modifica un frutto
app.put('/api/frutti/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { nome, descrizione, categoria } = req.body;
  fs.readFile(FRUTTI_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Errore lettura' });
    let frutti = JSON.parse(data);
    const index = frutti.findIndex(f => f.id === id);
    if (index === -1) return res.status(404).json({ error: 'Non trovato' });
    frutti[index] = { ...frutti[index], nome, descrizione, categoria };
    fs.writeFile(FRUTTI_PATH, JSON.stringify(frutti, null, 2), err => {
      if (err) return res.status(500).json({ error: 'Errore scrittura' });
      res.json(frutti[index]);
    });
  });
});

// ✅ Elimina un frutto
app.delete('/api/frutti/:id', (req, res) => {
  const id = parseInt(req.params.id);
  fs.readFile(FRUTTI_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Errore lettura' });
    let frutti = JSON.parse(data);
    const nuovo = frutti.filter(f => f.id !== id);
    fs.writeFile(FRUTTI_PATH, JSON.stringify(nuovo, null, 2), err => {
      if (err) return res.status(500).json({ error: 'Errore scrittura' });
      res.json({ success: true });
    });
  });
});



app.get('/api/utenti', (req, res) => {
  fs.readFile(UTENTI_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Errore lettura file utenti' });
    res.json(JSON.parse(data));
  });
});


app.post('/api/utenti', (req, res) => {
  const nuovo = { ...req.body, id: Date.now() };
  fs.readFile(UTENTI_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Errore lettura file' });
    const utenti = JSON.parse(data);
    utenti.push(nuovo);
    fs.writeFile(UTENTI_PATH, JSON.stringify(utenti, null, 2), err => {
      if (err) return res.status(500).json({ error: 'Errore scrittura file' });
      res.json(nuovo);
    });
  });
});


app.put('/api/utenti/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const datiModificati = req.body;

  fs.readFile(UTENTI_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Errore lettura' });
    let utenti = JSON.parse(data);
    const index = utenti.findIndex(u => u.id === id);
    if (index === -1) return res.status(404).json({ error: 'Utente non trovato' });
    utenti[index] = { ...utenti[index], ...datiModificati };
    fs.writeFile(UTENTI_PATH, JSON.stringify(utenti, null, 2), err => {
      if (err) return res.status(500).json({ error: 'Errore scrittura' });
      res.json(utenti[index]);
    });
  });
});


app.delete('/api/utenti/:id', (req, res) => {
  const id = parseInt(req.params.id);
  fs.readFile(UTENTI_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Errore lettura' });
    let utenti = JSON.parse(data);
    const nuovo = utenti.filter(u => u.id !== id);
    if (nuovo.length === utenti.length)
      return res.status(404).json({ error: 'Utente non trovato' });
    fs.writeFile(UTENTI_PATH, JSON.stringify(nuovo, null, 2), err => {
      if (err) return res.status(500).json({ error: 'Errore scrittura' });
      res.json({ success: true });
    });
  });
});


app.listen(PORT, () => {
  console.log(`✅ Server avviato su http://localhost:${PORT}`);
});

module.exports = app;

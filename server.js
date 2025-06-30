const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const FILE_PATH = path.join(__dirname, 'frutti.json');

app.use(cors());
app.use(express.json());

// ✅ Leggi tutti i frutti
app.get('/api/frutti', (req, res) => {
  fs.readFile(FILE_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Errore nella lettura del file' });
    res.json(JSON.parse(data));
  });
});

// ✅ Aggiungi un frutto
app.post('/api/frutti', (req, res) => {
  const nuovo = { ...req.body, id: Date.now() };
  fs.readFile(FILE_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Errore nella lettura del file' });
    const frutti = JSON.parse(data);
    frutti.push(nuovo);
    fs.writeFile(FILE_PATH, JSON.stringify(frutti, null, 2), err => {
      if (err) return res.status(500).json({ error: 'Errore nella scrittura' });
      res.json(nuovo);
    });
  });
});

// ✅ Modifica un frutto
app.put('/api/frutti/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { nome, categoria } = req.body;
  fs.readFile(FILE_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Errore lettura' });
    let frutti = JSON.parse(data);
    const index = frutti.findIndex(f => f.id === id);
    if (index === -1) return res.status(404).json({ error: 'Non trovato' });
    frutti[index] = { ...frutti[index], nome, categoria };
    fs.writeFile(FILE_PATH, JSON.stringify(frutti, null, 2), err => {
      if (err) return res.status(500).json({ error: 'Errore scrittura' });
      res.json(frutti[index]);
    });
  });
});

// ✅ Elimina un frutto
app.delete('/api/frutti/:id', (req, res) => {
  const id = parseInt(req.params.id);
  fs.readFile(FILE_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Errore lettura' });
    let frutti = JSON.parse(data);
    const nuovo = frutti.filter(f => f.id !== id);
    fs.writeFile(FILE_PATH, JSON.stringify(nuovo, null, 2), err => {
      if (err) return res.status(500).json({ error: 'Errore scrittura' });
      res.json({ success: true });
    });
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server avviato su http://localhost:${PORT}`);
});

module.exports = app;

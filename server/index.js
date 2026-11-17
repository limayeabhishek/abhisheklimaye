const app = require('./app');

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
  console.log(`A-Ultron: Model configured as ${process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'}`);
});

process.on('uncaughtException', (err, origin) => {
  console.error('Caught exception:', err);
});

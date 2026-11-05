require('dotenv').config();
const http = require('http');
const app = require('./app');
const { checkConnection } = require('./config/supabase');

const PORT = process.env.PORT || 3000;

const start = async () => {
  await checkConnection();

  const server = http.createServer(app);

  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`💧 AquaTrack Web Application running on port ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`🔐 Login: http://localhost:${PORT}/login`);
    console.log(`📊 Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`====================================================`);
  });
};

start();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('[AquaTrack Server Rejection]', err.message);
});

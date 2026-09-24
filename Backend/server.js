import app from './app.js';
import dotenv from 'dotenv';
dotenv.config();

import { PORT, NODE_ENV, assertConfig } from './config/main.js';
import { prisma } from './config/db.js';

async function startServer() {
  // Validar la configuración ANTES de todo. Es preferible no arrancar a
  // arrancar mal configurado y enterarse durante la ventana de 15 minutos.
  try {
    assertConfig();
  } catch (err) {
    console.error('[STARTUP]', err.message);
    process.exit(1);
  }

  // Verificar la conexión a la BD al arrancar — fail-fast si la config está mal.
  try {
    await prisma.$connect();
    console.log('[STARTUP] Conectado a la base de datos.');
  } catch (err) {
    console.error('[STARTUP] No se pudo conectar a la base de datos:', err);
    process.exit(1);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at port ${PORT} with pid ${process.pid} as ${NODE_ENV} mode`);
  });

  server.keepAliveTimeout = 30000;
  server.headersTimeout   = 35000;

  const shutdown = (signal) => {
    console.log(`\n[SHUTDOWN] Señal ${signal} recibida. Cerrando...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

startServer().catch(err => {
  console.error('[STARTUP] Error fatal al iniciar el servidor:', err);
  process.exit(1);
});

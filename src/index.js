const dns = require('dns');

dns.setServers(['8.8.8.8']);
dns.setDefaultResultOrder('ipv4first');
const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');

let server;
mongoose.connect(config.mongoose.url, config.mongoose.options).then(() => {
  logger.info('Connected to MongoDB');
  server = app.listen(config.port, () => {
    logger.info(`Listening to port ${config.port}`);
  });
});

const exitHandler = (exitCode = 1) => {
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(exitCode);
    });
  } else {
    process.exit(exitCode);
  }
};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  exitHandler(1);
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  exitHandler(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received');
  exitHandler(0);
});

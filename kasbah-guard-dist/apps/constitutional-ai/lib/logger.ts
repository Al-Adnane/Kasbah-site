import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        singleLine: false,
      },
    },
  }),
  base: {
    service: 'constitutional-ai',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
});

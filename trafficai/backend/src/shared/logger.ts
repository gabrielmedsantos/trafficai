// ==============================
// TrafficAI — Structured Logger (Winston)
// ==============================

import winston from 'winston';

const { combine, timestamp, printf, colorize, json } = winston.format;

const devFormat = printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
});

export const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        process.env.NODE_ENV === 'production' ? json() : combine(colorize(), devFormat)
    ),
    defaultMeta: { service: 'trafficai' },
    transports: [
        new winston.transports.Console(),
        ...(process.env.NODE_ENV === 'production'
            ? [
                new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
                new winston.transports.File({ filename: 'logs/combined.log' }),
            ]
            : []),
    ],
});

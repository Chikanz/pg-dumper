import { spawn } from 'child_process';
import { Client } from 'pg';
import { Readable } from 'stream';
import { ConnectionDetails } from './types';
import { logger } from './logger';
import {z} from "zod";

export class DatabaseService {
  /**
   * Parse a PostgreSQL connection string into components
   */
  static parseConnectionString(connectionString: string): ConnectionDetails {
    // Remove the postgresql:// prefix
    const conn = connectionString.replace(/^postgres:\/\//, '');
    
    // Split into userpass and hostdb parts
    const [userpass, hostdb] = conn.split('@');
    
    // Extract username and password
    const [username, password] = userpass.split(':');
    
    // Extract host, port, and database
    const hostportPart = hostdb.split('/')[0];
    const [host, portStr] = hostportPart.split(':');
    const port = parseInt(portStr, 10);
    
    // Extract database name (handle query parameters if present)
    const database = hostdb.split('/')[1]?.split('?')[0] ?? 'postgres';

    return {
      username,
      password,
      host,
      port,
      database,
    };
  }

  /**
   * Check the PostgreSQL server version
   */
  static async checkServerVersion(connectionDetails: ConnectionDetails): Promise<number> {
    const client = new Client({
      user: connectionDetails.username,
      password: connectionDetails.password,
      host: connectionDetails.host,
      port: connectionDetails.port,
      database: connectionDetails.database,
      ssl: false, // Set to true if SSL is required
      connectionTimeoutMillis: 10000,
    });

    try {
      await client.connect();
      const result = await client.query('SHOW server_version;');
      const versionString = result.rows[0].server_version;
      // Extract major version
      const majorVersion = parseInt(versionString.split('.')[0], 10);
      logger.info(`PostgreSQL server version: ${versionString} (major: ${majorVersion})`);
      return majorVersion;
    } catch (error) {
      logger.error('Error checking server version:', error);
      throw error;
    } finally {
      await client.end();
    }
  }

  /**
   * Create a stream from pg_dump
   */
  static createDumpStream(connectionDetails: ConnectionDetails): Readable {
    const { username, password, host, port, database } = connectionDetails;

    logger.info(`Starting PostgreSQL dump of database: ${database} on ${host}:${port}`);

    // Track progress metrics
    let bytesProcessed = 0;
    const startTime = Date.now();

    // Constants for logging thresholds
    const LOG_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

    // Spawn pg_dump process
    const pgDump = spawn('pg_dump', [
      '-h', host,
      '-p', port.toString(),
      '-U', username,
      '-d', database,
      '-F', 'c', // Custom format (compressed)
      '-v', // Verbose output
    ], {
      env: { ...process.env, PGPASSWORD: password },
    });

    // Handle errors and verbose output
    pgDump.stderr.on('data', (data) => {
      const message = data.toString().trim();

      // pg_dump sends progress info to stderr when using -v flag
      if (message.includes('processing')) {
        logger.info(`Progress: ${message}`);
      } else {
        logger.warn(`pg_dump stderr: ${message}`);
      }
    });

    pgDump.on('error', (error) => {
      logger.error('pg_dump error:', error);
    });

    pgDump.on('exit', (code, signal) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (code !== 0) {
        logger.error(`pg_dump exited with code ${code} and signal ${signal} after ${duration}s`);
      } else {
        const gbProcessed = (bytesProcessed / (1024 * 1024 * 1024)).toFixed(2);
        logger.info(`pg_dump completed successfully in ${duration}s, processed ${gbProcessed}GB`);
      }
    });

    // Track stdout data size
    pgDump.stdout.on('data', (chunk) => {
      bytesProcessed += chunk.length;

      // Log progress every 2GB
      if (Math.floor((bytesProcessed - chunk.length) / LOG_THRESHOLD_BYTES) <
          Math.floor(bytesProcessed / LOG_THRESHOLD_BYTES)) {
        const gbProcessed = (bytesProcessed / (1024 * 1024 * 1024)).toFixed(2);
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const mbPerSecond = (bytesProcessed / (1024 * 1024) / elapsedSeconds).toFixed(2);

        logger.info(`Dump progress: ${gbProcessed}GB processed (${mbPerSecond}MB/s)`);
      }
    });

    // Return stdout as a readable stream
    return pgDump.stdout;
  }

  /**
   * Get the local PostgreSQL client version
   */
  static async getClientVersion(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const pgDump = spawn('pg_dump', ['--version']);
      let output = '';
      
      pgDump.stdout.on('data', (data) => {
        output += data.toString();
      });

      pgDump.on('error', (error) => {
        reject(error);
      });

      pgDump.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`pg_dump exited with code ${code}`));
          return;
        }
        
        const versionMatch = output.match(/\d+\.\d+/);
        if (versionMatch) {
          const version = versionMatch[0];
          const majorVersion = parseInt(version.split('.')[0], 10);
          logger.info(`PostgreSQL client version: ${version} (major: ${majorVersion})`);
          resolve(majorVersion);
        } else {
          reject(new Error('Could not determine PostgreSQL client version'));
        }
      });
    });
  }
}

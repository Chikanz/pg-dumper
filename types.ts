import { z } from 'zod';

// Schema for a database connection configuration
export const DatabaseConfigSchema = z.object({
  name: z.string(),
  connection: z.string().startsWith('postgres://'),
  folder: z.string().optional(),
  retention_days: z.number().positive().default(30)
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

// Schema for the connections configuration file
export const ConnectionsConfigSchema = z.array(DatabaseConfigSchema);

export type ConnectionsConfig = z.infer<typeof ConnectionsConfigSchema>;

// Parsed connection details
export interface ConnectionDetails {
  username: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

// Configuration for S3/R2
export interface S3Config {
  bucket: string;
  prefix?: string;
  endpointUrl?: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// Backup result
export interface BackupResult {
  database: string;
  success: boolean;
  path?: string;
  error?: Error;
  deletedBackups?: number;
}

import { readFile } from 'fs/promises';
// import {path} from 'path';
import 'dotenv/config';
import { logger } from './logger';
import { DatabaseService } from './db-service';
import { S3Service } from './s3-service';
import { 
  ConnectionsConfig, 
  ConnectionsConfigSchema, 
  BackupResult 
} from './types';

/**
 * Main backup function
 */
async function runBackups(): Promise<void> {
  try {
    // Check required environment variables
    const requiredEnvVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    // Get PostgreSQL client version
    const clientVersion = await DatabaseService.getClientVersion();

    // Read and parse connections file
    const connectionsPath = process.env.CONNECTIONS_FILE || '/app/connections.json';
    logger.info(`Reading connections from ${connectionsPath}`);
    
    const connectionsData = await readFile(connectionsPath, 'utf-8');
    const connectionsJson = JSON.parse(connectionsData);
    
    // Validate connections data with Zod
    const connections = ConnectionsConfigSchema.parse(connectionsJson);
    logger.info(`Found ${connections.length} database connections`);

    // Create S3 service
    const s3Service = new S3Service({
      bucket: process.env.S3_BUCKET!,
      prefix: process.env.S3_PREFIX,
      endpointUrl: process.env.S3_ENDPOINT_URL,
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    });

    // Process each database
    const results: BackupResult[] = [];
    
    for (const dbConfig of connections) {
      try {
        logger.info(`Processing database: ${dbConfig.name}`);
        
        // Parse connection string
        const connectionDetails = DatabaseService.parseConnectionString(dbConfig.connection);

        console.log(connectionDetails);
        
        // Check server version
        const serverVersion = await DatabaseService.checkServerVersion(connectionDetails);
        
        // Check version compatibility
        if (clientVersion < serverVersion) {
          logger.warn(`Client version (${clientVersion}) is older than server version (${serverVersion}). This might cause compatibility issues.`);
        }
        
        // Generate S3 path
        const s3Key = s3Service.createS3Path(dbConfig.name, dbConfig.folder);
        logger.info(`Backup path: ${s3Key}`);
        
        // Create dump stream
        logger.info(`Creating dump for ${connectionDetails.database}`);
        const dumpStream = DatabaseService.createDumpStream(connectionDetails);
        
        // Upload to S3
        logger.info(`Uploading to S3: ${dbConfig.name}`);
        const uploadedKey = await s3Service.uploadStream(dumpStream, s3Key);
        logger.info(`Backup completed: ${uploadedKey}`);
        
        // Apply retention policy
        logger.info(`Applying retention policy (${dbConfig.retention_days} days) for ${dbConfig.name}`);
        const deletedCount = await s3Service.deleteOldBackups(
          dbConfig.name,
          dbConfig.folder || '',
          dbConfig.retention_days
        );
        
        results.push({
          database: dbConfig.name,
          success: true,
          path: uploadedKey,
          deletedBackups: deletedCount,
        });
      } catch (error) {
        logger.error(`Error processing ${dbConfig.name}:`, error);
        results.push({
          database: dbConfig.name,
          success: false,
          error: error as Error,
        });
      }
    }

    // Log results summary
    logger.info('Backup results:');
    for (const result of results) {
      const status = result.success ? 'SUCCESS' : 'FAILED';
      logger.info(`${result.database}: ${status}`);
      
      if (result.success && result.deletedBackups) {
        logger.info(`  - Deleted ${result.deletedBackups} old backups`);
      }
      
      if (!result.success && result.error) {
        logger.error(`  - Error: ${result.error.message}`);
      }
    }

    // Check if all backups were successful
    const allSuccessful = results.every(r => r.success);
    if (!allSuccessful) {
      throw new Error('One or more backups failed');
    }

    logger.info('All backups completed successfully - see ya later!');

    // // Shutdown if requested
    // if (process.env.AUTO_SHUTDOWN === 'true') {
    //   logger.info('Shutting down system');
    //   await systemShutdown();
    // }
    
  } catch (error) {
    logger.error('Backup process failed:', error);
    process.exit(1);
  }
}


// Run the backups
runBackups();

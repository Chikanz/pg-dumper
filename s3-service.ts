import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import { format, parseISO, subDays } from 'date-fns';
import { S3Config } from './types';
import { logger } from './logger';

export class S3Service {
  private client: S3Client;
  private config: S3Config;

  constructor(config: S3Config) {
    this.config = config;

    const clientConfig: any = {
      region: config.region || 'auto',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    };

    // Add custom endpoint for R2 or other S3-compatible storage
    if (config.endpointUrl) {
      clientConfig.endpoint = config.endpointUrl;
      clientConfig.forcePathStyle = true; // Required for some S3-compatible storage services
    }

    this.client = new S3Client(clientConfig);
  }

  /**
   * Upload a stream to S3/R2
   */
  async uploadStream(stream: Readable, key: string): Promise<string> {
    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.config.bucket,
          Key: key,
          Body: stream,
        },
      });

      const result = await upload.done();
      logger.info(`Upload complete: ${result.Key}`);
      return result.Key || key;
    } catch (error) {
      logger.error('Error uploading to S3:', error);
      throw error;
    }
  }

  /**
   * Create a full S3 path with prefix and folder
   */
  createS3Path(dbName: string, folder?: string): string {
    const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
    const fileName = `${dbName}_${timestamp}.dump`;
    
    let path = '';
    
    // Add prefix if provided
    if (this.config.prefix) {
      path += `${this.config.prefix}/`;
    }
    
    // Add folder if provided
    if (folder) {
      path += `${folder}/`;
    }
    
    // Add filename
    path += fileName;
    
    return path;
  }

  /**
   * Delete backups older than the retention period
   */
  async deleteOldBackups(dbName: string, folder: string, retentionDays: number): Promise<number> {
    try {
      const prefix = this.createPrefix(folder);
      logger.info(`Checking for old backups in ${prefix} (retention: ${retentionDays} days)`);
      
      const cutoffDate = subDays(new Date(), retentionDays);
      logger.debug(`Cutoff date: ${cutoffDate.toISOString()}`);
      
      let deletedCount = 0;
      let continuationToken: string | undefined;
      
      do {
        // List objects in the folder
        const listCommand = new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });
        
        const listResponse = await this.client.send(listCommand);
        continuationToken = listResponse.NextContinuationToken;
        
        // Process each backup file
        if (listResponse.Contents) {
          for (const item of listResponse.Contents) {
            const key = item.Key;
            if (!key) continue;
            
            const fileName = key.split('/').pop();
            if (!fileName) continue;
            
            // Check if file matches our pattern: dbname_YYYYMMDD_HHMMSS.dump
            const filePattern = new RegExp(`${dbName}_(\\d{8})_(\\d{6})\\.dump$`);
            const match = fileName.match(filePattern);
            
            if (match) {
              const dateStr = match[1];
              const timeStr = match[2];
              
              // Format: YYYYMMDD_HHMMSS
              const year = dateStr.substring(0, 4);
              const month = dateStr.substring(4, 6);
              const day = dateStr.substring(6, 8);
              const hour = timeStr.substring(0, 2);
              const minute = timeStr.substring(2, 4);
              const second = timeStr.substring(4, 6);
              
              const backupDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`);
              
              // Delete if older than retention period
              if (backupDate < cutoffDate) {
                logger.info(`Deleting old backup: ${fileName}`);
                
                const deleteCommand = new DeleteObjectCommand({
                  Bucket: this.config.bucket,
                  Key: key,
                });
                
                await this.client.send(deleteCommand);
                deletedCount++;
              }
            }
          }
        }
      } while (continuationToken);
      
      logger.info(`Deleted ${deletedCount} old backups`);
      return deletedCount;
    } catch (error) {
      logger.error('Error deleting old backups:', error);
      throw error;
    }
  }

  /**
   * Create the prefix path for S3 operations
   */
  private createPrefix(folder: string): string {
    let prefix = '';
    
    // Add global prefix if configured
    if (this.config.prefix) {
      prefix += `${this.config.prefix}/`;
    }
    
    // Add folder
    if (folder) {
      prefix += `${folder}/`;
    }
    
    return prefix;
  }
}

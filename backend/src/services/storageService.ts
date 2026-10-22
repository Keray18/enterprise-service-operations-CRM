import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../logging/logger.js';

export interface StoredFileInfo {
  fileName: string;
  originalName: string;
  storedPath: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Checksum: string;
}

export class StorageService {
  private baseDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), 'uploads', 'attachments');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Allowed MIME types and extensions for evidence uploads.
   */
  private readonly ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
  ]);

  private readonly ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf']);

  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

  /**
   * Validates and saves an uploaded file buffer into the private storage directory.
   */
  async saveFile(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  }): Promise<StoredFileInfo> {
    if (!file || !file.buffer) {
      throw new AppError('No file content provided', 400, 'FILE_MISSING');
    }

    if (file.size > this.MAX_FILE_SIZE || file.buffer.length > this.MAX_FILE_SIZE) {
      throw new AppError(
        `File size exceeds maximum allowed limit of ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`,
        400,
        'FILE_TOO_LARGE'
      );
    }

    const mime = file.mimetype.toLowerCase();
    if (!this.ALLOWED_MIME_TYPES.has(mime)) {
      throw new AppError(
        `Unsupported file type '${file.mimetype}'. Only JPEG, PNG, WEBP, GIF, and PDF are permitted.`,
        400,
        'INVALID_FILE_TYPE'
      );
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!this.ALLOWED_EXTENSIONS.has(ext)) {
      throw new AppError(
        `Unsupported file extension '${ext}'. Allowed extensions: ${Array.from(this.ALLOWED_EXTENSIONS).join(', ')}`,
        400,
        'INVALID_FILE_EXTENSION'
      );
    }

    // Generate safe, server-controlled unique file name
    const randomHex = crypto.randomBytes(16).toString('hex');
    const safeFileName = `${Date.now()}_${randomHex}${ext}`;
    const destinationPath = path.join(this.baseDir, safeFileName);

    // Path traversal defense
    const resolvedPath = path.resolve(destinationPath);
    if (!resolvedPath.startsWith(this.baseDir)) {
      throw new AppError('Invalid destination path traversal detected', 400, 'PATH_TRAVERSAL_ATTEMPT');
    }

    // Compute cryptographic SHA256 checksum
    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Write file to disk
    await fs.promises.writeFile(destinationPath, file.buffer);

    logger.info(`[STORAGE SERVICE] Saved evidence file: ${safeFileName} (${file.size} bytes)`);

    return {
      fileName: safeFileName,
      originalName: path.basename(file.originalname),
      storedPath: destinationPath,
      mimeType: mime,
      fileSizeBytes: file.buffer.length,
      sha256Checksum: sha256,
    };
  }

  /**
   * Retrieves a readable stream for an authorized attachment download.
   */
  async getFileStream(storedPath: string): Promise<{ stream: fs.ReadStream; size: number }> {
    const resolved = path.resolve(storedPath);
    if (!resolved.startsWith(this.baseDir)) {
      throw new AppError('Path traversal detected', 403, 'FORBIDDEN_FILE_ACCESS');
    }

    if (!fs.existsSync(resolved)) {
      throw new AppError('Requested file not found on disk', 404, 'FILE_NOT_FOUND');
    }

    const stat = await fs.promises.stat(resolved);
    const stream = fs.createReadStream(resolved);
    return { stream, size: stat.size };
  }

  /**
   * Deletes a stored file from disk.
   */
  async deleteFile(storedPath: string): Promise<void> {
    const resolved = path.resolve(storedPath);
    if (!resolved.startsWith(this.baseDir)) {
      throw new AppError('Path traversal detected', 403, 'FORBIDDEN_FILE_ACCESS');
    }

    if (fs.existsSync(resolved)) {
      await fs.promises.unlink(resolved);
      logger.info(`[STORAGE SERVICE] Removed file from storage: ${resolved}`);
    }
  }
}

export const storageService = new StorageService();

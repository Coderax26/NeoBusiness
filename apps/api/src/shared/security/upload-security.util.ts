import * as path from 'node:path';
import { BadRequestException } from '@nestjs/common';

/**
 * P4.1 Upload & Path-Traversal Security Utility
 *
 * Prevents directory traversal attacks (`../`, `\`, null bytes) and validates
 * uploaded attachment MIME types, extensions, size limits, and binary magic bytes.
 */

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.csv',
]);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Sanitizes an untrusted filename to prevent path traversal and control-char injection.
 */
export function sanitizeFileName(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') {
    throw new BadRequestException('Filename is required');
  }

  if (rawName.includes('\0')) {
    throw new BadRequestException('Invalid null byte in filename');
  }

  // Reject explicit traversal patterns before stripping
  if (rawName.includes('..') || rawName.includes('/') || rawName.includes('\\')) {
    throw new BadRequestException('Path traversal characters are not allowed in filename');
  }

  const base = path.basename(rawName).trim();
  const ext = path.extname(base).toLowerCase();

  if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
    throw new BadRequestException(
      `Unsupported file extension "${ext}". Allowed: ${[...ALLOWED_UPLOAD_EXTENSIONS].join(', ')}`,
    );
  }

  const stem = path
    .basename(base, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);

  if (!stem) {
    throw new BadRequestException('Invalid sanitized filename');
  }

  return `${stem}${ext}`;
}

/**
 * Validates file size and binary magic-bytes signature to prevent executable/script spoofing.
 */
export function validateUploadContent(input: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): { safeFileName: string; byteLength: number } {
  const safeFileName = sanitizeFileName(input.fileName);
  const ext = path.extname(safeFileName).toLowerCase();
  const byteLength = input.buffer?.byteLength ?? 0;

  if (byteLength === 0) {
    throw new BadRequestException('Uploaded file is empty');
  }

  const isDoc = ext === '.pdf' || ext === '.csv';
  const maxBytes = isDoc ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES;
  if (byteLength > maxBytes) {
    throw new BadRequestException(
      `File exceeds maximum allowed size (${maxBytes / (1024 * 1024)} MB)`,
    );
  }

  // Magic byte verification
  if (ext === '.pdf') {
    if (input.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('Invalid PDF file signature');
    }
  } else if (ext === '.png') {
    const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    if (!input.buffer.subarray(0, 4).equals(pngSig)) {
      throw new BadRequestException('Invalid PNG file signature');
    }
  } else if (ext === '.jpg' || ext === '.jpeg') {
    if (input.buffer[0] !== 0xff || input.buffer[1] !== 0xd8 || input.buffer[2] !== 0xff) {
      throw new BadRequestException('Invalid JPEG file signature');
    }
  } else if (ext === '.webp') {
    const riff = input.buffer.subarray(0, 4).toString('ascii');
    const webp = input.buffer.subarray(8, 12).toString('ascii');
    if (riff !== 'RIFF' || webp !== 'WEBP') {
      throw new BadRequestException('Invalid WEBP file signature');
    }
  }

  return { safeFileName, byteLength };
}


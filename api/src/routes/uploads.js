import { Router } from 'express';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Lazy-load heavy parsers so startup is unaffected if pkg not yet installed
let _pdfParse, _mammoth;
async function extractPdf(buffer) {
  if (!_pdfParse) _pdfParse = require('pdf-parse');
  const data = await _pdfParse(buffer);
  return data.text || '';
}
async function extractDocx(buffer) {
  if (!_mammoth) _mammoth = require('mammoth');
  const result = await _mammoth.extractRawText({ buffer });
  return result.value || '';
}

const router = Router();

// ─── S3/R2 Client ───
// AWS S3: set S3_REGION (e.g. us-east-1), leave S3_ENDPOINT unset
// Cloudflare R2 / custom: set S3_ENDPOINT, leave S3_REGION unset
const s3Config = {
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
};
if (process.env.S3_ENDPOINT) {
  s3Config.region = 'auto';
  s3Config.endpoint = process.env.S3_ENDPOINT;
} else {
  s3Config.region = process.env.S3_REGION || 'us-east-1';
}
const s3 = new S3Client(s3Config);

function getPublicUrl(key) {
  if (process.env.S3_PUBLIC_URL) return `${process.env.S3_PUBLIC_URL}/${key}`;
  // Auto-construct AWS S3 URL if no custom public URL set
  return `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

async function uploadToS3(buffer, key, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return getPublicUrl(key);
}

// POST /api/uploads/document/:businessId — Upload context document
router.post('/document/:businessId', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { businessId } = req.params;
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const key = `businesses/${businessId}/documents/${uuidv4()}.${ext}`;

    const fileUrl = await uploadToS3(req.file.buffer, key, req.file.mimetype);

    // Extract text based on file type
    let extractedText = '';
    if (['txt', 'md', 'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'json', 'csv', 'py'].includes(ext)) {
      extractedText = req.file.buffer.toString('utf-8');
    } else if (ext === 'pdf') {
      try {
        extractedText = await extractPdf(req.file.buffer);
      } catch (err) {
        console.error('PDF extraction error:', err.message);
        extractedText = '[EXTRACTION_FAILED: ' + err.message + ']';
      }
    } else if (ext === 'docx') {
      try {
        extractedText = await extractDocx(req.file.buffer);
      } catch (err) {
        console.error('DOCX extraction error:', err.message);
        extractedText = '[EXTRACTION_FAILED: ' + err.message + ']';
      }
    } else {
      extractedText = '[UNSUPPORTED_FORMAT]';
    }

    const result = await pool.query(
      `INSERT INTO context_documents (business_id, filename, file_url, file_type, file_size_bytes, extracted_text)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [businessId, req.file.originalname, fileUrl, ext, req.file.size, extractedText]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Upload document error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// POST /api/uploads/image/:businessId — Upload reference image
router.post('/image/:businessId', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { businessId } = req.params;
    const { label } = req.body;
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const key = `businesses/${businessId}/images/${uuidv4()}.${ext}`;

    const fileUrl = await uploadToS3(req.file.buffer, key, req.file.mimetype);

    const result = await pool.query(
      `INSERT INTO reference_images (business_id, filename, file_url, label, file_size_bytes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [businessId, req.file.originalname, fileUrl, label || null, req.file.size]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Upload image error:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// GET /api/uploads/documents/:businessId — List context documents
router.get('/documents/:businessId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, filename, file_url, file_type, file_size_bytes, uploaded_at
       FROM context_documents WHERE business_id = $1 ORDER BY uploaded_at DESC`,
      [req.params.businessId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List documents error:', err);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// DELETE /api/uploads/document/:businessId/:docId — Remove a document
router.delete('/document/:businessId/:docId', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM context_documents WHERE id = $1 AND business_id = $2`,
      [req.params.docId, req.params.businessId]
    );
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// GET /api/uploads/images/:businessId — List reference images
router.get('/images/:businessId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, filename, file_url, label, file_size_bytes, uploaded_at
       FROM reference_images WHERE business_id = $1 ORDER BY uploaded_at DESC`,
      [req.params.businessId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List images error:', err);
    res.status(500).json({ error: 'Failed to list images' });
  }
});

// DELETE /api/uploads/image/:businessId/:imageId — Remove a reference image
router.delete('/image/:businessId/:imageId', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM reference_images WHERE id = $1 AND business_id = $2`,
      [req.params.imageId, req.params.businessId]
    );
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete image error:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

export default router;

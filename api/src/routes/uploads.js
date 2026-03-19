import { Router } from 'express';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';

const router = Router();

// ─── S3/R2 Client ───
const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

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
  return `${process.env.S3_PUBLIC_URL}/${key}`;
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
    if (ext === 'txt') {
      extractedText = req.file.buffer.toString('utf-8');
    } else {
      // For PDF and DOCX, extraction happens in n8n or a separate service
      // Store raw for now, flag for processing
      extractedText = '[PENDING_EXTRACTION]';
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

export default router;

  // routes/crackers.js
const express = require('express');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const Cracker = require('../models/Cracker');
const streamifier = require('streamifier');
const mongoose = require('mongoose');

const router = express.Router();

// ---------- Multer: memory storage + limits + image-only filter ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|png|webp|gif|jpg)/i.test(file.mimetype);
    if (!ok) return cb(new Error('Only image files are allowed (jpeg, png, webp, gif)'));
    cb(null, true);
  },
});

// ---------- Helpers ----------
function uploadToCloudinary(buffer, folder = 'crackers-admin') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        overwrite: false,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

async function destroyFromCloudinary(publicId) {
  try {
    if (!publicId) return { result: 'no-op' };
    return await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
  } catch (err) {
    return { result: 'error', error: err?.message };
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function validateId(req, res, next) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid id format' });
  }
  next();
}

// Safely coerce numeric fields
function coerceNumbers(payload) {
  const out = { ...payload };
  if (out.originalRate !== undefined) out.originalRate = Number(out.originalRate);
  if (out.discountRate !== undefined) out.discountRate = Number(out.discountRate);
  return out;
}

// ---------- CREATE ----------
router.post(
  '/',
  upload.single('image'),
  asyncHandler(async (req, res) => {
    let uploaded = null;

    try {
      const body = coerceNumbers(req.body);

      if (req.file) {
        uploaded = await Promise.race([
          uploadToCloudinary(req.file.buffer),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Cloudinary upload timed out')), 60000)),
        ]);
      }

      const cracker = new Cracker({
        englishName: body.englishName,
        tamilName: body.tamilName,
        originalRate: body.originalRate,
        discountRate: body.discountRate,
        category: body.category,
        status: body.status !== undefined ? body.status : true, // ✅ default true
        imageUrl: uploaded?.secure_url || null,
        imagePublicId: uploaded?.public_id || null,
      });

      await cracker.save();
      return res.status(201).json(cracker);
    } catch (err) {
      if (uploaded?.public_id) {
        await destroyFromCloudinary(uploaded.public_id);
      }
      console.error('POST /crackers error:', err);
      return res.status(500).json({ error: 'Failed to create cracker', details: err.message });
    }
  })
);

// ---------- READ (list) ----------
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 100, sort = '-createdAt', onlyActive } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit)));

    const filter = onlyActive === 'true' ? { status: true } : {};

    const [items, total] = await Promise.all([
      Cracker.find(filter).sort(sort).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
      Cracker.countDocuments(filter),
    ]);

    res.json({
      items,
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    });
  })
);

// ---------- READ (single) ----------
router.get(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const cracker = await Cracker.findById(req.params.id).lean();
    if (!cracker) return res.status(404).json({ error: 'Not found' });
    res.json(cracker);
  })
);

// ---------- UPDATE ----------
router.put(
  '/:id',
  validateId,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const cracker = await Cracker.findById(req.params.id);
    if (!cracker) return res.status(404).json({ error: 'Not found' });

    const body = coerceNumbers(req.body);

    const updateData = {};
    ['englishName', 'tamilName', 'originalRate', 'discountRate', 'category', 'status'].forEach((k) => {
      if (body[k] !== undefined) updateData[k] = body[k];
    });

    let uploaded = null;
    try {
      if (req.file) {
        uploaded = await uploadToCloudinary(req.file.buffer);
        updateData.imageUrl = uploaded.secure_url;
        updateData.imagePublicId = uploaded.public_id;
      }

      const updated = await Cracker.findByIdAndUpdate(req.params.id, updateData, { new: true });

      if (req.file && cracker.imagePublicId && cracker.imagePublicId !== uploaded.public_id) {
        await destroyFromCloudinary(cracker.imagePublicId);
      }

      return res.json(updated);
    } catch (err) {
      if (uploaded?.public_id) {
        await destroyFromCloudinary(uploaded.public_id);
      }
      console.error('PUT /crackers error:', err);
      return res.status(500).json({ error: 'Failed to update cracker', details: err.message });
    }
  })
);

// ---------- TOGGLE STATUS (Show/Hide) ----------
router.patch(
  '/:id/status',
  validateId,
  asyncHandler(async (req, res) => {
    const { status } = req.body; // expects true/false
    const cracker = await Cracker.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!cracker) return res.status(404).json({ error: 'Not found' });
    res.json(cracker);
  })
);

// ---------- DELETE ----------
router.delete(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const cracker = await Cracker.findById(req.params.id);
    if (!cracker) return res.status(404).json({ error: 'Not found' });

    await Cracker.findByIdAndDelete(req.params.id);

    const cloudRes = await destroyFromCloudinary(cracker.imagePublicId);
    if (cloudRes.result === 'error') {
      console.error('Cloudinary delete error:', cloudRes.error || 'Unknown reason');
    }

    res.json({ message: 'Deleted successfully' });
  })
);

// ---------- Error Handler ----------
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size should not exceed 5 MB' });
    }
    return res.status(400).json({ error: err.message });
  }

  if (err?.message?.includes('Only image files are allowed')) {
    return res.status(400).json({ error: err.message });
  }

  console.error('Unhandled route error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

module.exports = router;

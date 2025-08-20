const mongoose = require('mongoose');

const CrackerSchema = new mongoose.Schema({
  englishName: { type: String, required: true },
  tamilName: { type: String, required: true },
  originalRate: { type: Number, required: true },
  discountRate: { type: Number, required: true },
  imageUrl: { type: String },
  imagePublicId: { type: String },
  category: { type: String, required: true },
  status: { type: Boolean, default: true }   // ✅ add this
}, { timestamps: true });

module.exports = mongoose.model('Cracker', CrackerSchema);

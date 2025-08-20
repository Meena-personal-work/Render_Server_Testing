const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    orderDate: { type: String, required: true },
    customerName: { type: String, required: true },
    customerNumber: { type: String, required: true },
    customerAddress: { type: String, required: true },
    customerState: { type: String, required: true },
    totalRate: { type: Number, required: true },

    // New field
    status: {
      type: String,
      enum: ["pending", "dispatched"],
      default: "pending",
    },

    items: [
      {
        name: { type: String, required: true },
        tamilName: { type: String },
        quantity: { type: Number, required: true },
        rate: { type: Number, required: true },
        amount: { type: Number, required: true },
        category: { type: String },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", OrderSchema);

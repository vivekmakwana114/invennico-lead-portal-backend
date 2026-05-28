const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const creditTransactionSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['grant', 'refill', 'consume'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      // positive for grant/refill, -1 for consume
    },
    leadId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Lead',
      default: null,
    },
    grantedBy: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      default: null,
    },
    note: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // immutable ledger — no updatedAt
  }
);

creditTransactionSchema.plugin(toJSON);

const CreditTransaction = mongoose.model('CreditTransaction', creditTransactionSchema);

module.exports = CreditTransaction;

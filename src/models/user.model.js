const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const { toJSON, paginate } = require('./plugins');
const { roles } = require('../config/roles');

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error('Invalid email');
        }
      },
    },
    password: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      validate(value) {
        if (!value.match(/[A-Z]/) || !value.match(/\d/) || !value.match(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/)) {
          throw new Error('Password must contain at least one uppercase letter, one number, and one special character');
        }
      },
      private: true,
    },
    role: {
      type: String,
      enum: roles,
      default: 'partner',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    department: {
      type: String,
      trim: true,
      default: null,
    },
    location: {
      type: String,
      trim: true,
      default: null,
    },
    avatar: {
      type: String,
      default: null,
    },
    otp: {
      type: String,
      default: null,
      private: true,
    },
    otpExpires: {
      type: Date,
      default: null,
      private: true,
    },
    totalCredits: {
      type: Number,
      default: 0,
      min: 0,
    },
    consumedCredits: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.plugin(toJSON);
userSchema.plugin(paginate);

userSchema.virtual('availableCredits').get(function () {
  return this.totalCredits - this.consumedCredits;
});

userSchema.statics.isEmailTaken = async function (email, excludeUserId) {
  const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
  return !!user;
};

userSchema.methods.isPasswordMatch = async function (password) {
  return bcrypt.compare(password, this.password);
};

userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 8);
  }
  // next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;

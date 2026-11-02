const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'الاسم مطلوب'], trim: true },
    email: {
      type: String,
      required: [true, 'البريد الإلكتروني مطلوب'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'صيغة البريد الإلكتروني غير صحيحة'],
    },
    password: {
      type: String,
      required: [true, 'كلمة المرور مطلوبة'],
      minlength: [6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'],
      select: false,
    },
    role: {
      type: String,
      enum: ['employee', 'manager', 'admin'],
      default: 'employee',
    },
    // Employees are assigned to a manager so managers can view "team" data
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isActive: { type: Boolean, default: true },
    // The one device allowed to sign in (see utils/device.js). Set on the
    // first sign-in; an admin can reset it when the employee changes phone.
    deviceIdHash: { type: String, default: null, select: false },
    deviceLabel: { type: String, default: null },
    deviceRegisteredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    manager: this.manager,
    isActive: this.isActive,
    device: this.deviceRegisteredAt ? { label: this.deviceLabel, registeredAt: this.deviceRegisteredAt } : null,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);

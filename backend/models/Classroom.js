const mongoose = require("mongoose");
const crypto = require("crypto");

const classroomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: "",
  },
  section: {
    type: String,
    default: "",
    trim: true,
  },
  subject: {
    type: String,
    default: "",
    trim: true,
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  enrollmentCode: {
    type: String,
    unique: true,
  },
  students: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Generate a unique 6-character enrollment code before saving
classroomSchema.pre("validate", async function (next) {
  if (!this.enrollmentCode) {
    let code;
    let exists = true;
    // Keep generating until we find a unique code
    while (exists) {
      code = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6 hex chars
      exists = await mongoose.model("Classroom").findOne({ enrollmentCode: code });
    }
    this.enrollmentCode = code;
  }
  next();
});

// Update timestamp on save
classroomSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual: student count
classroomSchema.virtual("studentCount").get(function () {
  return this.students ? this.students.length : 0;
});

// Include virtuals in JSON
classroomSchema.set("toJSON", { virtuals: true });
classroomSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Classroom", classroomSchema);

const mongoose = require("mongoose");

const proctoringSessionSchema = new mongoose.Schema({
  submissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Submission",
    required: true,
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Exam",
    required: true,
  },
  // Session info
  startedAt: {
    type: Date,
    default: Date.now,
  },
  endedAt: {
    type: Date,
  },
  status: {
    type: String,
    enum: ["active", "paused", "ended", "flagged"],
    default: "active",
  },
  // Device and browser info
  deviceInfo: {
    browser: String,
    os: String,
    screenResolution: String,
    ipAddress: String,
    userAgent: String,
  },
  // Monitoring data
  events: [
    {
      type: {
        type: String,
        enum: [
          "tab_switch",
          "fullscreen_exit",
          "face_not_detected",
          "multiple_faces",
          "audio_detected",
          "copy_paste",
          "right_click",
          "suspicious_movement",
          "browser_resize",
          "dev_tools_opened",
          "webcam_disabled",
          "focus_lost",
          "focus_returned",
          "tab_returned",
          "keyboard_shortcut",
          "screenshot_attempt",
        ],
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
      severity: {
        type: String,
        enum: ["low", "medium", "high"],
        default: "medium",
      },
      details: String,
      screenshot: String,
    },
  ],
  // Face detection
  faceDetectionEnabled: {
    type: Boolean,
    default: true,
  },
  faceDetectionResults: [
    {
      timestamp: Date,
      facesDetected: Number,
      confidence: Number,
      screenshot: String,
    },
  ],
  // Audio monitoring
  audioMonitoringEnabled: {
    type: Boolean,
    default: false,
  },
  audioEvents: [
    {
      timestamp: Date,
      type: String, // 'speech', 'noise', 'silence'
      duration: Number,
    },
  ],
  // Trust score calculation
  trustScore: {
    type: Number,
    default: 100,
  },
  trustScoreHistory: [
    {
      timestamp: Date,
      score: Number,
      reason: String,
    },
  ],
  // Screenshots taken during exam
  screenshots: [
    {
      timestamp: Date,
      image: String,
      reason: String,
    },
  ],
  // Proctor notes and review
  reviewStatus: {
    type: String,
    enum: ["pending", "reviewed", "cleared", "flagged"],
    default: "pending",
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  reviewNotes: String,
  reviewedAt: Date,
  // Summary
  summary: {
    totalEvents: {
      type: Number,
      default: 0,
    },
    highSeverityEvents: {
      type: Number,
      default: 0,
    },
    averageFacesDetected: {
      type: Number,
      default: 1,
    },
    totalTabSwitches: {
      type: Number,
      default: 0,
    },
    totalFullscreenExits: {
      type: Number,
      default: 0,
    },
  },
});

// Update summary before saving
proctoringSessionSchema.pre("save", function (next) {
  if (this.events && this.events.length > 0) {
    this.summary.totalEvents = this.events.length;
    this.summary.highSeverityEvents = this.events.filter(
      (e) => e.severity === "high",
    ).length;
    this.summary.totalTabSwitches = this.events.filter(
      (e) => e.type === "tab_switch",
    ).length;
    this.summary.totalFullscreenExits = this.events.filter(
      (e) => e.type === "fullscreen_exit",
    ).length;
  }
  next();
});

// Index for efficient queries
proctoringSessionSchema.index({ studentId: 1, examId: 1 });
proctoringSessionSchema.index({ status: 1, reviewStatus: 1 });

module.exports = mongoose.model("ProctoringSession", proctoringSessionSchema);

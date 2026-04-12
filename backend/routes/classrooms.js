const express = require("express");
const router = express.Router();
const Classroom = require("../models/Classroom");
const Exam = require("../models/Exam");
const User = require("../models/User");
const verifyFirebaseToken = require("../middleware/auth");

// ────────────────────────────────────────────────────────────────────────────
// POST /  — Create a new classroom (Teacher / Admin only)
// ────────────────────────────────────────────────────────────────────────────
router.post("/", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user || (user.role !== "teacher" && user.role !== "admin")) {
      return res.status(403).json({ message: "Only teachers can create classrooms" });
    }

    const { name, description, section, subject } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Classroom name is required" });
    }

    const classroom = new Classroom({
      name: name.trim(),
      description: description || "",
      section: section || "",
      subject: subject || "",
      teacherId: user._id,
    });

    await classroom.save();

    res.status(201).json({ classroom, message: "Classroom created successfully" });
  } catch (error) {
    console.error("Error creating classroom:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /  — List classrooms
//   Teacher/Admin → owned classrooms
//   Student      → all active classrooms (for browsing / discovery)
// ────────────────────────────────────────────────────────────────────────────
router.get("/", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) return res.status(404).json({ message: "User not found" });

    let classrooms;
    if (user.role === "teacher") {
      classrooms = await Classroom.find({ teacherId: user._id, isActive: true })
        .populate("teacherId", "name email")
        .sort({ createdAt: -1 });
    } else if (user.role === "admin") {
      classrooms = await Classroom.find({ isActive: true })
        .populate("teacherId", "name email")
        .sort({ createdAt: -1 });
    } else {
      // Students see all active classrooms for browsing
      classrooms = await Classroom.find({ isActive: true })
        .populate("teacherId", "name email")
        .sort({ createdAt: -1 });
    }

    // For each classroom, attach the exam count
    const classroomIds = classrooms.map((c) => c._id);
    const examCounts = await Exam.aggregate([
      { $match: { classroomId: { $in: classroomIds }, isActive: true } },
      { $group: { _id: "$classroomId", count: { $sum: 1 } } },
    ]);
    const examCountMap = {};
    examCounts.forEach((e) => {
      examCountMap[e._id.toString()] = e.count;
    });

    const result = classrooms.map((c) => {
      const obj = c.toObject();
      obj.examCount = examCountMap[c._id.toString()] || 0;
      obj.isEnrolled = c.students.some(
        (s) => s.toString() === user._id.toString()
      );
      return obj;
    });

    res.json({ classrooms: result });
  } catch (error) {
    console.error("Error fetching classrooms:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /enrolled  — Classrooms the student is enrolled in
// ────────────────────────────────────────────────────────────────────────────
router.get("/enrolled", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) return res.status(404).json({ message: "User not found" });

    const classrooms = await Classroom.find({
      students: user._id,
      isActive: true,
    })
      .populate("teacherId", "name email")
      .sort({ createdAt: -1 });

    // Attach exam counts
    const classroomIds = classrooms.map((c) => c._id);
    const examCounts = await Exam.aggregate([
      { $match: { classroomId: { $in: classroomIds }, isActive: true } },
      { $group: { _id: "$classroomId", count: { $sum: 1 } } },
    ]);
    const examCountMap = {};
    examCounts.forEach((e) => {
      examCountMap[e._id.toString()] = e.count;
    });

    const result = classrooms.map((c) => {
      const obj = c.toObject();
      obj.examCount = examCountMap[c._id.toString()] || 0;
      obj.isEnrolled = true;
      return obj;
    });

    res.json({ classrooms: result });
  } catch (error) {
    console.error("Error fetching enrolled classrooms:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /:id  — Get single classroom details
// ────────────────────────────────────────────────────────────────────────────
router.get("/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) return res.status(404).json({ message: "User not found" });

    const classroom = await Classroom.findById(req.params.id)
      .populate("teacherId", "name email")
      .populate("students", "name email");

    if (!classroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    const obj = classroom.toObject();

    // Attach exam count
    const examCount = await Exam.countDocuments({
      classroomId: classroom._id,
      isActive: true,
    });
    obj.examCount = examCount;
    obj.isEnrolled = classroom.students.some(
      (s) => (s._id || s).toString() === user._id.toString()
    );

    // Only show enrollment code to teacher/admin owner
    if (
      user.role !== "teacher" &&
      user.role !== "admin"
    ) {
      // Students can still see the code if enrolled, otherwise hide it
      if (!obj.isEnrolled) {
        delete obj.enrollmentCode;
      }
    }

    res.json({ classroom: obj });
  } catch (error) {
    console.error("Error fetching classroom:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /:id/enroll  — Student enrolls in a classroom by ID
// ────────────────────────────────────────────────────────────────────────────
router.post("/:id/enroll", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role !== "student") {
      return res.status(403).json({ message: "Only students can enroll in classrooms" });
    }

    const classroom = await Classroom.findById(req.params.id);
    if (!classroom || !classroom.isActive) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    // Check duplicate enrollment
    if (classroom.students.some((s) => s.toString() === user._id.toString())) {
      return res.status(400).json({ message: "Already enrolled in this classroom" });
    }

    classroom.students.push(user._id);
    await classroom.save();

    res.json({ message: "Enrolled successfully", classroom });
  } catch (error) {
    console.error("Error enrolling:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /enroll-code  — Student enrolls by 6-char enrollment code
// ────────────────────────────────────────────────────────────────────────────
router.post("/enroll-code", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role !== "student") {
      return res.status(403).json({ message: "Only students can enroll in classrooms" });
    }

    const { code } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ message: "Enrollment code is required" });
    }

    const classroom = await Classroom.findOne({
      enrollmentCode: code.trim().toUpperCase(),
      isActive: true,
    });

    if (!classroom) {
      return res.status(404).json({ message: "Invalid enrollment code" });
    }

    // Check duplicate enrollment
    if (classroom.students.some((s) => s.toString() === user._id.toString())) {
      return res.status(400).json({ message: "Already enrolled in this classroom" });
    }

    classroom.students.push(user._id);
    await classroom.save();

    res.json({ message: "Enrolled successfully", classroom });
  } catch (error) {
    console.error("Error enrolling by code:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE /:id/unenroll  — Student leaves a classroom
// ────────────────────────────────────────────────────────────────────────────
router.delete("/:id/unenroll", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role !== "student") {
      return res.status(403).json({ message: "Only students can unenroll" });
    }

    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    const idx = classroom.students.findIndex(
      (s) => s.toString() === user._id.toString()
    );
    if (idx === -1) {
      return res.status(400).json({ message: "Not enrolled in this classroom" });
    }

    classroom.students.splice(idx, 1);
    await classroom.save();

    res.json({ message: "Unenrolled successfully" });
  } catch (error) {
    console.error("Error unenrolling:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PUT /:id  — Update classroom (Teacher owner / Admin)
// ────────────────────────────────────────────────────────────────────────────
router.put("/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user || (user.role !== "teacher" && user.role !== "admin")) {
      return res.status(403).json({ message: "Only teachers can update classrooms" });
    }

    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    // Teacher can only update their own
    if (
      user.role === "teacher" &&
      classroom.teacherId.toString() !== user._id.toString()
    ) {
      return res.status(403).json({ message: "You can only update your own classrooms" });
    }

    const { name, description, section, subject } = req.body;
    if (name !== undefined) classroom.name = name.trim();
    if (description !== undefined) classroom.description = description;
    if (section !== undefined) classroom.section = section;
    if (subject !== undefined) classroom.subject = subject;

    await classroom.save();

    res.json({ classroom, message: "Classroom updated successfully" });
  } catch (error) {
    console.error("Error updating classroom:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE /:id  — Soft-delete classroom (Teacher owner / Admin)
// ────────────────────────────────────────────────────────────────────────────
router.delete("/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user || (user.role !== "teacher" && user.role !== "admin")) {
      return res.status(403).json({ message: "Only teachers can delete classrooms" });
    }

    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    if (
      user.role === "teacher" &&
      classroom.teacherId.toString() !== user._id.toString()
    ) {
      return res.status(403).json({ message: "You can only delete your own classrooms" });
    }

    classroom.isActive = false;
    await classroom.save();

    res.json({ message: "Classroom deleted successfully" });
  } catch (error) {
    console.error("Error deleting classroom:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /:id/exams  — List exams in a classroom (with time-window status)
// ────────────────────────────────────────────────────────────────────────────
router.get("/:id/exams", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) return res.status(404).json({ message: "User not found" });

    const classroom = await Classroom.findById(req.params.id);
    if (!classroom || !classroom.isActive) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    // Verify access: teacher owner, admin, or enrolled student
    const isOwner = classroom.teacherId.toString() === user._id.toString();
    const isAdmin = user.role === "admin";
    const isEnrolled = classroom.students.some(
      (s) => s.toString() === user._id.toString()
    );

    if (!isOwner && !isAdmin && !isEnrolled) {
      return res.status(403).json({ message: "You must be enrolled to view exams" });
    }

    let exams = await Exam.find({
      classroomId: classroom._id,
      isActive: true,
    }).sort({ scheduledAt: -1 });

    const now = new Date();

    // For students, strip correct answers and add time-window status
    if (user.role === "student") {
      exams = exams.map((exam) => {
        const examObj = exam.toObject();
        // Strip correct answers
        examObj.questions = examObj.questions.map((q) => {
          const { correctAnswer, modelAnswer, ...rest } = q;
          return rest;
        });

        // Add access status
        const scheduledAt = new Date(examObj.scheduledAt);
        const endTime = new Date(examObj.endTime);
        if (now < scheduledAt) {
          examObj.accessStatus = "upcoming";
        } else if (now >= scheduledAt && now <= endTime) {
          examObj.accessStatus = "available";
        } else {
          examObj.accessStatus = "ended";
        }
        return examObj;
      });
    }

    res.json({ exams });
  } catch (error) {
    console.error("Error fetching classroom exams:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /:id/students  — List enrolled students (Teacher owner / Admin)
// ────────────────────────────────────────────────────────────────────────────
router.get("/:id/students", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user || (user.role !== "teacher" && user.role !== "admin")) {
      return res.status(403).json({ message: "Only teachers can view students" });
    }

    const classroom = await Classroom.findById(req.params.id).populate(
      "students",
      "name email createdAt"
    );

    if (!classroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    if (
      user.role === "teacher" &&
      classroom.teacherId.toString() !== user._id.toString()
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json({ students: classroom.students });
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;

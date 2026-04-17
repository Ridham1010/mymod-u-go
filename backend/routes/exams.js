const express = require("express");
const router = express.Router();
const Exam = require("../models/Exam");
const User = require("../models/User");
const Classroom = require("../models/Classroom");
const verifyFirebaseToken = require("../middleware/auth");

// Create a new exam (Teacher only)
router.post("/", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user || (user.role !== "teacher" && user.role !== "admin")) {
      return res
        .status(403)
        .json({ message: "Only teachers can create exams" });
    }

    let { title, description, questions, scheduledAt, duration, settings, classroomId } =
      req.body;

    // Resolve classroomId from enrollmentCode if needed
    if (classroomId && classroomId.length === 6) {
      const classroom = await Classroom.findOne({ enrollmentCode: classroomId });
      if (classroom) {
        classroomId = classroom._id.toString();
      }
    }

    // If classroomId provided, verify teacher owns the classroom
    if (classroomId) {
      const classroom = await Classroom.findById(classroomId);
      if (!classroom || !classroom.isActive) {
        return res.status(404).json({ message: "Classroom not found" });
      }
      if (
        user.role === "teacher" &&
        classroom.teacherId.toString() !== user._id.toString()
      ) {
        return res.status(403).json({ message: "You do not own this classroom" });
      }
    }

    const scheduledDate = new Date(scheduledAt);
    const endTime = new Date(scheduledDate.getTime() + duration * 60000);

    const exam = new Exam({
      title,
      description,
      teacherId: user._id,
      classroomId: classroomId || null,
      questions,
      scheduledAt: scheduledDate,
      duration,
      endTime,
      settings: settings || {},
    });

    await exam.save();

    res.status(201).json({ exam, message: "Exam created successfully" });
  } catch (error) {
    console.error("Error creating exam:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all exams (Teacher sees their exams, Student sees active exams)
router.get("/", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let exams;
    if (user.role === "teacher") {
      exams = await Exam.find({ teacherId: user._id }).sort({ createdAt: -1 });
    } else if (user.role === "admin") {
      exams = await Exam.find({}).sort({ createdAt: -1 });
    } else if (user.role === "proctor") {
      exams = await Exam.find({ isActive: true }).sort({ scheduledAt: -1 });
    } else {
      // Students see exams from enrolled classrooms + unassigned (legacy) exams
      const enrolledClassrooms = await Classroom.find({
        students: user._id,
        isActive: true,
      }).select("_id");
      const enrolledIds = enrolledClassrooms.map((c) => c._id);

      exams = await Exam.find({
        isActive: true,
        $or: [
          { classroomId: { $in: enrolledIds } },
          { classroomId: null },
        ],
      }).sort({ scheduledAt: -1 });
    }

    res.json({ exams });
  } catch (error) {
    console.error("Error getting exams:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get a single exam by ID
router.get("/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Students cannot see correct answers
    if (user.role === "student") {
      const examData = exam.toObject();
      examData.questions = examData.questions.map((q) => {
        const questionObj = q.toObject ? q.toObject() : q;
        const { correctAnswer, ...questionWithoutAnswer } = questionObj;
        return questionWithoutAnswer;
      });
      return res.json({ exam: examData });
    }

    // Teachers, proctors, and admins can see full exam with answers
    res.json({ exam });
  } catch (error) {
    console.error("Error getting exam:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update an exam (Teacher only)
router.put("/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user || (user.role !== "teacher" && user.role !== "admin")) {
      return res
        .status(403)
        .json({ message: "Only teachers can update exams" });
    }

    const exam = await Exam.findById(req.params.id);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    // Admin can update any exam, teacher can only update their own
    if (
      user.role === "teacher" &&
      exam.teacherId.toString() !== user._id.toString()
    ) {
      return res
        .status(403)
        .json({ message: "You can only update your own exams" });
    }

    const {
      title,
      description,
      questions,
      scheduledAt,
      duration,
      isActive,
      settings,
    } = req.body;

    let { classroomId } = req.body;

    if (classroomId && classroomId.length === 6) {
      const classroom = await Classroom.findOne({ enrollmentCode: classroomId });
      if (classroom) {
        classroomId = classroom._id.toString();
      }
    }

    if (title) exam.title = title;
    if (description !== undefined) exam.description = description;
    if (questions) exam.questions = questions;
    if (classroomId !== undefined) exam.classroomId = classroomId;
    if (scheduledAt) {
      exam.scheduledAt = new Date(scheduledAt);
      if (duration) {
        exam.endTime = new Date(exam.scheduledAt.getTime() + duration * 60000);
      }
    }
    if (duration) {
      exam.duration = duration;
      exam.endTime = new Date(exam.scheduledAt.getTime() + duration * 60000);
    }
    if (isActive !== undefined) exam.isActive = isActive;
    if (settings) exam.settings = { ...exam.settings, ...settings };

    await exam.save();

    res.json({ exam, message: "Exam updated successfully" });
  } catch (error) {
    console.error("Error updating exam:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete an exam (Teacher only)
router.delete("/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user || user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "Only teachers can delete exams" });
    }

    const exam = await Exam.findById(req.params.id);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    if (exam.teacherId.toString() !== user._id.toString()) {
      return res
        .status(403)
        .json({ message: "You can only delete your own exams" });
    }

    await Exam.findByIdAndDelete(req.params.id);

    res.json({ message: "Exam deleted successfully" });
  } catch (error) {
    console.error("Error deleting exam:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;

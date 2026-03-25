/**
 * Grading Routes — Status, Override, Regrade
 *
 * Provides API endpoints for checking grading status,
 * manual score overrides by teachers, and re-triggering SLM grading.
 */

const express = require("express");
const router = express.Router();
const Submission = require("../models/Submission");
const Exam = require("../models/Exam");
const User = require("../models/User");
const Notification = require("../models/Notification");
const verifyFirebaseToken = require("../middleware/auth");
const { enqueueGrading } = require("../services/gradingQueue");

/**
 * GET /api/grading/:submissionId/status
 * Check the grading status of a submission (polling endpoint).
 */
router.get("/:submissionId/status", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const submission = await Submission.findById(req.params.submissionId)
      .populate("examId", "title questions");

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    // Access control: student sees own, teacher sees own exams
    if (
      user.role === "student" &&
      submission.studentId.toString() !== user._id.toString()
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (
      user.role === "teacher" &&
      submission.examId.teacherId &&
      submission.examId.teacherId.toString() !== user._id.toString()
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Build per-answer status summary
    const answerStatuses = submission.answers.map((a) => ({
      questionId: a.questionId,
      gradingStatus: a.gradingStatus,
      gradingMethod: a.gradingMethod,
      marksAwarded: a.marksAwarded,
      slmScore: a.slmScore,
    }));

    const pendingCount = submission.answers.filter(
      (a) => a.gradingStatus === "pending_review" || a.gradingStatus === "ungraded"
    ).length;

    const gradedCount = submission.answers.filter(
      (a) => a.gradingStatus === "graded"
    ).length;

    res.json({
      submissionId: submission._id,
      status: submission.status,
      score: submission.score,
      maxScore: submission.maxScore,
      percentage: submission.percentage,
      gradingCompletedAt: submission.gradingCompletedAt,
      totalAnswers: submission.answers.length,
      gradedCount,
      pendingCount,
      answerStatuses,
    });
  } catch (error) {
    console.error("Error getting grading status:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * PUT /api/grading/:submissionId/override
 * Teacher manually overrides score for specific answers.
 *
 * Body: { overrides: [{ questionId, marksAwarded, reviewNotes }] }
 */
router.put("/:submissionId/override", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { overrides } = req.body;
    if (!overrides || !Array.isArray(overrides)) {
      return res.status(400).json({ message: "overrides array is required" });
    }

    const submission = await Submission.findById(req.params.submissionId)
      .populate("examId");

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    // Teacher can only override scores for their own exam
    if (
      user.role === "teacher" &&
      submission.examId.teacherId.toString() !== user._id.toString()
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Apply overrides
    let totalScore = 0;
    for (const answer of submission.answers) {
      const override = overrides.find(
        (o) => o.questionId === answer.questionId.toString()
      );

      if (override) {
        answer.marksAwarded = override.marksAwarded;
        answer.gradingStatus = "graded";
        answer.gradingMethod = "manual";
        answer.updatedAt = new Date();
      }

      totalScore += answer.marksAwarded || 0;
    }

    submission.score = totalScore;
    submission.reviewedBy = user._id;
    submission.reviewedAt = new Date();

    // Check if all answers are now graded
    const allGraded = submission.answers.every(
      (a) => a.gradingStatus === "graded"
    );

    if (allGraded) {
      submission.status = "graded";
      submission.gradingCompletedAt = new Date();
    }

    await submission.save();

    // Notify student
    await Notification.create({
      userId: submission.studentId,
      type: "exam_graded",
      title: "Score Updated",
      message: `Your score for "${submission.examId.title}" has been manually reviewed`,
      data: { submissionId: submission._id },
      priority: "medium",
    });

    res.json({
      submission,
      message: "Scores overridden successfully",
    });
  } catch (error) {
    console.error("Error overriding scores:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * POST /api/grading/:submissionId/regrade
 * Re-trigger SLM grading for pending/errored answers.
 */
router.post("/:submissionId/regrade", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user || !["teacher", "admin"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const submission = await Submission.findById(req.params.submissionId)
      .populate("examId");

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    // Teacher can only regrade their own exam submissions
    if (
      user.role === "teacher" &&
      submission.examId.teacherId.toString() !== user._id.toString()
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Reset pending/errored answers to ungraded
    for (const answer of submission.answers) {
      if (
        answer.gradingStatus === "pending_review" ||
        answer.gradingStatus === "error"
      ) {
        answer.gradingStatus = "ungraded";
        answer.slmScore = null;
        answer.marksAwarded = 0;
      }
    }

    submission.status = "grading";
    await submission.save();

    // Enqueue for re-grading
    const queueResult = await enqueueGrading(submission._id.toString());

    res.json({
      message: "Re-grading initiated",
      async: queueResult.async,
      submission: queueResult.async ? undefined : await Submission.findById(submission._id),
    });
  } catch (error) {
    console.error("Error re-grading:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;

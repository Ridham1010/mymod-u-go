/**
 * Grading Queue — Async Worker via Bull/Redis
 *
 * Processes SLM grading jobs asynchronously.
 * Falls back to synchronous grading if Redis is unavailable.
 */

const Submission = require("../models/Submission");
const Exam = require("../models/Exam");
const { gradeSubmission } = require("./autoGrader");

let Queue;
let gradingQueue = null;
let redisAvailable = false;

/**
 * Initialize the grading queue.
 * Tries to connect to Redis; falls back to sync mode if unavailable.
 */
async function initGradingQueue() {
  try {
    Queue = require("bull");
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

    const queueOptions = {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    };

    // Upstash requires TLS headers. If the user used redis:// instead of rediss://, 
    // it connects but drops commands immediately, leading to MaxRetriesPerRequestError.
    if (redisUrl.includes("upstash.io") || redisUrl.startsWith("rediss://")) {
      queueOptions.redis = {
        tls: { rejectUnauthorized: false },
        maxRetriesPerRequest: 3, // Prevent hanging forever
      };
    }

    gradingQueue = new Queue("grading", redisUrl, queueOptions);

    // Test Redis connection
    await gradingQueue.isReady();
    redisAvailable = true;
    console.log(" Grading queue connected to Redis");

    // Register the worker/processor
    gradingQueue.process("grade-submission", async (job) => {
      const { submissionId } = job.data;
      await processGradingJob(submissionId);
    });

    // Error handling
    gradingQueue.on("failed", (job, err) => {
      console.error(`ading job ${job.id} failed:`, err.message);
    });

    gradingQueue.on("completed", (job) => {
      console.log(` Grading job ${job.id} completed`);
    });

    return gradingQueue;
  } catch (error) {
    console.warn(
      " Redis not available — grading will run in background.",
      error.message
    );
    redisAvailable = false;
    return null;
  }
}

/**
 * Process a grading job — called by the queue worker or synchronously.
 */
async function processGradingJob(submissionId) {
  const submission = await Submission.findById(submissionId);
  if (!submission) {
    throw new Error(`Submission ${submissionId} not found`);
  }

  const exam = await Exam.findById(submission.examId);
  if (!exam) {
    throw new Error(`Exam ${submission.examId} not found`);
  }

  // Mark as grading
  submission.status = "grading";
  await submission.save();

  // Run the AutoGrader
  const result = await gradeSubmission(submission, exam);

  // Update submission with grading results
  submission.answers = result.gradedAnswers;
  submission.score = result.totalScore;

  if (result.hasPendingReview) {
    submission.status = "partially_graded";
  } else {
    submission.status = "graded";
    submission.gradingCompletedAt = new Date();
  }

  await submission.save();

  // Update exam statistics
  const allSubmissions = await Submission.find({
    examId: submission.examId,
    status: { $in: ["submitted", "graded", "partially_graded"] },
  });

  const gradedSubmissions = allSubmissions.filter(
    (s) => s.status === "graded" || s.status === "partially_graded"
  );

  const avgScore =
    gradedSubmissions.length > 0
      ? gradedSubmissions.reduce((sum, s) => sum + (s.percentage || 0), 0) /
      gradedSubmissions.length
      : 0;

  await Exam.findByIdAndUpdate(submission.examId, {
    totalSubmissions: allSubmissions.length,
    averageScore: Math.round(avgScore) || 0,
  });

  // Notify student that grading is complete
  const Notification = require("../models/Notification");
  if (result.hasPendingReview) {
    await Notification.create({
      userId: submission.studentId,
      type: "exam_graded",
      title: "Grading Partially Complete",
      message: `Your submission for "${exam.title}" has been partially graded. Score so far: ${result.totalScore}/${submission.maxScore}. Some answers need teacher review.`,
      data: { examId: exam._id, submissionId: submission._id },
      priority: "medium",
    });
  } else {
    await Notification.create({
      userId: submission.studentId,
      type: "exam_graded",
      title: "Grading Complete",
      message: `Your submission for "${exam.title}" has been graded! Score: ${result.totalScore}/${submission.maxScore} (${submission.percentage}%)`,
      data: { examId: exam._id, submissionId: submission._id },
      priority: "medium",
    });
  }

  return result;
}

/**
 * Enqueue a submission for async grading.
 * Falls back to synchronous grading if Redis is unavailable.
 *
 * @param {string} submissionId
 * @returns {Object} { async: boolean, result?: Object }
 */
async function enqueueGrading(submissionId) {
  if (redisAvailable && gradingQueue) {
    try {
      // Async: add job to queue
      await gradingQueue.add("grade-submission", { submissionId });
      return { async: true };
    } catch (error) {
      console.warn("Queue add failed (falling back to background memory):", error.message);
      processGradingJob(submissionId).catch((err) =>
        console.error("Background grading error:", err)
      );
      return { async: true };
    }
  } else {
    // Background fallback: process in background without Redis
    console.log("  Running grading in background (Redis unavailable)");
    processGradingJob(submissionId).catch((err) =>
      console.error("Background grading error:", err)
    );
    return { async: true };
  }
}

/**
 * Check if the queue is available.
 */
function isQueueAvailable() {
  return redisAvailable;
}

/**
 * Gracefully shutdown the queue.
 */
async function shutdownQueue() {
  if (gradingQueue) {
    await gradingQueue.close();
    console.log("Grading queue closed");
  }
}

module.exports = {
  initGradingQueue,
  enqueueGrading,
  processGradingJob,
  isQueueAvailable,
  shutdownQueue,
};

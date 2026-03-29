const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

// Mock axios before requiring autoGrader
jest.mock("axios");
const axios = require("axios");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  jest.clearAllMocks();
});

const {
  gradeSubmission,
  gradeMCQ,
  gradeTextAnswer,
  normalizeScore,
  buildSLMPrompt,
  EXACT_MATCH_TYPES,
  SLM_GRADED_TYPES,
} = require("../services/autoGrader");

const Submission = require("../models/Submission");
const Exam = require("../models/Exam");
const User = require("../models/User");

// ═══════════════════════════════════════════════════════════════════
// AUTOGRADER SERVICE TESTS
// ═══════════════════════════════════════════════════════════════════

describe("AutoGrader Service", () => {
  let teacher, student, exam;

  beforeEach(async () => {
    teacher = await User.create({
      firebaseUid: "teacher_uid",
      email: "teacher@test.com",
      name: "Teacher",
      role: "teacher",
    });

    student = await User.create({
      firebaseUid: "student_uid",
      email: "student@test.com",
      name: "Student",
      role: "student",
    });

    exam = await Exam.create({
      title: "Grading Test Exam",
      teacherId: teacher._id,
      questions: [
        {
          type: "mcq",
          question: "What is 2+2?",
          options: ["3", "4", "5"],
          correctAnswer: "4",
          modelAnswer: "4",
          points: 5,
        },
        {
          type: "true_false",
          question: "Is the sky blue?",
          options: ["True", "False"],
          correctAnswer: "True",
          modelAnswer: "True",
          points: 3,
        },
        {
          type: "short_answer",
          question: "What is photosynthesis?",
          correctAnswer: "The process by which plants convert sunlight into food",
          modelAnswer:
            "Photosynthesis is the process by which green plants use sunlight to synthesize food from carbon dioxide and water.",
          points: 10,
        },
        {
          type: "essay",
          question: "Explain the water cycle",
          correctAnswer: "The water cycle describes how water evaporates, condenses, and precipitates",
          modelAnswer:
            "The water cycle is the continuous movement of water within the Earth and atmosphere through evaporation, condensation, precipitation, and collection.",
          points: 20,
        },
      ],
      scheduledAt: new Date(),
      duration: 60,
      endTime: new Date(Date.now() + 60 * 60000),
    });
  });

  // ─── MCQ Exact Match ─────────────────────────────────────────────
  describe("gradeMCQ — Exact Match Grading", () => {
    test("should mark correct MCQ answer", () => {
      const result = gradeMCQ("4", "4");
      expect(result.isCorrect).toBe(true);
      expect(result.slmScore).toBe(1.0);
      expect(result.gradingStatus).toBe("graded");
      expect(result.gradingMethod).toBe("exact_match");
    });

    test("should mark incorrect MCQ answer", () => {
      const result = gradeMCQ("3", "4");
      expect(result.isCorrect).toBe(false);
      expect(result.slmScore).toBe(0.0);
      expect(result.gradingStatus).toBe("graded");
    });

    test("should be case-insensitive", () => {
      const result = gradeMCQ("true", "True");
      expect(result.isCorrect).toBe(true);
    });

    test("should trim whitespace", () => {
      const result = gradeMCQ("  4  ", "4");
      expect(result.isCorrect).toBe(true);
    });

    test("should handle empty/null student answer", () => {
      const result = gradeMCQ("", "4");
      expect(result.isCorrect).toBe(false);
    });

    test("should handle null student answer", () => {
      const result = gradeMCQ(null, "4");
      expect(result.isCorrect).toBe(false);
    });
  });

  // ─── Score Normalization ──────────────────────────────────────────
  describe("normalizeScore — Score-to-Marks Conversion", () => {
    test("should convert 0.75 × 10 points → 7.5 marks", () => {
      expect(normalizeScore(0.75, 10)).toBe(7.5);
    });

    test("should convert 1.0 × 20 points → 20 marks", () => {
      expect(normalizeScore(1.0, 20)).toBe(20);
    });

    test("should convert 0.0 × 10 points → 0 marks", () => {
      expect(normalizeScore(0.0, 10)).toBe(0);
    });

    test("should calculate exact score 0.33 × 10 → 3.3 marks", () => {
      expect(normalizeScore(0.33, 10)).toBe(3.3);
    });

    test("should calculate exact score 0.55 × 10 → 5.5 marks", () => {
      expect(normalizeScore(0.55, 10)).toBe(5.5);
    });
  });

  // ─── SLM Prompt Building ─────────────────────────────────────────
  describe("buildSLMPrompt — Prompt Template", () => {
    test("should build correct SLM prompt", () => {
      const prompt = buildSLMPrompt("The sky is blue", "Sky color is blue");
      expect(prompt).toContain("The sky is blue");
      expect(prompt).toContain("Sky color is blue");
      expect(prompt).toContain("0.0 to 1.0");
      expect(prompt).toContain("semantic similarity");
    });
  });

  // ─── Text-based Grading via SLM ──────────────────────────────────
  describe("gradeTextAnswer — SLM Semantic Grading", () => {
    test("should return score 0 for blank answer", async () => {
      const question = exam.questions[2]; // short_answer
      const result = await gradeTextAnswer("", question);

      expect(result.isCorrect).toBe(false);
      expect(result.slmScore).toBe(0.0);
      expect(result.marksAwarded).toBe(0);
      expect(result.gradingStatus).toBe("graded");
      expect(result.gradingMethod).toBe("slm_semantic");
    });

    test("should return score 0 for whitespace-only answer", async () => {
      const question = exam.questions[2];
      const result = await gradeTextAnswer("   ", question);

      expect(result.slmScore).toBe(0.0);
      expect(result.marksAwarded).toBe(0);
      expect(result.gradingStatus).toBe("graded");
    });

    test("should grade text answer with SLM score", async () => {
      // Mock SLM API to return 0.85
      axios.post.mockResolvedValueOnce({
        data: {
          choices: [{ text: "0.85" }],
        },
      });

      const question = exam.questions[2]; // short_answer, 10 points
      const result = await gradeTextAnswer(
        "Plants convert sunlight to food using photosynthesis",
        question
      );

      expect(result.slmScore).toBe(0.85);
      expect(result.marksAwarded).toBe(8.5); // eval 0.85 × 10 = 8.5
      expect(result.isCorrect).toBe(true); // >= 0.5 threshold
      expect(result.gradingStatus).toBe("graded");
      expect(result.gradingMethod).toBe("slm_semantic");
    });

    test("should handle low SLM score for off-topic answer", async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          choices: [{ text: "0.05" }],
        },
      });

      const question = exam.questions[2]; // 10 points
      const result = await gradeTextAnswer(
        "I had pizza for lunch",
        question
      );

      expect(result.slmScore).toBe(0.05);
      expect(result.marksAwarded).toBe(0.5); // eval 0.05 × 10 = 0.5
      expect(result.isCorrect).toBe(false);
    });

    test("should flag pending_review on SLM timeout", async () => {
      const timeoutError = new Error("timeout of 30000ms exceeded");
      timeoutError.code = "ECONNABORTED";
      axios.post.mockRejectedValueOnce(timeoutError);

      const question = exam.questions[2];
      const result = await gradeTextAnswer(
        "Some answer about photosynthesis",
        question
      );

      expect(result.gradingStatus).toBe("pending_review");
      expect(result.slmScore).toBeNull();
      expect(result.marksAwarded).toBe(0);
    });

    test("should flag pending_review on SLM connection error", async () => {
      axios.post.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

      const question = exam.questions[2];
      const result = await gradeTextAnswer("test answer", question);

      expect(result.gradingStatus).toBe("pending_review");
    });

    test("should use correctAnswer as fallback when modelAnswer is empty", async () => {
      axios.post.mockResolvedValueOnce({
        data: { choices: [{ text: "0.7" }] },
      });

      // Create question without modelAnswer
      const questionNoModel = {
        _id: new mongoose.Types.ObjectId(),
        type: "short_answer",
        correctAnswer: "The correct answer text",
        modelAnswer: "",
        points: 10,
      };

      await gradeTextAnswer("student answer", questionNoModel);

      // Verify that callSLM was called with correctAnswer
      const callArgs = axios.post.mock.calls[0][1];
      expect(callArgs.prompt).toContain("The correct answer text");
    });
  });

  // ─── Full Submission Grading ──────────────────────────────────────
  describe("gradeSubmission — Full Submission Grading", () => {
    test("should grade mixed MCQ and text submission", async () => {
      // Mock SLM for the two text questions
      axios.post
        .mockResolvedValueOnce({
          data: { choices: [{ text: "0.8" }] }, // short_answer (10pts) → 8 marks
        })
        .mockResolvedValueOnce({
          data: { choices: [{ text: "0.6" }] }, // essay (20pts) → 12 marks
        });

      const submission = await Submission.create({
        examId: exam._id,
        studentId: student._id,
        maxScore: 38,
        answers: [
          { questionId: exam.questions[0]._id, answer: "4" }, // MCQ correct → 5
          { questionId: exam.questions[1]._id, answer: "False" }, // true_false wrong → 0
          {
            questionId: exam.questions[2]._id,
            answer: "Plants make food from sunlight",
          }, // SLM → 8
          {
            questionId: exam.questions[3]._id,
            answer: "Water evaporates and then it rains",
          }, // SLM → 12
        ],
      });

      const result = await gradeSubmission(submission, exam);

      // MCQ correct (5) + true_false wrong (0) + short_answer (8) + essay (12) = 25
      expect(result.totalScore).toBe(25);
      expect(result.gradedAnswers).toHaveLength(4);
      expect(result.hasPartialGrading).toBe(false);
      expect(result.hasPendingReview).toBe(false);

      // Verify MCQ answer
      expect(result.gradedAnswers[0].gradingMethod).toBe("exact_match");
      expect(result.gradedAnswers[0].isCorrect).toBe(true);
      expect(result.gradedAnswers[0].marksAwarded).toBe(5);

      // Verify wrong true_false
      expect(result.gradedAnswers[1].isCorrect).toBe(false);
      expect(result.gradedAnswers[1].marksAwarded).toBe(0);

      // Verify SLM-graded text
      expect(result.gradedAnswers[2].gradingMethod).toBe("slm_semantic");
      expect(result.gradedAnswers[2].slmScore).toBe(0.8);
      expect(result.gradedAnswers[2].marksAwarded).toBe(8);

      expect(result.gradedAnswers[3].gradingMethod).toBe("slm_semantic");
      expect(result.gradedAnswers[3].slmScore).toBe(0.6);
      expect(result.gradedAnswers[3].marksAwarded).toBe(12);
    });

    test("should handle partial grading when SLM fails for some answers", async () => {
      // First text question succeeds, second times out
      axios.post
        .mockResolvedValueOnce({
          data: { choices: [{ text: "0.9" }] },
        })
        .mockRejectedValueOnce(
          Object.assign(new Error("timeout"), { code: "ECONNABORTED" })
        );

      const submission = await Submission.create({
        examId: exam._id,
        studentId: student._id,
        maxScore: 38,
        answers: [
          { questionId: exam.questions[0]._id, answer: "4" },
          { questionId: exam.questions[1]._id, answer: "True" },
          { questionId: exam.questions[2]._id, answer: "Photosynthesis answer" },
          { questionId: exam.questions[3]._id, answer: "Water cycle answer" },
        ],
      });

      const result = await gradeSubmission(submission, exam);

      expect(result.hasPendingReview).toBe(true);
      expect(result.hasPartialGrading).toBe(true);

      // The one that timed out should be pending_review
      expect(result.gradedAnswers[3].gradingStatus).toBe("pending_review");
      expect(result.gradedAnswers[3].slmScore).toBeNull();
    });

    test("should handle all-MCQ submission without SLM", async () => {
      // Create an MCQ-only exam
      const mcqExam = await Exam.create({
        title: "Pure MCQ Exam",
        teacherId: teacher._id,
        questions: [
          {
            type: "mcq",
            question: "Q1",
            options: ["A", "B", "C"],
            correctAnswer: "B",
            points: 5,
          },
          {
            type: "true_false",
            question: "Q2",
            options: ["True", "False"],
            correctAnswer: "True",
            points: 5,
          },
        ],
        scheduledAt: new Date(),
        duration: 60,
        endTime: new Date(Date.now() + 60 * 60000),
      });

      const submission = await Submission.create({
        examId: mcqExam._id,
        studentId: student._id,
        maxScore: 10,
        answers: [
          { questionId: mcqExam.questions[0]._id, answer: "B" },
          { questionId: mcqExam.questions[1]._id, answer: "True" },
        ],
      });

      const result = await gradeSubmission(submission, mcqExam);

      expect(result.totalScore).toBe(10);
      expect(result.hasPartialGrading).toBe(false);
      expect(result.hasPendingReview).toBe(false);

      // No SLM calls should have been made
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  // ─── Question Type Constants ──────────────────────────────────────
  describe("Question Type Constants", () => {
    test("EXACT_MATCH_TYPES should include mcq and true_false", () => {
      expect(EXACT_MATCH_TYPES).toContain("mcq");
      expect(EXACT_MATCH_TYPES).toContain("true_false");
    });

    test("SLM_GRADED_TYPES should include text-based question types", () => {
      expect(SLM_GRADED_TYPES).toContain("short_answer");
      expect(SLM_GRADED_TYPES).toContain("fill_blank");
      expect(SLM_GRADED_TYPES).toContain("essay");
    });
  });
});

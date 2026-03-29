/**
 * AutoGrader Service — SLM Semantic Grading Engine
 *
 * Component: AI Engine (Scoring Service) → Class: AutoGrader
 *
 * Handles:
 * - MCQ/true_false: exact-match (no SLM)
 * - short_answer / fill_blank / essay: SLM semantic similarity
 * - Score normalization: marks = round(slmScore × maxMarks)
 * - Edge cases: blank answers, timeouts, off-topic responses
 */

const axios = require("axios");

const SLM_API_URL = process.env.SLM_API_URL || "https://api.groq.com/openai/v1/chat/completions";
const SLM_API_KEY = process.env.SLM_API_KEY || "";
const SLM_TIMEOUT_MS = parseInt(process.env.SLM_TIMEOUT_MS, 10) || 30000;
const SLM_MODEL_NAME = process.env.SLM_MODEL_NAME || "llama-3.1-8b-instant";


const EXACT_MATCH_TYPES = ["mcq", "true_false"];


const SLM_GRADED_TYPES = ["short_answer", "fill_blank", "essay"];

/**
 * Build the structured SLM prompt for semantic comparison.
 */
function buildSLMPrompt(modelAnswer, studentAnswer) {
  return (
    `Given the model answer: "${modelAnswer}" and the student answer: ` +
    `"${studentAnswer}", rate the semantic similarity of the student ` +
    `answer on a scale of 0.0 to 1.0, where 1.0 is a perfect match ` +
    `in meaning. Return only the numeric score.`
  );
}

/**
 * Call the SLM inference endpoint.
 * Returns a similarity score ∈ [0.0, 1.0].
 * Throws on timeout or error.
 */
async function callSLM(modelAnswer, studentAnswer) {
  const prompt = buildSLMPrompt(modelAnswer, studentAnswer);

  const headers = { "Content-Type": "application/json" };
  if (SLM_API_KEY) {
    headers["Authorization"] = `Bearer ${SLM_API_KEY}`;
  }

  const response = await axios.post(
    SLM_API_URL,
    {
      model: SLM_MODEL_NAME,
      messages: [{ role: "user", content: prompt }], // OpenAI/Groq chat completions format
      max_tokens: 10,
      temperature: 0.0,
    },
    {
      timeout: SLM_TIMEOUT_MS,
      headers: headers,
    }
  );

  // Extract the numeric score from the response
  // Supports both OpenAI-compatible and raw text responses
  let rawText = "";
  if (response.data.choices && response.data.choices.length > 0) {
    rawText = response.data.choices[0].text || response.data.choices[0].message?.content || "";
  } else if (typeof response.data === "string") {
    rawText = response.data;
  } else if (response.data.score !== undefined) {
    return Math.max(0, Math.min(1, parseFloat(response.data.score)));
  }

  // Parse the numeric score from the text
  const match = rawText.trim().match(/([01]\.?\d*)/);
  if (!match) {
    throw new Error(`SLM returned non-numeric response: "${rawText.trim()}"`);
  }

  const score = parseFloat(match[1]);
  return Math.max(0, Math.min(1, score)); // Clamp to [0, 1]
}

/**
 * Normalize SLM score to marks.
 * marks = round(slmScore × maxMarks)
 */
function normalizeScore(slmScore, maxMarks) {
  return Number((slmScore * maxMarks).toFixed(2));
}

/**
 * Grade an MCQ/true_false answer via exact match.
 * No SLM invocation.
 */
function gradeMCQ(studentAnswer, correctAnswer) {
  const isCorrect =
    correctAnswer.toLowerCase().trim() ===
    (studentAnswer || "").toLowerCase().trim();

  return {
    isCorrect,
    slmScore: isCorrect ? 1.0 : 0.0,
    gradingStatus: "graded",
    gradingMethod: "exact_match",
  };
}

/**
 * Grade a text-based answer via SLM semantic similarity.
 * Handles blank answers, timeouts, and errors.
 */
async function gradeTextAnswer(studentAnswer, question) {
  // Edge case: blank answer → score = 0
  if (!studentAnswer || studentAnswer.trim() === "") {
    return {
      isCorrect: false,
      slmScore: 0.0,
      marksAwarded: 0,
      gradingStatus: "graded",
      gradingMethod: "slm_semantic",
    };
  }

  // Use modelAnswer if provided, else fall back to correctAnswer
  const modelAnswer =
    question.modelAnswer && question.modelAnswer.trim() !== ""
      ? question.modelAnswer
      : question.correctAnswer;

  try {
    const slmScore = await callSLM(modelAnswer, studentAnswer);
    const marksAwarded = normalizeScore(slmScore, question.points);

    return {
      isCorrect: slmScore >= 0.5, // Threshold for "correct"
      slmScore,
      marksAwarded,
      gradingStatus: "graded",
      gradingMethod: "slm_semantic",
    };
  } catch (error) {
    // SLM timeout or error → flag for manual review
    const isTimeout =
      error.code === "ECONNABORTED" ||
      error.message?.includes("timeout") ||
      error.message?.includes("ETIMEDOUT");

    console.error(
      `SLM grading ${isTimeout ? "timeout" : "error"} for question ${question._id}:`,
      error.message
    );

    return {
      isCorrect: false,
      slmScore: null,
      marksAwarded: 0,
      gradingStatus: "pending_review",
      gradingMethod: "slm_semantic",
      error: isTimeout
        ? "SLM inference timeout (>30s) — flagged for manual review"
        : `SLM error: ${error.message}`,
    };
  }
}

/**
 * generateRiskScore — Grade an entire submission.
 *
 * Component: AI Engine (Scoring Service) → Class: AutoGrader → Function: generateRiskScore()
 *
 * Iterates over all answers, applies the correct grading strategy per question type,
 * and returns the aggregate result.
 *
 * @param {Object} submission - The Submission document (with answers array)
 * @param {Object} exam - The Exam document (with questions array)
 * @returns {Object} { totalScore, gradedAnswers, hasPartialGrading, hasPendingReview }
 */
async function gradeSubmission(submission, exam) {
  let totalScore = 0;
  let hasPartialGrading = false;
  let hasPendingReview = false;

  const gradedAnswers = [];

  for (const answer of submission.answers) {
    const question = exam.questions.id(answer.questionId);

    if (!question) {
      // Question not found — skip
      gradedAnswers.push({
        ...answer.toObject(),
        gradingStatus: "error",
        gradingMethod: "exact_match",
        marksAwarded: 0,
        isCorrect: false,
        slmScore: null,
      });
      continue;
    }

    let gradingResult;

    if (EXACT_MATCH_TYPES.includes(question.type)) {
      // MCQ / true_false — exact match
      gradingResult = gradeMCQ(answer.answer, question.correctAnswer);
      gradingResult.marksAwarded = gradingResult.isCorrect
        ? question.points
        : 0;
    } else if (SLM_GRADED_TYPES.includes(question.type)) {
      // Text-based — SLM semantic grading
      gradingResult = await gradeTextAnswer(answer.answer, question);
    } else {
      // Unknown type — treat as exact match fallback
      gradingResult = gradeMCQ(answer.answer, question.correctAnswer);
      gradingResult.marksAwarded = gradingResult.isCorrect
        ? question.points
        : 0;
    }

    if (gradingResult.gradingStatus === "pending_review") {
      hasPendingReview = true;
    }

    if (gradingResult.gradingStatus === "graded") {
      totalScore += gradingResult.marksAwarded;
    } else {
      hasPartialGrading = true;
    }

    gradedAnswers.push({
      questionId: answer.questionId,
      answer: answer.answer,
      isCorrect: gradingResult.isCorrect,
      slmScore: gradingResult.slmScore,
      marksAwarded: gradingResult.marksAwarded,
      gradingStatus: gradingResult.gradingStatus,
      gradingMethod: gradingResult.gradingMethod,
      updatedAt: new Date(),
    });
  }

  return {
    totalScore,
    gradedAnswers,
    hasPartialGrading,
    hasPendingReview,
  };
}

module.exports = {
  gradeSubmission,
  gradeMCQ,
  gradeTextAnswer,
  callSLM,
  normalizeScore,
  buildSLMPrompt,
  EXACT_MATCH_TYPES,
  SLM_GRADED_TYPES,
};

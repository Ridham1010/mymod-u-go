import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { examService } from "../services/examService";
import "./Submissions.css";

const MySubmissions = () => {
  const { getAuthToken } = useAuth();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [detailLoading, setDetailLoading] = useState(null);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    try {
      const token = await getAuthToken();
      const data = await examService.getMySubmissions(token);
      setSubmissions(data.submissions);
    } catch (error) {
      console.error("Error fetching submissions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (submission) => {
    setDetailLoading(submission._id);
    try {
      const token = await getAuthToken();
      const data = await examService.getSubmission(token, submission._id);
      setSelectedSubmission(data.submission);
    } catch (error) {
      console.error("Error fetching submission details:", error);
      // Fall back to using the list data which already has questions
      setSelectedSubmission(submission);
    } finally {
      setDetailLoading(null);
    }
  };

  const handleCloseModal = () => {
    setSelectedSubmission(null);
  };

  const getStatusConfig = (status) => {
    const configs = {
      in_progress: { label: "In Progress", color: "#2563eb", bg: "#eff6ff" },
      submitted: { label: "Submitted", color: "#059669", bg: "#ecfdf5" },
      grading: { label: "AI Grading…", color: "#d97706", bg: "#fffbeb" },
      graded: { label: "Graded", color: "#7c3aed", bg: "#f5f3ff" },
      partially_graded: {
        label: "Partially Graded",
        color: "#ea580c",
        bg: "#fff7ed",
      },
      locked: { label: "Locked", color: "#dc2626", bg: "#fef2f2" },
    };
    return configs[status] || { label: status, color: "#6b7280", bg: "#f3f4f6" };
  };

  /** Determine if correct answer should be shown */
  const canShowCorrectAnswer = (submission) => {
    const settings = submission.examId?.settings;
    // Default is true — only hide if explicitly set to false
    return settings?.showResultsImmediately !== false;
  };

  if (loading) {
    return (
      <div className="ms-loading">
        <div className="ms-loading-spinner" />
        Loading your submissions…
      </div>
    );
  }

  return (
    <div className="ms-page">
      {/* ── Header ── */}
      <div className="ms-header">
        <div>
          <h1>My Submissions</h1>
          <p className="ms-header-subtitle">
            Review your exam answers and scores
          </p>
        </div>
        <button onClick={() => navigate("/dashboard")} className="ms-btn-back">
          ← Back to Dashboard
        </button>
      </div>

      {/* ── Content ── */}
      <div className="ms-content">
        {submissions.length === 0 ? (
          <div className="ms-empty">
            <div className="ms-empty-icon">📝</div>
            <p>You haven't submitted any exams yet.</p>
            <button
              className="ms-btn-primary"
              onClick={() => navigate("/dashboard")}
            >
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div className="ms-grid">
            {submissions.map((submission) => {
              const statusCfg = getStatusConfig(submission.status);

              return (
                <div key={submission._id} className="ms-card">
                  <div className="ms-card-top">
                    <h3 className="ms-card-title">
                      {submission.examId?.title || "Exam"}
                    </h3>
                    <span
                      className="ms-status-badge"
                      style={{
                        background: statusCfg.bg,
                        color: statusCfg.color,
                        borderColor: statusCfg.color + "30",
                      }}
                    >
                      {statusCfg.label}
                    </span>
                  </div>

                  {submission.examId?.description && (
                    <p className="ms-card-desc">
                      {submission.examId.description}
                    </p>
                  )}

                  <div className="ms-card-stats">
                    {submission.status === "grading" ? (
                      <div className="ms-stat-row grading-msg">
                        ⏳ Your answers are being evaluated by AI. Check back
                        shortly.
                      </div>
                    ) : submission.status === "partially_graded" ? (
                      <div className="ms-stat-row partial-msg">
                        Score so far: {submission.score}/{submission.maxScore} (
                        {submission.percentage}%) — Some answers pending review.
                      </div>
                    ) : (
                      <>
                        <div className="ms-stat">
                          <span className="ms-stat-label">Score</span>
                          <span
                            className={`ms-stat-value ${submission.percentage >= 50 ? "pass" : "fail"}`}
                          >
                            {submission.score}/{submission.maxScore}
                          </span>
                        </div>
                        <div className="ms-stat">
                          <span className="ms-stat-label">Percentage</span>
                          <span
                            className={`ms-stat-value ${submission.percentage >= 50 ? "pass" : "fail"}`}
                          >
                            {submission.percentage}%
                          </span>
                        </div>
                      </>
                    )}
                    <div className="ms-stat">
                      <span className="ms-stat-label">Questions</span>
                      <span className="ms-stat-value">
                        {submission.answers?.length || 0}
                      </span>
                    </div>
                    <div className="ms-stat">
                      <span className="ms-stat-label">Submitted</span>
                      <span className="ms-stat-value small">
                        {submission.submittedAt
                          ? new Date(submission.submittedAt).toLocaleDateString()
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <button
                    className="ms-btn-view"
                    onClick={() => handleViewDetails(submission)}
                    disabled={detailLoading === submission._id}
                  >
                    {detailLoading === submission._id ? "Loading…" : "View Questions & Answers"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          SUBMISSION DETAIL MODAL
          ═══════════════════════════════════════════════════════════ */}
      {selectedSubmission && (
        <div className="ms-modal-overlay" onClick={handleCloseModal}>
          <div
            className="ms-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="ms-modal-header">
              <div>
                <h2>{selectedSubmission.examId?.title || "Exam"}</h2>
                <div className="ms-modal-meta">
                  <span
                    className="ms-status-badge"
                    style={{
                      background: getStatusConfig(selectedSubmission.status).bg,
                      color: getStatusConfig(selectedSubmission.status).color,
                    }}
                  >
                    {getStatusConfig(selectedSubmission.status).label}
                  </span>
                  {(selectedSubmission.status === "graded" ||
                    selectedSubmission.status === "submitted") && (
                    <span
                      className={`ms-score-display ${selectedSubmission.percentage >= 50 ? "pass" : "fail"}`}
                    >
                      {selectedSubmission.score}/{selectedSubmission.maxScore} (
                      {selectedSubmission.percentage}%)
                    </span>
                  )}
                </div>
              </div>
              <button onClick={handleCloseModal} className="ms-btn-close">
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="ms-modal-body">
              {/* Info banner if results are hidden */}
              {!canShowCorrectAnswer(selectedSubmission) && (
                <div className="ms-info-banner">
                  <span className="ms-info-icon">ℹ️</span>
                  Your teacher has not released the answer key yet. You can see
                  your answers but not the correct answers.
                </div>
              )}

              {/* Questions & Answers */}
              <div className="ms-questions-list">
                {(
                  selectedSubmission.examId?.questions || []
                ).map((question, index) => {
                  const answer = selectedSubmission.answers?.find(
                    (a) => String(a.questionId) === String(question._id)
                  );
                  const showCorrect = canShowCorrectAnswer(selectedSubmission);
                  const isCorrect = answer?.isCorrect || (answer?.marksAwarded > 0);
                  const awarded = answer?.marksAwarded || 0;

                  return (
                    <div
                      key={question._id || index}
                      className={`ms-question-card ${showCorrect ? (isCorrect ? "correct" : "incorrect") : ""}`}
                    >
                      {/* Question header */}
                      <div className="ms-q-header">
                        <div className="ms-q-header-left">
                          <span className="ms-q-number">Q{index + 1}</span>
                          <span className="ms-q-type">
                            {question.type?.replace(/_/g, " ")}
                          </span>
                        </div>
                        <span
                          className={`ms-q-marks ${showCorrect ? (isCorrect ? "correct" : "incorrect") : ""}`}
                        >
                          {showCorrect
                            ? `${awarded}/${question.points} pt${question.points !== 1 ? "s" : ""}`
                            : `${question.points} pt${question.points !== 1 ? "s" : ""}`}
                        </span>
                      </div>

                      {/* Question text */}
                      <p className="ms-q-text">{question.question}</p>

                      {/* Answer comparison */}
                      <div
                        className={`ms-answer-grid ${showCorrect ? "" : "single"}`}
                      >
                        <div className="ms-answer-box your-answer">
                          <label>Your Answer</label>
                          <div
                            className={`ms-answer-text ${showCorrect ? (isCorrect ? "correct" : "incorrect") : ""}`}
                          >
                            {answer?.answer || "(No answer provided)"}
                          </div>
                        </div>
                        {showCorrect && (
                          <div className="ms-answer-box correct-answer">
                            <label>Correct Answer</label>
                            <div className="ms-answer-text">
                              {question.modelAnswer ||
                                question.correctAnswer ||
                                "—"}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Grading method indicator */}
                      {answer?.gradingMethod && showCorrect && (
                        <div className="ms-grading-method">
                          {answer.gradingMethod === "manual" && (
                            <span className="ms-gm manual">
                              ✎ Manually graded by teacher
                            </span>
                          )}
                          {answer.gradingMethod === "slm_semantic" && (
                            <span className="ms-gm ai">
                              🤖 AI evaluated
                              {answer.slmScore !== null &&
                                ` · Similarity: ${(answer.slmScore * 100).toFixed(0)}%`}
                            </span>
                          )}
                          {answer.gradingMethod === "exact_match" && (
                            <span className="ms-gm auto">
                              ⚡ Auto-graded
                            </span>
                          )}
                        </div>
                      )}

                      {/* Explanation if available */}
                      {showCorrect && question.explanation && (
                        <div className="ms-explanation">
                          <strong>Explanation:</strong> {question.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Submission metadata */}
              <div className="ms-submission-footer">
                <p>
                  <strong>Submitted:</strong>{" "}
                  {selectedSubmission.submittedAt
                    ? new Date(selectedSubmission.submittedAt).toLocaleString()
                    : "Not submitted"}
                </p>
                {selectedSubmission.reviewedBy && (
                  <p>
                    <strong>Reviewed by:</strong>{" "}
                    {selectedSubmission.reviewedBy?.name || "Teacher"} on{" "}
                    {new Date(selectedSubmission.reviewedAt).toLocaleString()}
                  </p>
                )}
                {selectedSubmission.reviewNotes && (
                  <div className="ms-review-notes">
                    <strong>Teacher Notes:</strong>
                    <p>{selectedSubmission.reviewNotes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MySubmissions;

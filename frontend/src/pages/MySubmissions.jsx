import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { examService } from "../services/examService";
import "./Submissions.css";

const MySubmissions = () => {
  const { userProfile, logout, getAuthToken } = useAuth();
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
      setSelectedSubmission(submission);
    } finally {
      setDetailLoading(null);
    }
  };

  const handleCloseModal = () => {
    setSelectedSubmission(null);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
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

  const canShowCorrectAnswer = (submission) => {
    const settings = submission.examId?.settings;
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
      {/* ── Header (Matches Dashboard & CreateExam) ── */}
      <header className="ms-header">
        <Link to="/dashboard" className="ms-header-brand">MOD<span>-U-GO</span></Link>
        <span className="ms-header-center">My Submissions</span>
        
        <button onClick={() => navigate("/dashboard")} className="ms-btn-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to Dashboard
        </button>
      </header>

      {/* ── Content ── */}
      <div className="ms-content">
        <div className="ms-page-header">
          <h1>Exam Submissions</h1>
          <p>Review your past exam answers and scores</p>
        </div>

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
                    <div className="ms-title-group">
                      <h3 className="ms-card-title">
                        {submission.examId?.title || "Exam"}
                      </h3>
                      {submission.examId?.description && (
                        <p className="ms-card-desc">
                          {submission.examId.description.length > 45 
                            ? submission.examId.description.substring(0, 45) + "..." 
                            : submission.examId.description}
                        </p>
                      )}
                    </div>
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

                  <div className="ms-card-divider" />

                  <div className="ms-card-stats">
                    {submission.status === "grading" ? (
                      <div className="ms-stat-row grading-msg">
                        ⏳ Your answers are being evaluated by AI. Check back shortly.
                      </div>
                    ) : submission.status === "partially_graded" ? (
                      <div className="ms-stat-row partial-msg">
                        Base Score: {submission.score}/{submission.maxScore} (
                        {submission.percentage}%) — Short answers pending review.
                      </div>
                    ) : (
                      <>
                        <div className="ms-stat">
                          <span
                            className={`ms-stat-value ${submission.percentage >= 50 ? "pass" : "fail"}`}
                          >
                            {submission.score}/{submission.maxScore}
                          </span>
                          <span className="ms-stat-label">Score</span>
                        </div>
                        <div className="ms-stat">
                          <span
                            className={`ms-stat-value ${submission.percentage >= 50 ? "pass" : "fail"}`}
                          >
                            {submission.percentage}%
                          </span>
                          <span className="ms-stat-label">Percent</span>
                        </div>
                      </>
                    )}
                    <div className="ms-stat">
                      <span className="ms-stat-value">
                        {submission.answers?.length || 0}
                      </span>
                      <span className="ms-stat-label">Q's</span>
                    </div>
                    <div className="ms-stat">
                      <span className="ms-stat-value">
                        {submission.submittedAt
                          ? new Date(submission.submittedAt).toLocaleDateString([], { month: 'short', day: 'numeric'})
                          : "—"}
                      </span>
                      <span className="ms-stat-label">Date</span>
                    </div>
                  </div>

                  <div className="ms-card-divider" />

                  <div className="ms-card-footer">
                    <button
                      className="ms-btn-view"
                      onClick={() => handleViewDetails(submission)}
                      disabled={detailLoading === submission._id}
                    >
                      {detailLoading === submission._id ? "Loading…" : "View Details"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Detail Modal ── */}
      {selectedSubmission && (
        <div className="ms-modal-overlay" onClick={handleCloseModal}>
          <div
            className="ms-modal"
            onClick={(e) => e.stopPropagation()}
          >
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
                      {selectedSubmission.score} / {selectedSubmission.maxScore} (
                      {selectedSubmission.percentage}%)
                    </span>
                  )}
                </div>
              </div>
              <button onClick={handleCloseModal} className="ms-btn-close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="ms-modal-body">
              {!canShowCorrectAnswer(selectedSubmission) && (
                <div className="ms-info-banner">
                  <span className="ms-info-icon">ℹ️</span>
                  Your teacher has not released the right answers yet.
                </div>
              )}

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
                            ? `${awarded} / ${question.points} pts`
                            : `${question.points} pts`}
                        </span>
                      </div>

                      <p className="ms-q-text">{question.question}</p>

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

                      {answer?.gradingMethod && showCorrect && (
                        <div className="ms-grading-method">
                          {answer.gradingMethod === "manual" && (
                            <span className="ms-gm manual">
                              ✎ Manually graded
                            </span>
                          )}
                          {answer.gradingMethod === "slm_semantic" && (
                            <span className="ms-gm ai">
                              🤖 AI evaluated
                              {answer.slmScore !== null &&
                                ` · ${Math.round(answer.slmScore * 100)}% match`}
                            </span>
                          )}
                          {answer.gradingMethod === "exact_match" && (
                            <span className="ms-gm auto">
                              ⚡ Auto-graded
                            </span>
                          )}
                        </div>
                      )}

                      {showCorrect && question.explanation && (
                        <div className="ms-explanation">
                          <strong>Explanation:</strong> {question.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="ms-submission-footer">
                <p>
                  <strong>Submitted On:</strong>{" "}
                  {selectedSubmission.submittedAt
                    ? new Date(selectedSubmission.submittedAt).toLocaleString()
                    : "Not submitted"}
                </p>
                {selectedSubmission.reviewedBy && (
                  <p>
                    <strong>Reviewed By:</strong>{" "}
                    {selectedSubmission.reviewedBy?.name || "Teacher"}
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

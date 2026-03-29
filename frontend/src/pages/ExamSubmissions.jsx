import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { examService } from "../services/examService";
import "./ExamSubmissions.css";

const ExamSubmissions = () => {
  const { examId } = useParams();
  const { getAuthToken } = useAuth();
  const navigate = useNavigate();

  // Core data
  const [exam, setExam] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Override state
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [editMarks, setEditMarks] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [editingTotalScore, setEditingTotalScore] = useState(false);
  const [editTotalMarks, setEditTotalMarks] = useState("");
  const [totalOverrideReason, setTotalOverrideReason] = useState("");

  // Toast notification
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Data fetching ──────────────────────────────────────────────
  useEffect(() => {
    fetchData();
  }, [examId]);

  const fetchData = async () => {
    try {
      const token = await getAuthToken();
      const [examData, submissionsData] = await Promise.all([
        examService.getExam(token, examId),
        examService.getSubmissions(token, examId),
      ]);

      setExam(examData.exam);
      setSubmissions(submissionsData.submissions);
      setStats(submissionsData.stats);
    } catch (error) {
      console.error("Error fetching data:", error);
      showToast("Error loading submissions", "error");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  // Refresh submission detail without closing modal
  const refreshSubmissionDetail = async (submissionId) => {
    try {
      const token = await getAuthToken();
      const data = await examService.getSubmission(token, submissionId);
      setSelectedSubmission(data.submission);
      setReviewNotes(data.submission.reviewNotes || "");
    } catch (error) {
      console.error("Error refreshing submission:", error);
    }
  };

  // ── Handlers ───────────────────────────────────────────────────
  const handleViewSubmission = async (submission) => {
    try {
      const token = await getAuthToken();
      const data = await examService.getSubmission(token, submission._id);
      setSelectedSubmission(data.submission);
      setReviewNotes(data.submission.reviewNotes || "");
      // Reset override state
      setEditingQuestionId(null);
      setEditMarks("");
      setOverrideReason("");
      setEditingTotalScore(false);
      setEditTotalMarks("");
      setTotalOverrideReason("");
    } catch (error) {
      showToast("Error loading submission details", "error");
    }
  };

  const handleCloseModal = () => {
    setSelectedSubmission(null);
    setEditingQuestionId(null);
    setEditMarks("");
    setOverrideReason("");
    setEditingTotalScore(false);
    setEditTotalMarks("");
    setTotalOverrideReason("");
  };

  const handleReviewSubmission = async (isFlagged) => {
    if (!selectedSubmission) return;
    try {
      const token = await getAuthToken();
      await examService.reviewSubmission(token, selectedSubmission._id, {
        reviewNotes,
        isFlagged,
        flagReason: isFlagged ? reviewNotes : undefined,
      });

      showToast(
        isFlagged ? "Submission flagged for review" : "Submission approved",
        "success"
      );
      handleCloseModal();
      fetchData();
    } catch (error) {
      showToast("Error reviewing submission: " + error.message, "error");
    }
  };

  // ── Per-question manual grade override ─────────────────────────
  const startQuestionOverride = (questionId, currentMarks) => {
    setEditingQuestionId(questionId);
    setEditMarks(String(currentMarks || 0));
    setOverrideReason("");
  };

  const cancelQuestionOverride = () => {
    setEditingQuestionId(null);
    setEditMarks("");
    setOverrideReason("");
  };

  const handleOverrideGrade = async (questionId, maxPoints) => {
    const marks = parseFloat(editMarks);
    if (isNaN(marks) || marks < 0 || marks > maxPoints) {
      showToast(`Enter a valid score between 0 and ${maxPoints}`, "error");
      return;
    }

    setOverrideLoading(true);
    try {
      const token = await getAuthToken();
      await examService.overrideGrade(
        token,
        selectedSubmission._id,
        questionId,
        marks
      );
      showToast(`Grade updated to ${marks}/${maxPoints}`, "success");
      cancelQuestionOverride();
      await refreshSubmissionDetail(selectedSubmission._id);
      fetchData();
    } catch (error) {
      showToast(
        "Error overriding grade: " +
          (error.response?.data?.message || error.message),
        "error"
      );
    } finally {
      setOverrideLoading(false);
    }
  };

  // ── Total score override ───────────────────────────────────────
  const startTotalScoreOverride = () => {
    setEditingTotalScore(true);
    setEditTotalMarks(String(selectedSubmission.score));
    setTotalOverrideReason("");
  };

  const cancelTotalScoreOverride = () => {
    setEditingTotalScore(false);
    setEditTotalMarks("");
    setTotalOverrideReason("");
  };

  const handleOverrideTotalScore = async () => {
    const newScore = parseFloat(editTotalMarks);
    if (
      isNaN(newScore) ||
      newScore < 0 ||
      newScore > selectedSubmission.maxScore
    ) {
      showToast(
        `Enter a valid score between 0 and ${selectedSubmission.maxScore}`,
        "error"
      );
      return;
    }

    setOverrideLoading(true);
    try {
      const token = await getAuthToken();
      await examService.overrideTotalScore(
        token,
        selectedSubmission._id,
        newScore,
        totalOverrideReason || undefined
      );
      showToast(
        `Total score updated to ${newScore}/${selectedSubmission.maxScore}`,
        "success"
      );
      cancelTotalScoreOverride();
      await refreshSubmissionDetail(selectedSubmission._id);
      fetchData();
    } catch (error) {
      showToast(
        "Error overriding total score: " +
          (error.response?.data?.message || error.message),
        "error"
      );
    } finally {
      setOverrideLoading(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────
  const filteredSubmissions = submissions.filter((s) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "flagged") return s.isFlagged;
    return s.status === filterStatus;
  });

  const getStatusClass = (submission) => {
    if (submission.status === "locked") return "status-locked";
    if (submission.isFlagged) return "status-flagged";
    if (submission.status === "grading") return "status-progress";
    if (submission.status === "partially_graded") return "status-flagged";
    if (submission.status === "submitted") return "status-submitted";
    if (submission.status === "graded") return "status-graded";
    return "status-progress";
  };

  const getStatusLabel = (status) => {
    const labels = {
      in_progress: "In Progress",
      submitted: "Submitted",
      grading: "AI Grading…",
      graded: "Graded",
      partially_graded: "Needs Review",
      locked: "Locked",
    };
    return labels[status] || status;
  };

  /** Determine answer correctness from backend fields, not raw string match */
  const getAnswerStatus = (answer, question) => {
    if (!answer) return { isCorrect: false, awarded: 0 };
    // Trust the backend isCorrect and marksAwarded over client string matching
    return {
      isCorrect: answer.isCorrect || answer.marksAwarded > 0,
      awarded: answer.marksAwarded || 0,
    };
  };

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        Loading submissions…
      </div>
    );
  }

  return (
    <div className="submissions-page exam-submissions">
      {/* Toast notification */}
      {toast && (
        <div className={`toast-notification toast-${toast.type}`}>
          <span className="toast-icon">
            {toast.type === "success" ? "✓" : "✕"}
          </span>
          {toast.message}
        </div>
      )}

      {/* ── Header ── */}
      <div className="submissions-header">
        <div>
          <h1>{exam?.title} — Submissions</h1>
          <p className="exam-info">
            Duration: {exam?.duration} min &nbsp;|&nbsp; Questions:{" "}
            {exam?.questions?.length}
          </p>
        </div>
        <button onClick={() => navigate("/dashboard")} className="btn-back">
          ← Back to Dashboard
        </button>
      </div>

      {/* ── Stats Bar ── */}
      {stats && (
        <div className="stats-bar">
          <div className="stat">
            <span className="stat-label">Total</span>
            <span className="stat-value">{stats.total}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Submitted</span>
            <span className="stat-value">{stats.submitted}</span>
          </div>
          <div className="stat">
            <span className="stat-label">In Progress</span>
            <span className="stat-value">{stats.inProgress}</span>
          </div>
          <div className="stat flagged">
            <span className="stat-label">Flagged</span>
            <span className="stat-value">{stats.flagged}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Avg Score</span>
            <span className="stat-value">{stats.averageScore}%</span>
          </div>
          <div className="stat">
            <span className="stat-label">Highest</span>
            <span className="stat-value">{stats.highestScore}%</span>
          </div>
          <div className="stat">
            <span className="stat-label">Lowest</span>
            <span className="stat-value">{stats.lowestScore}%</span>
          </div>
        </div>
      )}

      {/* ── Filter ── */}
      <div className="filter-bar">
        <label>Filter: </label>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All ({submissions.length})</option>
          <option value="submitted">
            Submitted (
            {submissions.filter((s) => s.status === "submitted").length})
          </option>
          <option value="grading">
            AI Grading (
            {submissions.filter((s) => s.status === "grading").length})
          </option>
          <option value="graded">
            Graded (
            {submissions.filter((s) => s.status === "graded").length})
          </option>
          <option value="partially_graded">
            Needs Review (
            {submissions.filter((s) => s.status === "partially_graded").length})
          </option>
          <option value="in_progress">
            In Progress (
            {submissions.filter((s) => s.status === "in_progress").length})
          </option>
          <option value="flagged">
            Flagged ({submissions.filter((s) => s.isFlagged).length})
          </option>
          <option value="locked">
            Locked (
            {submissions.filter((s) => s.status === "locked").length})
          </option>
        </select>
      </div>

      {/* ── Submissions Table ── */}
      <div className="submissions-content">
        {filteredSubmissions.length === 0 ? (
          <div className="no-data">
            <p>No submissions found.</p>
          </div>
        ) : (
          <div className="submissions-table">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Tab Switches</th>
                  <th>FS Exits</th>
                  <th>Trust Score</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.map((submission) => (
                  <tr
                    key={submission._id}
                    className={getStatusClass(submission)}
                  >
                    <td>
                      <div className="student-info">
                        <span className="student-name">
                          {submission.studentId?.name || "Unknown"}
                        </span>
                        <span className="student-email">
                          {submission.studentId?.email}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${submission.status} ${submission.isFlagged ? "flagged" : ""}`}
                      >
                        {submission.status === "locked"
                          ? "🔒 "
                          : submission.isFlagged
                            ? "⚠ "
                            : ""}
                        {getStatusLabel(submission.status)}
                      </span>
                    </td>
                    <td>
                      {submission.status === "grading" ? (
                        <span className="score grading-score">
                          AI Grading…
                        </span>
                      ) : submission.status === "partially_graded" ? (
                        <span className="score partial-score">
                          {submission.score}/{submission.maxScore} (Partial)
                        </span>
                      ) : (
                        <span
                          className={`score ${submission.percentage >= 50 ? "pass" : "fail"}`}
                        >
                          {submission.score}/{submission.maxScore} (
                          {submission.percentage}%)
                        </span>
                      )}
                    </td>
                    <td
                      className={
                        submission.tabSwitchCount > 3 ? "warning" : ""
                      }
                    >
                      {submission.tabSwitchCount}
                    </td>
                    <td
                      className={
                        submission.fullscreenExitCount > 2 ? "warning" : ""
                      }
                    >
                      {submission.fullscreenExitCount}
                    </td>
                    <td>
                      <span
                        className={`trust-score ${submission.proctoringScore < 50 ? "low" : submission.proctoringScore < 75 ? "medium" : "high"}`}
                      >
                        {submission.proctoringScore || 100}%
                      </span>
                    </td>
                    <td>
                      {submission.submittedAt
                        ? new Date(submission.submittedAt).toLocaleString()
                        : "Not submitted"}
                    </td>
                    <td>
                      <button
                        onClick={() => handleViewSubmission(submission)}
                        className="btn-view"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SUBMISSION DETAIL MODAL
          ═══════════════════════════════════════════════════════════════ */}
      {selectedSubmission && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div
            className="modal-content submission-detail"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-header-left">
                <h2>
                  {selectedSubmission.studentId?.name || "Unknown Student"}
                </h2>
                <span className="modal-subtitle">
                  {selectedSubmission.studentId?.email} &nbsp;·&nbsp;{" "}
                  <span
                    className={`status-badge-inline ${selectedSubmission.status}`}
                  >
                    {getStatusLabel(selectedSubmission.status)}
                  </span>
                </span>
              </div>
              <button onClick={handleCloseModal} className="btn-close">
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* ── Score Overview Card ── */}
              <div className="score-overview-card">
                <div className="score-overview-main">
                  {editingTotalScore ? (
                    <div className="total-score-editor">
                      <div className="editor-row">
                        <label>New Total Score</label>
                        <div className="editor-input-group">
                          <input
                            type="number"
                            className="override-input large"
                            value={editTotalMarks}
                            onChange={(e) => setEditTotalMarks(e.target.value)}
                            min={0}
                            max={selectedSubmission.maxScore}
                            step="0.5"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleOverrideTotalScore();
                              if (e.key === "Escape") cancelTotalScoreOverride();
                            }}
                          />
                          <span className="override-max-label">
                            / {selectedSubmission.maxScore}
                          </span>
                        </div>
                      </div>
                      <div className="editor-row">
                        <label>Reason (optional)</label>
                        <input
                          type="text"
                          className="override-reason-input"
                          value={totalOverrideReason}
                          onChange={(e) =>
                            setTotalOverrideReason(e.target.value)
                          }
                          placeholder="e.g. Corrected marking error"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleOverrideTotalScore();
                          }}
                        />
                      </div>
                      <div className="editor-actions">
                        <button
                          className="btn-save"
                          onClick={handleOverrideTotalScore}
                          disabled={overrideLoading}
                        >
                          {overrideLoading ? "Saving…" : "Save Score"}
                        </button>
                        <button
                          className="btn-cancel"
                          onClick={cancelTotalScoreOverride}
                          disabled={overrideLoading}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="score-big">
                        <span
                          className={`score-number ${selectedSubmission.percentage >= 50 ? "pass" : "fail"}`}
                        >
                          {selectedSubmission.score}
                        </span>
                        <span className="score-separator">/</span>
                        <span className="score-max">
                          {selectedSubmission.maxScore}
                        </span>
                      </div>
                      <div className="score-percentage">
                        <div
                          className={`percentage-ring ${selectedSubmission.percentage >= 50 ? "pass" : "fail"}`}
                        >
                          {selectedSubmission.percentage}%
                        </div>
                      </div>
                      <button
                        className="btn-override-total"
                        onClick={startTotalScoreOverride}
                        title="Override total score"
                      >
                        ✎ Override Score
                      </button>
                    </>
                  )}
                </div>

                <div className="score-overview-meta">
                  <div className="meta-chip">
                    <span className="meta-chip-label">Tab Switches</span>
                    <span
                      className={`meta-chip-value ${selectedSubmission.tabSwitchCount > 3 ? "warning" : ""}`}
                    >
                      {selectedSubmission.tabSwitchCount}
                    </span>
                  </div>
                  <div className="meta-chip">
                    <span className="meta-chip-label">FS Exits</span>
                    <span
                      className={`meta-chip-value ${selectedSubmission.fullscreenExitCount > 2 ? "warning" : ""}`}
                    >
                      {selectedSubmission.fullscreenExitCount}
                    </span>
                  </div>
                  <div className="meta-chip">
                    <span className="meta-chip-label">Trust Score</span>
                    <span
                      className={`meta-chip-value trust ${(selectedSubmission.proctoringScore || 100) < 50 ? "low" : (selectedSubmission.proctoringScore || 100) < 75 ? "medium" : "high"}`}
                    >
                      {selectedSubmission.proctoringScore || 100}%
                    </span>
                  </div>
                  <div className="meta-chip">
                    <span className="meta-chip-label">Submitted</span>
                    <span className="meta-chip-value">
                      {selectedSubmission.submittedAt
                        ? new Date(
                            selectedSubmission.submittedAt
                          ).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Answers Section ── */}
              <div className="answers-section">
                <h3>
                  Answers & Grading
                  <span className="answers-count">
                    {exam?.questions?.length} question
                    {exam?.questions?.length !== 1 ? "s" : ""}
                  </span>
                </h3>
                <div className="answers-list">
                  {exam?.questions?.map((question, index) => {
                    const answer = selectedSubmission.answers?.find(
                      (a) => String(a.questionId) === String(question._id)
                    );
                    const { isCorrect, awarded } = getAnswerStatus(
                      answer,
                      question
                    );
                    const isEditing = editingQuestionId === question._id;

                    return (
                      <div
                        key={question._id}
                        className={`answer-card ${isCorrect ? "correct" : "incorrect"} ${isEditing ? "editing" : ""}`}
                      >
                        {/* Question Header */}
                        <div className="question-header">
                          <div className="question-header-left">
                            <span className="question-number">
                              Q{index + 1}
                            </span>
                            <span className="question-type-badge">
                              {question.type?.replace(/_/g, " ")}
                            </span>
                          </div>
                          <div className="question-header-right">
                            <span
                              className={`marks-badge ${isCorrect ? "correct" : "incorrect"}`}
                            >
                              {awarded}/{question.points} pt
                              {question.points !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>

                        {/* Question Text */}
                        <p className="question-text">{question.question}</p>

                        {/* Answer Comparison */}
                        <div className="answer-comparison">
                          <div className="answer-box student-answer">
                            <label>Student's Answer</label>
                            <span
                              className={`answer-value ${isCorrect ? "correct" : "incorrect"}`}
                            >
                              {answer?.answer || "(No answer)"}
                            </span>
                          </div>
                          <div className="answer-box correct-answer-box">
                            <label>Correct / Model Answer</label>
                            <span className="answer-value">
                              {question.modelAnswer ||
                                question.correctAnswer}
                            </span>
                          </div>
                        </div>

                        {/* Grading Method Info */}
                        <div className="grading-info">
                          {answer?.gradingMethod === "slm_semantic" && (
                            <div className="grading-badge slm">
                              <span className="grading-badge-icon">🤖</span>
                              <div className="grading-badge-content">
                                <strong>AI Semantic Grading</strong>
                                <span>
                                  {answer.gradingStatus === "graded"
                                    ? "Evaluated"
                                    : "Pending"}{" "}
                                  &nbsp;·&nbsp; Similarity:{" "}
                                  {answer.slmScore !== null
                                    ? (answer.slmScore * 100).toFixed(0) + "%"
                                    : "N/A"}{" "}
                                  &nbsp;·&nbsp; {answer.marksAwarded}/
                                  {question.points}
                                </span>
                              </div>
                            </div>
                          )}
                          {answer?.gradingMethod === "manual" && (
                            <div className="grading-badge manual">
                              <span className="grading-badge-icon">✎</span>
                              <div className="grading-badge-content">
                                <strong>Manually Graded</strong>
                                <span>
                                  Teacher override — {answer.marksAwarded}/
                                  {question.points}
                                </span>
                              </div>
                            </div>
                          )}
                          {answer?.gradingMethod === "exact_match" && (
                            <div className="grading-badge auto">
                              <span className="grading-badge-icon">⚡</span>
                              <div className="grading-badge-content">
                                <strong>Auto-Graded</strong>
                                <span>
                                  Exact match — {answer.marksAwarded}/
                                  {question.points}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Override Controls */}
                        <div className="override-section">
                          {isEditing ? (
                            <div className="override-editor">
                              <div className="override-editor-row">
                                <label>New Score</label>
                                <div className="override-input-group">
                                  <input
                                    type="number"
                                    className="override-input"
                                    value={editMarks}
                                    onChange={(e) =>
                                      setEditMarks(e.target.value)
                                    }
                                    min={0}
                                    max={question.points}
                                    step="0.5"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        handleOverrideGrade(
                                          question._id,
                                          question.points
                                        );
                                      if (e.key === "Escape")
                                        cancelQuestionOverride();
                                    }}
                                  />
                                  <span className="override-max-label">
                                    / {question.points}
                                  </span>
                                </div>
                              </div>
                              <div className="override-editor-actions">
                                <button
                                  className="btn-save"
                                  onClick={() =>
                                    handleOverrideGrade(
                                      question._id,
                                      question.points
                                    )
                                  }
                                  disabled={overrideLoading}
                                >
                                  {overrideLoading ? (
                                    <>
                                      <span className="btn-spinner" /> Saving…
                                    </>
                                  ) : (
                                    "Save"
                                  )}
                                </button>
                                <button
                                  className="btn-cancel"
                                  onClick={cancelQuestionOverride}
                                  disabled={overrideLoading}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              className="btn-override"
                              onClick={() =>
                                startQuestionOverride(
                                  question._id,
                                  answer?.marksAwarded
                                )
                              }
                            >
                              ✎ Override Grade
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Proctoring Events ── */}
              {selectedSubmission.proctoringEvents?.length > 0 && (
                <div className="events-section">
                  <h3>
                    Proctoring Events (
                    {selectedSubmission.proctoringEvents.length})
                  </h3>
                  <div className="events-list">
                    {selectedSubmission.proctoringEvents.map((event, index) => (
                      <div
                        key={index}
                        className={`event-item severity-${event.severity}`}
                      >
                        <span className="event-time">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="event-type">
                          {event.type?.replace(/_/g, " ")}
                        </span>
                        <span className={`event-severity ${event.severity}`}>
                          {event.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Review Section ── */}
              <div className="review-section">
                <h3>Teacher Review</h3>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add review notes for this submission…"
                  rows={3}
                />
                {selectedSubmission.reviewedBy && (
                  <p className="reviewed-info">
                    Last reviewed by {selectedSubmission.reviewedBy.name} on{" "}
                    {new Date(selectedSubmission.reviewedAt).toLocaleString()}
                  </p>
                )}

                {/* Lock Info */}
                {selectedSubmission.status === "locked" && (
                  <div className="lock-info-section">
                    <h4 className="lock-info-title">
                      🔒 This exam was auto-locked
                    </h4>
                    <p className="lock-info-reason">
                      <strong>Reason:</strong>{" "}
                      {selectedSubmission.lockInfo?.lockReason ||
                        "Max violations reached"}
                    </p>
                    <p className="lock-info-time">
                      <strong>Locked at:</strong>{" "}
                      {selectedSubmission.lockInfo?.lockedAt
                        ? new Date(
                            selectedSubmission.lockInfo.lockedAt
                          ).toLocaleString()
                        : "Unknown"}
                    </p>
                    <button
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "Unlock this submission? It will move to 'submitted' status for grading."
                          )
                        )
                          return;
                        try {
                          const token = await getAuthToken();
                          await examService.unlockSubmission(
                            token,
                            selectedSubmission._id
                          );
                          showToast("Submission unlocked", "success");
                          await refreshSubmissionDetail(selectedSubmission._id);
                          fetchData();
                        } catch (error) {
                          showToast(
                            "Error unlocking: " +
                              (error.response?.data?.message || error.message),
                            "error"
                          );
                        }
                      }}
                      className="btn-unlock"
                    >
                      🔓 Unlock Submission
                    </button>
                  </div>
                )}

                <div className="review-actions">
                  <button
                    onClick={() => handleReviewSubmission(false)}
                    className="btn-approve"
                    disabled={selectedSubmission.status === "locked"}
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => handleReviewSubmission(true)}
                    className="btn-flag"
                    disabled={selectedSubmission.status === "locked"}
                  >
                    ⚠ Flag for Review
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamSubmissions;

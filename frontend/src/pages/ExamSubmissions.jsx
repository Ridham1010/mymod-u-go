import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { examService } from "../services/examService";
import "./ExamSubmissions.css";

const ExamSubmissions = () => {
  const { examId } = useParams();
  const { getAuthToken, userProfile } = useAuth();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  // Manual override state
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [editMarks, setEditMarks] = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [editingTotalScore, setEditingTotalScore] = useState(false);
  const [editTotalMarks, setEditTotalMarks] = useState("");

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
      alert("Error loading submissions");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleViewSubmission = async (submission) => {
    try {
      const token = await getAuthToken();
      const data = await examService.getSubmission(token, submission._id);
      setSelectedSubmission(data.submission);
      setReviewNotes(data.submission.reviewNotes || "");
    } catch (error) {
      alert("Error loading submission details: " + error.message);
    }
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

      alert("Submission reviewed successfully");
      setSelectedSubmission(null);
      fetchData();
    } catch (error) {
      alert("Error reviewing submission: " + error.message);
    }
  };

  // Handle per-question manual grade override
  const handleOverrideGrade = async (questionId, maxPoints) => {
    const marks = parseFloat(editMarks);
    if (isNaN(marks) || marks < 0 || marks > maxPoints) {
      alert(`Please enter a valid score between 0 and ${maxPoints}`);
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
      // Refresh submission details
      const data = await examService.getSubmission(token, selectedSubmission._id);
      setSelectedSubmission(data.submission);
      setEditingQuestionId(null);
      setEditMarks("");
      fetchData(); // Refresh table stats too
    } catch (error) {
      alert("Error overriding grade: " + (error.response?.data?.message || error.message));
    } finally {
      setOverrideLoading(false);
    }
  };

  // Handle total score override
  const handleOverrideTotalScore = async () => {
    const newScore = parseFloat(editTotalMarks);
    if (isNaN(newScore) || newScore < 0 || newScore > selectedSubmission.maxScore) {
      alert(`Please enter a valid score between 0 and ${selectedSubmission.maxScore}`);
      return;
    }

    setOverrideLoading(true);
    try {
      const token = await getAuthToken();
      await examService.overrideTotalScore(token, selectedSubmission._id, newScore);
      // Refresh submission details
      const data = await examService.getSubmission(token, selectedSubmission._id);
      setSelectedSubmission(data.submission);
      setEditingTotalScore(false);
      setEditTotalMarks("");
      fetchData();
    } catch (error) {
      alert("Error overriding total score: " + (error.response?.data?.message || error.message));
    } finally {
      setOverrideLoading(false);
    }
  };

  const filteredSubmissions = submissions.filter((s) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "flagged") return s.isFlagged;
    if (filterStatus === "submitted") return s.status === "submitted";
    if (filterStatus === "in_progress") return s.status === "in_progress";
    if (filterStatus === "grading") return s.status === "grading";
    if (filterStatus === "graded") return s.status === "graded";
    if (filterStatus === "partially_graded") return s.status === "partially_graded";
    if (filterStatus === "locked") return s.status === "locked";
    return true;
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
      grading: "AI Grading...",
      graded: "Graded",
      partially_graded: "Needs Review",
      locked: "Locked",
    };
    return labels[status] || status;
  };

  if (loading) {
    return <div className="loading">Loading submissions...</div>;
  }

  return (
    <div className="submissions-page exam-submissions">
      <div className="submissions-header">
        <div>
          <h1>{exam?.title} - Submissions</h1>
          <p className="exam-info">
            Duration: {exam?.duration} min | Questions:{" "}
            {exam?.questions?.length}
          </p>
        </div>
        <button onClick={() => navigate("/dashboard")} className="btn-back">
          Back to Dashboard
        </button>
      </div>

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
            Locked ({submissions.filter((s) => s.status === "locked").length})
          </option>
        </select>
      </div>

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
                        {submission.status === "locked" ? "Locked " : submission.isFlagged ? "[!] " : ""}
                        {getStatusLabel(submission.status)}
                      </span>
                    </td>
                    <td>
                      {submission.status === "grading" ? (
                        <span className="score" style={{ color: '#ff9800' }}>AI Grading...</span>
                      ) : submission.status === "partially_graded" ? (
                        <span className="score" style={{ color: '#f57c00' }}>
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
                      className={submission.tabSwitchCount > 3 ? "warning" : ""}
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
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Submission Detail Modal */}
      {selectedSubmission && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedSubmission(null)}
        >
          <div
            className="modal-content submission-detail"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Submission Details</h2>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="btn-close"
              >
                x
              </button>
            </div>

            <div className="modal-body">
              <div className="submission-meta">
                <div className="meta-item">
                  <label>Student</label>
                  <span>{selectedSubmission.studentId?.name || "Unknown"}</span>
                </div>
                <div className="meta-item">
                  <label>Email</label>
                  <span>{selectedSubmission.studentId?.email || "N/A"}</span>
                </div>
                <div className="meta-item">
                  <label>Score</label>
                  {editingTotalScore ? (
                    <div className="inline-override-editor">
                      <input
                        type="number"
                        className="override-input"
                        value={editTotalMarks}
                        onChange={(e) => setEditTotalMarks(e.target.value)}
                        min={0}
                        max={selectedSubmission.maxScore}
                        step="0.5"
                        autoFocus
                        placeholder={`0 – ${selectedSubmission.maxScore}`}
                      />
                      <span className="override-max">/ {selectedSubmission.maxScore}</span>
                      <button
                        className="btn-override-save"
                        onClick={handleOverrideTotalScore}
                        disabled={overrideLoading}
                      >
                        {overrideLoading ? "…" : "✓"}
                      </button>
                      <button
                        className="btn-override-cancel"
                        onClick={() => { setEditingTotalScore(false); setEditTotalMarks(""); }}
                        disabled={overrideLoading}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="score-with-override">
                      <span
                        className={`score-display ${selectedSubmission.percentage >= 50 ? "pass" : "fail"}`}
                      >
                        {selectedSubmission.score}/{selectedSubmission.maxScore} (
                        {selectedSubmission.percentage}%)
                      </span>
                      <button
                        className="btn-override-total"
                        onClick={() => {
                          setEditingTotalScore(true);
                          setEditTotalMarks(String(selectedSubmission.score));
                        }}
                        title="Override total score"
                      >
                        ✎
                      </button>
                    </div>
                  )}
                </div>
                <div className="meta-item">
                  <label>Status</label>
                  <span className={`status-badge ${selectedSubmission.status}`}>
                    {selectedSubmission.status}
                  </span>
                </div>
                <div className="meta-item">
                  <label>Tab Switches</label>
                  <span
                    className={
                      selectedSubmission.tabSwitchCount > 3
                        ? "warning-text"
                        : ""
                    }
                  >
                    {selectedSubmission.tabSwitchCount}
                  </span>
                </div>
                <div className="meta-item">
                  <label>Fullscreen Exits</label>
                  <span
                    className={
                      selectedSubmission.fullscreenExitCount > 2
                        ? "warning-text"
                        : ""
                    }
                  >
                    {selectedSubmission.fullscreenExitCount}
                  </span>
                </div>
                <div className="meta-item">
                  <label>Trust Score</label>
                  <span
                    className={`trust-badge ${(selectedSubmission.proctoringScore || 100) < 50 ? "low" : (selectedSubmission.proctoringScore || 100) < 75 ? "medium" : "high"}`}
                  >
                    {selectedSubmission.proctoringScore || 100}%
                  </span>
                </div>
                <div className="meta-item">
                  <label>Submitted At</label>
                  <span>
                    {selectedSubmission.submittedAt
                      ? new Date(
                          selectedSubmission.submittedAt,
                        ).toLocaleString()
                      : "Not submitted"}
                  </span>
                </div>
              </div>

              <div className="answers-section">
                <h3>Answers</h3>
                <div className="answers-list">
                  {exam?.questions?.map((question, index) => {
                    const answer = selectedSubmission.answers?.find(
                      (a) => a.questionId === question._id,
                    );
                    const isCorrect =
                      answer?.answer?.toLowerCase().trim() ===
                      question.correctAnswer?.toLowerCase().trim();

                    return (
                      <div
                        key={question._id}
                        className={`answer-card ${isCorrect ? "correct" : "incorrect"}`}
                      >
                        <div className="question-header">
                          <span className="question-number">Q{index + 1}</span>
                          <span
                            className={`result-badge ${isCorrect ? "correct" : "incorrect"}`}
                          >
                            {isCorrect ? "Correct" : "Incorrect"} (
                            {question.points} pt
                            {question.points !== 1 ? "s" : ""})
                          </span>
                        </div>
                        <p className="question-text">{question.question}</p>
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
                            <label>Correct Answer / Model Answer</label>
                            <span className="answer-value">
                              {question.modelAnswer || question.correctAnswer}
                            </span>
                          </div>
                        </div>

                        {/* Grading Info */}
                        <div className="grading-info">
                          {answer?.gradingMethod === "slm_semantic" && (
                            <div className="slm-metrics">
                              <strong>🤖 AI Semantic Grading:</strong> {answer.gradingStatus === "graded" ? "Evaluated" : "Pending / Timeout"}<br/>
                              <strong>Similarity Score:</strong> {answer.slmScore !== null ? (answer.slmScore * 100).toFixed(0) + "%" : "N/A"}<br/>
                              <strong>Marks Awarded:</strong> {answer.marksAwarded} / {question.points}
                            </div>
                          )}
                          {answer?.gradingMethod === "manual" && (
                            <div className="manual-grading-badge">
                              ✎ Manually graded — {answer.marksAwarded} / {question.points}
                            </div>
                          )}
                          {answer?.gradingMethod === "exact_match" && (
                            <div className="auto-grading-badge">
                              ⚡ Auto-graded — {answer.marksAwarded} / {question.points}
                            </div>
                          )}
                        </div>

                        {/* Manual Override Controls */}
                        <div className="override-action">
                          {editingQuestionId === question._id ? (
                            <div className="inline-override-editor">
                              <label className="override-label">Set marks:</label>
                              <input
                                type="number"
                                className="override-input"
                                value={editMarks}
                                onChange={(e) => setEditMarks(e.target.value)}
                                min={0}
                                max={question.points}
                                step="0.5"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleOverrideGrade(question._id, question.points);
                                  if (e.key === "Escape") { setEditingQuestionId(null); setEditMarks(""); }
                                }}
                              />
                              <span className="override-max">/ {question.points}</span>
                              <button
                                className="btn-override-save"
                                onClick={() => handleOverrideGrade(question._id, question.points)}
                                disabled={overrideLoading}
                              >
                                {overrideLoading ? "Saving…" : "Save"}
                              </button>
                              <button
                                className="btn-override-cancel"
                                onClick={() => { setEditingQuestionId(null); setEditMarks(""); }}
                                disabled={overrideLoading}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn-override"
                              onClick={() => {
                                setEditingQuestionId(question._id);
                                setEditMarks(String(answer?.marksAwarded || 0));
                              }}
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

              <div className="review-section">
                <h3>Review Notes</h3>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add review notes..."
                  rows={3}
                />
                {selectedSubmission.reviewedBy && (
                  <p className="reviewed-info">
                    Reviewed by {selectedSubmission.reviewedBy.name} on{" "}
                    {new Date(selectedSubmission.reviewedAt).toLocaleString()}
                  </p>
                )}
                <div className="review-actions">
                  {selectedSubmission.status === "locked" && (
                    <div className="lock-info-section">
                      <h4 className="lock-info-title">🔒 This exam was auto-locked</h4>
                      <p className="lock-info-reason">
                        <strong>Reason:</strong> {selectedSubmission.lockInfo?.lockReason || "Max violations reached"}
                      </p>
                      <p className="lock-info-time">
                        <strong>Locked at:</strong>{" "}
                        {selectedSubmission.lockInfo?.lockedAt
                          ? new Date(selectedSubmission.lockInfo.lockedAt).toLocaleString()
                          : "Unknown"}
                      </p>
                      <button
                        onClick={async () => {
                          if (!window.confirm("Are you sure you want to unlock this submission? It will be moved to 'submitted' status for grading."))
                            return;
                          try {
                            const token = await getAuthToken();
                            await examService.unlockSubmission(token, selectedSubmission._id);
                            alert("Submission unlocked successfully. You can now grade it.");
                            setSelectedSubmission(null);
                            fetchData();
                          } catch (error) {
                            alert("Error unlocking submission: " + (error.response?.data?.message || error.message));
                          }
                        }}
                        className="btn-unlock"
                      >
                        🔓 Unlock Submission
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => handleReviewSubmission(false)}
                    className="btn-approve"
                    disabled={selectedSubmission.status === "locked"}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReviewSubmission(true)}
                    className="btn-flag"
                    disabled={selectedSubmission.status === "locked"}
                  >
                    Flag for Review
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

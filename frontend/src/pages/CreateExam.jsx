import React, { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { examService } from "../services/examService";
import "./CreateExam.css";

/* ── helpers ──────────────────────────────────────────────── */
const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

const ArrowLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 5l-7 7 7 7" />
  </svg>
);

const CreateExam = () => {
  const { getAuthToken } = useAuth();
  const navigate = useNavigate();
  const { examId } = useParams();
  const isEditing = !!examId;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState(60);
  const [questions, setQuestions] = useState([
    {
      type: "mcq",
      question: "",
      options: ["", "", "", ""],
      correctAnswer: "",
      modelAnswer: "",
      points: 1,
      constraints: { wordLimit: null, difficultyLevel: "medium" },
    },
  ]);
  const [settings, setSettings] = useState({
    shuffleQuestions: false,
    shuffleOptions: false,
    showResults: true,
    requireWebcam: true,
    requireFullscreen: true,
    allowBackNavigation: true,
    passingScore: 50,
    maxAttempts: 1,
    autoSubmit: true,
    proctoringWindow: {
      preExamBufferMinutes: 5,
      postSubmissionBufferMinutes: 2,
    },
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEditing);

  useEffect(() => {
    if (isEditing) fetchExam();
  }, [examId]);

  /* ── data fetch ─────────────────────────────────────────── */
  const fetchExam = async () => {
    try {
      const token = await getAuthToken();
      const data = await examService.getExam(token, examId);
      const exam = data.exam;

      setTitle(exam.title);
      setDescription(exam.description || "");
      const d = new Date(exam.scheduledAt);
      setScheduledAt(
        new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      );
      setDuration(exam.duration);
      setQuestions(
        exam.questions.map((q) => ({
          type: q.type,
          question: q.question,
          options: q.options?.length > 0 ? q.options : ["", "", "", ""],
          correctAnswer: q.correctAnswer,
          modelAnswer: q.modelAnswer || "",
          points: q.points || 1,
          constraints: q.constraints || { wordLimit: null, difficultyLevel: "medium" },
        }))
      );
      if (exam.settings) setSettings({ ...settings, ...exam.settings });
    } catch (err) {
      console.error("Error fetching exam:", err);
      setError("Error loading exam");
    } finally {
      setLoading(false);
    }
  };

  /* ── settings helpers ───────────────────────────────────── */
  const updateSetting = (key, value) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const updateProctoringWindow = (key, value) =>
    setSettings((s) => ({
      ...s,
      proctoringWindow: { ...s.proctoringWindow, [key]: value },
    }));

  /* ── question helpers ───────────────────────────────────── */
  const addQuestion = () =>
    setQuestions((qs) => [
      ...qs,
      {
        type: "mcq",
        question: "",
        options: ["", "", "", ""],
        correctAnswer: "",
        modelAnswer: "",
        points: 1,
        constraints: { wordLimit: null, difficultyLevel: "medium" },
      },
    ]);

  const removeQuestion = (i) => {
    if (questions.length > 1)
      setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  };

  const updateQuestion = (i, field, value) => {
    const qs = [...questions];
    qs[i][field] = value;
    if (field === "type" && value !== "mcq") qs[i].options = [];
    else if (field === "type" && value === "mcq" && !qs[i].options.length)
      qs[i].options = ["", "", "", ""];
    setQuestions(qs);
  };

  const updateOption = (qIdx, optIdx, value) => {
    const qs = [...questions];
    qs[qIdx].options[optIdx] = value;
    setQuestions(qs);
  };

  const addOption = (qIdx) => {
    const qs = [...questions];
    qs[qIdx].options.push("");
    setQuestions(qs);
  };

  const removeOption = (qIdx, optIdx) => {
    const qs = [...questions];
    if (qs[qIdx].options.length > 2) {
      qs[qIdx].options.splice(optIdx, 1);
      setQuestions(qs);
    }
  };

  const updateConstraint = (i, field, value) => {
    const qs = [...questions];
    qs[i].constraints = qs[i].constraints || { wordLimit: null, difficultyLevel: "medium" };
    qs[i].constraints[field] = value;
    setQuestions(qs);
  };

  /* ── submit ─────────────────────────────────────────────── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!title || !scheduledAt || duration <= 0) {
      setError("Please fill in all required fields.");
      return;
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question || !q.correctAnswer) {
        setError(`Question ${i + 1}: Please fill in question text and correct answer.`);
        return;
      }
      if (q.type === "mcq") {
        const filled = q.options.filter((o) => o.trim());
        if (filled.length < 2) {
          setError(`Question ${i + 1}: MCQ must have at least 2 options.`);
          return;
        }
        if (!filled.includes(q.correctAnswer)) {
          setError(`Question ${i + 1}: Correct answer must match one of the options.`);
          return;
        }
      }
    }

    try {
      setSubmitting(true);
      const token = await getAuthToken();
      const examData = {
        title, description,
        scheduledAt: new Date(scheduledAt).toISOString(),
        duration, settings,
        questions: questions.map((q) => ({
          type: q.type,
          question: q.question,
          options: q.type === "mcq" ? q.options.filter((o) => o.trim()) : [],
          correctAnswer: q.correctAnswer,
          modelAnswer: q.modelAnswer || "",
          points: q.points,
          constraints: q.constraints || { wordLimit: null, difficultyLevel: "medium" },
        })),
      };
      if (isEditing) {
        await examService.updateExam(token, examId, examData);
      } else {
        await examService.createExam(token, examData);
      }
      navigate("/dashboard");
    } catch (err) {
      console.error("Error saving exam:", err);
      setError("Error saving exam: " + (err.response?.data?.message || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading">Loading exam…</div>;

  return (
    <div className="create-exam">

      {/* ─── Sticky Top Bar ─────────────────────────────────── */}
      <header className="create-exam-topbar">
        <Link to="/dashboard" className="brand">MOD<span>-U-GO</span></Link>
        <span className="topbar-center">
          {isEditing ? "Edit Exam" : "Create New Exam"}
        </span>
        <div className="topbar-right">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="btn-secondary"
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <ArrowLeftIcon /> Back to Dashboard
          </button>
        </div>
      </header>

      {/* ─── Body ────────────────────────────────────────────── */}
      <div className="create-exam-body">

        {/* Page title */}
        <div className="create-exam-page-header">
          <h1>{isEditing ? "Edit Exam" : "Create New Exam"}</h1>
          <p>{isEditing ? "Update the details below and save." : "Fill in the details below to publish a new exam."}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="error-message">
            <span>⚠</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* ── Section 1: Exam Details ────────────────────── */}
          <div className="form-section">
            <h2>Exam Details</h2>

            <div className="form-group">
              <label htmlFor="exam-title">Title *</label>
              <input
                id="exam-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Midterm Examination — Computer Networks"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="exam-description">Description / Course Code</label>
              <textarea
                id="exam-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. CS-401 · Covering Chapters 1–5"
                rows={2}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="exam-scheduled">Scheduled Date & Time *</label>
                <input
                  id="exam-scheduled"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="exam-duration">Duration (minutes) *</label>
                <input
                  id="exam-duration"
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                  min="1"
                  required
                />
              </div>
            </div>
          </div>

          {/* ── Section 2: Settings ───────────────────────── */}
          <div className="form-section">
            <h2>Exam Settings</h2>

            <div className="settings-grid">
              {[
                { key: "requireWebcam",        label: "Require Webcam (Proctoring)", desc: "Enable webcam monitoring during the exam" },
                { key: "requireFullscreen",    label: "Require Fullscreen",          desc: "Exam must be taken in fullscreen mode" },
                { key: "shuffleQuestions",     label: "Shuffle Questions",            desc: "Randomize the order of questions" },
                { key: "shuffleOptions",       label: "Shuffle Options",              desc: "Randomize the order of MCQ options" },
                { key: "allowBackNavigation",  label: "Allow Back Navigation",        desc: "Allow students to revisit previous questions" },
                { key: "showResults",          label: "Show Results",                 desc: "Show score immediately after submission" },
                { key: "autoSubmit",           label: "Auto Submit",                  desc: "Automatically submit when time expires" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="setting-item">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings[key]}
                      onChange={(e) => updateSetting(key, e.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                  <p className="setting-description">{desc}</p>
                </div>
              ))}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="passing-score">Passing Score (%)</label>
                <input
                  id="passing-score"
                  type="number"
                  value={settings.passingScore}
                  onChange={(e) => updateSetting("passingScore", parseInt(e.target.value) || 0)}
                  min="0" max="100"
                />
              </div>
              <div className="form-group">
                <label htmlFor="max-attempts">Max Attempts</label>
                <input
                  id="max-attempts"
                  type="number"
                  value={settings.maxAttempts}
                  onChange={(e) => updateSetting("maxAttempts", parseInt(e.target.value) || 1)}
                  min="1"
                />
              </div>
            </div>

            {/* Proctoring Window */}
            <div className="proctoring-panel">
              <h3>🎥 Proctoring Window</h3>
              <p>Configure how long before and after the exam proctoring is active.</p>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="pre-buffer">Pre-exam buffer (minutes)</label>
                  <input
                    id="pre-buffer"
                    type="number"
                    value={settings.proctoringWindow?.preExamBufferMinutes ?? 5}
                    onChange={(e) =>
                      updateProctoringWindow(
                        "preExamBufferMinutes",
                        Math.min(15, Math.max(0, parseInt(e.target.value) || 0))
                      )
                    }
                    min="0" max="15"
                  />
                  <small style={{ display: "block", marginTop: "5px", fontSize: "12px", color: "#6B7280" }}>
                    Proctoring starts this many minutes <strong>before</strong> the exam (0–15, default 5)
                  </small>
                </div>
                <div className="form-group">
                  <label htmlFor="post-buffer">Post-submission buffer (minutes)</label>
                  <input
                    id="post-buffer"
                    type="number"
                    value={settings.proctoringWindow?.postSubmissionBufferMinutes ?? 2}
                    onChange={(e) =>
                      updateProctoringWindow(
                        "postSubmissionBufferMinutes",
                        Math.min(10, Math.max(0, parseInt(e.target.value) || 0))
                      )
                    }
                    min="0" max="10"
                  />
                  <small style={{ display: "block", marginTop: "5px", fontSize: "12px", color: "#6B7280" }}>
                    Proctoring continues this many minutes <strong>after</strong> submission (0–10, default 2)
                  </small>
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 3: Questions ──────────────────────── */}
          <div className="form-section">
            <div className="section-header">
              <h2>Questions</h2>
              <button type="button" onClick={addQuestion} className="btn-add">
                + Add Question
              </button>
            </div>

            {questions.map((question, qIndex) => (
              <div key={qIndex} className="question-builder">
                <div className="question-header">
                  <div className="question-number-badge">
                    <span>{qIndex + 1}</span>
                    <h3>Question {qIndex + 1}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeQuestion(qIndex)}
                    className="btn-remove"
                    disabled={questions.length === 1}
                  >
                    Remove
                  </button>
                </div>

                {/* Type / Points / Difficulty */}
                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>Question Type</label>
                    <select
                      value={question.type}
                      onChange={(e) => updateQuestion(qIndex, "type", e.target.value)}
                    >
                      <option value="mcq">Multiple Choice</option>
                      <option value="short_answer">Short Answer</option>
                      <option value="fill_blank">Fill in the Blank</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Points (Marks)</label>
                    <input
                      type="number"
                      value={question.points}
                      onChange={(e) => updateQuestion(qIndex, "points", parseInt(e.target.value) || 1)}
                      min="1"
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Difficulty</label>
                    <select
                      value={question.constraints?.difficultyLevel || "medium"}
                      onChange={(e) => updateConstraint(qIndex, "difficultyLevel", e.target.value)}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>

                {/* Word limit (short answer only) */}
                {(question.type === "short_answer" || question.type === "essay") && (
                  <div className="form-group">
                    <label>Word Limit (optional)</label>
                    <input
                      type="number"
                      value={question.constraints?.wordLimit || ""}
                      onChange={(e) =>
                        updateConstraint(qIndex, "wordLimit", e.target.value ? parseInt(e.target.value) : null)
                      }
                      placeholder="Leave empty for no limit"
                      min="1"
                    />
                  </div>
                )}

                {/* Question text */}
                <div className="form-group">
                  <label>Question Text *</label>
                  <textarea
                    value={question.question}
                    onChange={(e) => updateQuestion(qIndex, "question", e.target.value)}
                    placeholder="Enter your question…"
                    rows={3}
                    required
                  />
                </div>

                {/* MCQ Options */}
                {question.type === "mcq" && (
                  <div className="mcq-builder">
                    <label>Answer Options *</label>
                    {question.options.map((option, optIndex) => (
                      <div key={optIndex} className="option-input">
                        <span className="option-letter">
                          {OPTION_LETTERS[optIndex] || optIndex + 1}
                        </span>
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => updateOption(qIndex, optIndex, e.target.value)}
                          placeholder={`Option ${OPTION_LETTERS[optIndex] || optIndex + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => removeOption(qIndex, optIndex)}
                          className="btn-remove-small"
                          disabled={question.options.length <= 2}
                          title="Remove option"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addOption(qIndex)}
                      className="btn-add-small"
                    >
                      + Add Option
                    </button>
                  </div>
                )}

                {/* Correct Answer */}
                <div className="form-group">
                  <label>Correct Answer *</label>
                  {question.type === "mcq" ? (
                    <select
                      value={question.correctAnswer}
                      onChange={(e) => updateQuestion(qIndex, "correctAnswer", e.target.value)}
                      required
                    >
                      <option value="">— Select correct answer —</option>
                      {question.options
                        .filter((o) => o.trim())
                        .map((option, optIndex) => (
                          <option key={optIndex} value={option}>{option}</option>
                        ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={question.correctAnswer}
                      onChange={(e) => updateQuestion(qIndex, "correctAnswer", e.target.value)}
                      placeholder="Enter the correct answer"
                      required
                    />
                  )}
                </div>

                {/* Model Answer (for AI grading) */}
                {(question.type === "short_answer" || question.type === "essay" || question.type === "fill_blank") && (
                  <div className="form-group">
                    <label>Model Answer (AI Grading Reference) *</label>
                    <textarea
                      value={question.modelAnswer}
                      onChange={(e) => updateQuestion(qIndex, "modelAnswer", e.target.value)}
                      placeholder="Enter the ideal or model answer. The AI will compare student answers against this text."
                      rows={3}
                      required
                    />
                    <p className="ai-grading-note">
                      🤖 Used for AI Semantic Grading. Provide a comprehensive, representative answer.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Form Actions ──────────────────────────────── */}
          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="btn-cancel"
            >
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={submitting}>
              {submitting
                ? isEditing ? "Updating…" : "Creating…"
                : isEditing ? "Update Exam" : "Create Exam"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default CreateExam;

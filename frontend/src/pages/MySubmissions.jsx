import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { examService } from '../services/examService';
import './Submissions.css';

const MySubmissions = () => {
  const { getAuthToken } = useAuth();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    try {
      const token = await getAuthToken();
      const data = await examService.getMySubmissions(token);
      setSubmissions(data.submissions);
    } catch (error) {
      console.error('Error fetching submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading submissions...</div>;
  }

  return (
    <div className="submissions-page">
      <div className="submissions-header">
        <h1>My Submissions</h1>
        <button onClick={() => navigate('/dashboard')} className="btn-back">
          Back to Dashboard
        </button>
      </div>

      <div className="submissions-content">
        {submissions.length === 0 ? (
          <div className="no-data">
            <p>You haven't submitted any exams yet.</p>
          </div>
        ) : (
          <div className="submissions-list">
            {submissions.map((submission) => {
              const statusLabel = {
                in_progress: "In Progress",
                submitted: "Submitted",
                grading: "AI Grading in Progress...",
                graded: "Graded",
                partially_graded: "Partially Graded — Needs Review",
                locked: "Locked",
              }[submission.status] || submission.status;

              const statusColor = {
                in_progress: "#2196f3",
                submitted: "#607d8b",
                grading: "#ff9800",
                graded: "#4caf50",
                partially_graded: "#f57c00",
                locked: "#f44336",
              }[submission.status] || "#999";

              return (
                <div key={submission._id} className="submission-card">
                  <div className="submission-header">
                    <h3>{submission.examId?.title || 'Exam'}</h3>
                    <span
                      className="score-badge"
                      style={{ background: statusColor, color: '#fff', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem' }}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <p className="submission-description">
                    {submission.examId?.description || 'No description'}
                  </p>
                  <div className="submission-details">
                    <p><strong>Submitted:</strong> {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : 'Not yet submitted'}</p>
                    <p><strong>Answers:</strong> {submission.answers?.length || 0}</p>
                    {submission.status === "grading" ? (
                      <p style={{ color: '#ff9800', fontWeight: 600 }}>
                        Your text answers are currently being evaluated by AI. Check back shortly for your final score.
                      </p>
                    ) : submission.status === "partially_graded" ? (
                      <p style={{ color: '#f57c00', fontWeight: 600 }}>
                        Score so far: {submission.score}/{submission.maxScore} ({submission.percentage}%) — Some answers are pending teacher review.
                      </p>
                    ) : submission.status === "graded" || submission.status === "submitted" ? (
                      <p><strong>Score:</strong> {submission.score}/{submission.maxScore} ({submission.percentage}%)</p>
                    ) : null}
                    <p><strong>Tab Switches:</strong> {submission.tabSwitchCount}</p>
                    <p><strong>Fullscreen Exits:</strong> {submission.fullscreenExitCount}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MySubmissions;

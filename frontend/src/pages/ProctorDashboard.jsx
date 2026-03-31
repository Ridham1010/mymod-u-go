import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { examService } from "../services/examService";
import "./ProctorDashboard.css";

const ProctorDashboard = () => {
  const { userProfile, logout, getAuthToken } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("active");
  const [stats, setStats] = useState(null);
  const [activeSessions, setActiveSessions] = useState([]);
  const [flaggedSessions, setFlaggedSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState("");

  useEffect(() => {
    if (userProfile?.role !== "proctor" && userProfile?.role !== "admin") {
      navigate("/dashboard");
      return;
    }
    fetchDashboardData();

    // Refresh active sessions every 30 seconds
    const interval = setInterval(fetchActiveSessions, 30000);
    return () => clearInterval(interval);
  }, [userProfile]);

  const fetchDashboardData = async () => {
    try {
      const token = await getAuthToken();
      const [statsData, activeData, flaggedData] = await Promise.all([
        examService.getDashboardStats(token),
        examService.getActiveSessions(token),
        examService.getFlaggedSessions(token),
      ]);

      setStats(statsData.stats);
      setActiveSessions(activeData.sessions || []);
      setFlaggedSessions(flaggedData.sessions || []);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveSessions = async () => {
    try {
      const token = await getAuthToken();
      const activeData = await examService.getActiveSessions(token);
      setActiveSessions(activeData.sessions || []);
    } catch (error) {
      console.error("Error refreshing sessions:", error);
    }
  };

  const handleViewSession = async (session) => {
    try {
      const token = await getAuthToken();
      const data = await examService.getSessionDetails(token, session._id);
      setSelectedSession(data.session);
      setReviewNotes("");
    } catch (error) {
      alert("Error loading session details: " + error.message);
    }
  };

  const handleReviewSession = async (status) => {
    if (!selectedSession) return;

    try {
      const token = await getAuthToken();
      await examService.reviewSession(
        token,
        selectedSession._id,
        status,
        reviewNotes,
      );

      alert(`Session marked as ${status}`);
      setSelectedSession(null);
      fetchDashboardData();
    } catch (error) {
      alert("Error reviewing session: " + error.message);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const getSeverityClass = (severity) => {
    switch (severity) {
      case "high":
        return "severity-high";
      case "medium":
        return "severity-medium";
      case "low":
        return "severity-low";
      default:
        return "";
    }
  };

  if (loading) {
    return <div className="loading">Loading proctor dashboard...</div>;
  }

  return (
    <div className="dashboard proctor-dashboard">
      <header className="dashboard-header">
        <h1>Proctor Dashboard</h1>
        <div className="header-actions">
          <span className="user-name">Welcome, {userProfile?.name}</span>
          <span className="user-role badge-proctor">Proctor</span>
          <button onClick={handleLogout} className="btn-logout">
            Logout
          </button>
        </div>
      </header>

      {stats && (
        <div className="proctor-stats">
          <div className="stat-card">
            <span className="stat-icon">Active</span>
            <div>
              <h4>Active Sessions</h4>
              <p className="stat-value">
                {stats.activeSessions || activeSessions.length}
              </p>
            </div>
          </div>
          <div className="stat-card flagged">
            <span className="stat-icon">Alert</span>
            <div>
              <h4>Flagged</h4>
              <p className="stat-value">
                {stats.flaggedSessions || flaggedSessions.length}
              </p>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">Pending</span>
            <div>
              <h4>Pending Reviews</h4>
              <p className="stat-value">{stats.pendingReviews || 0}</p>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">Today</span>
            <div>
              <h4>Events Today</h4>
              <p className="stat-value">{stats.todayEvents || 0}</p>
            </div>
          </div>
        </div>
      )}

      <nav className="proctor-nav">
        <button
          className={`nav-tab ${activeTab === "active" ? "active" : ""}`}
          onClick={() => setActiveTab("active")}
        >
          Active Sessions ({activeSessions.length})
        </button>
        <button
          className={`nav-tab ${activeTab === "flagged" ? "active" : ""}`}
          onClick={() => setActiveTab("flagged")}
        >
          Flagged ({flaggedSessions.length})
        </button>
      </nav>

      <div className="dashboard-content">
        {activeTab === "active" && (
          <div className="sessions-section">
            <div className="section-header">
              <h2>Live Exam Sessions</h2>
              <button onClick={fetchActiveSessions} className="btn-refresh">
                Refresh
              </button>
            </div>

            {activeSessions.length === 0 ? (
              <div className="no-data">
                <p>No active exam sessions at the moment.</p>
              </div>
            ) : (
              <div className="sessions-grid">
                {activeSessions.map((session) => (
                  <div
                    key={session._id}
                    className={`session-card ${session.status === "flagged" ? "flagged" : ""}`}
                  >
                    <div className="session-header">
                      <h3>{session.studentId?.name || "Unknown Student"}</h3>
                      <span
                        className={`trust-badge ${session.trustScore < 50 ? "low" : session.trustScore < 75 ? "medium" : "high"}`}
                      >
                        Trust: {session.trustScore}%
                      </span>
                    </div>
                    <p className="exam-name">
                      {session.examId?.title || "Exam"}
                    </p>
                    <div className="session-stats">
                      <span>Events: {session.summary?.totalEvents || 0}</span>
                      <span>
                        High: {session.summary?.highSeverityEvents || 0}
                      </span>
                      <span>Tab: {session.summary?.totalTabSwitches || 0}</span>
                    </div>
                    <div className="session-time">
                      Started:{" "}
                      {new Date(session.startedAt).toLocaleTimeString()}
                    </div>
                    <button
                      onClick={() => handleViewSession(session)}
                      className="btn-view"
                    >
                      View Details
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "flagged" && (
          <div className="sessions-section">
            <h2>Flagged Sessions for Review</h2>

            {flaggedSessions.length === 0 ? (
              <div className="no-data">
                <p>No flagged sessions pending review.</p>
              </div>
            ) : (
              <div className="sessions-grid">
                {flaggedSessions.map((session) => (
                  <div key={session._id} className="session-card flagged">
                    <div className="session-header">
                      <h3>{session.studentId?.name || "Unknown Student"}</h3>
                      <span className="trust-badge low">
                        Trust: {session.trustScore}%
                      </span>
                    </div>
                    <p className="exam-name">
                      {session.examId?.title || "Exam"}
                    </p>
                    <div className="session-stats">
                      <span>Events: {session.summary?.totalEvents || 0}</span>
                      <span className="high-severity">
                        High: {session.summary?.highSeverityEvents || 0}
                      </span>
                    </div>
                    <div className="review-status">
                      Status: {session.reviewStatus || "pending"}
                    </div>
                    <button
                      onClick={() => handleViewSession(session)}
                      className="btn-review"
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Session Detail Modal */}
      {selectedSession && (
        <div className="modal-overlay" onClick={() => setSelectedSession(null)}>
          <div
            className="modal-content session-detail"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Session Details</h2>
              <button
                onClick={() => setSelectedSession(null)}
                className="btn-close"
              >
                x
              </button>
            </div>

            <div className="session-info">
              <div className="info-row">
                <strong>Student:</strong> {selectedSession.studentId?.name} (
                {selectedSession.studentId?.email})
              </div>
              <div className="info-row">
                <strong>Exam:</strong> {selectedSession.examId?.title}
              </div>
              <div className="info-row">
                <strong>Trust Score:</strong>
                <span
                  className={`trust-value ${selectedSession.trustScore < 50 ? "low" : "normal"}`}
                >
                  {selectedSession.trustScore}%
                </span>
              </div>
              <div className="info-row">
                <strong>Status:</strong> {selectedSession.status}
              </div>
              <div className="info-row">
                <strong>Started:</strong>{" "}
                {new Date(selectedSession.startedAt).toLocaleString()}
              </div>
              {selectedSession.endedAt && (
                <div className="info-row">
                  <strong>Ended:</strong>{" "}
                  {new Date(selectedSession.endedAt).toLocaleString()}
                </div>
              )}
            </div>

            <div className="events-section">
              <h3>Proctoring Events ({selectedSession.events?.length || 0})</h3>
              <div className="events-list">
                {selectedSession.events?.length === 0 ? (
                  <p>No events recorded</p>
                ) : (
                  selectedSession.events?.map((event, index) => (
                    <div
                      key={index}
                      className={`event-item ${getSeverityClass(event.severity)}`}
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
                      {event.details && (
                        <p className="event-details">{event.details}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {selectedSession.screenshots?.length > 0 && (
              <div className="screenshots-section">
                <h3>Screenshots ({selectedSession.screenshots.length})</h3>
                <div className="screenshots-grid">
                  {selectedSession.screenshots.slice(0, 6).map((ss, index) => (
                    <div key={index} className="screenshot-item">
                      <img src={ss.image} alt={`Screenshot ${index + 1}`} />
                      <span className="screenshot-time">
                        {new Date(ss.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedSession.violationClips?.length > 0 && (
              <div className="violation-clips-section">
                <h3>Violation Clips ({selectedSession.violationClips.length})</h3>
                <div className="violation-clips-list">
                  {selectedSession.violationClips.map((clip, index) => (
                    <div key={index} className="violation-clip-item">
                      <div className="clip-header">
                        <span className="clip-event-type">
                          {clip.eventType?.replace(/_/g, " ")}
                        </span>
                        <span className="clip-time">
                          {new Date(clip.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="clip-duration">{clip.duration || 10}s</span>
                      </div>
                      <video
                        src={clip.url}
                        controls
                        preload="metadata"
                        style={{ width: "100%", maxWidth: "400px", borderRadius: "8px", marginTop: "6px" }}
                      />
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
                placeholder="Add your review notes here..."
                rows={3}
              />
              <div className="review-actions">
                <button
                  onClick={() => handleReviewSession("cleared")}
                  className="btn-clear"
                >
                  Clear
                </button>
                <button
                  onClick={() => handleReviewSession("reviewed")}
                  className="btn-reviewed"
                >
                  Mark Reviewed
                </button>
                <button
                  onClick={() => handleReviewSession("flagged")}
                  className="btn-flag"
                >
                  Flag
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProctorDashboard;

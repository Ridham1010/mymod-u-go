import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { examService } from "../services/examService";
import "./Dashboard.css";

/* ── small SVG helpers ─────────────────────────────────── */
const CalendarIcon = () => (
  <svg className="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const ClockIcon = () => (
  <svg className="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

const QuestionIcon = () => (
  <svg className="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2" />
    <path d="M9 7h6M9 11h6M9 15h4" />
  </svg>
);

const PercentIcon = () => (
  <svg className="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.5" cy="7.5" r="2.5" />
    <circle cx="16.5" cy="16.5" r="2.5" />
    <path d="M18 6L6 18" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const Dashboard = () => {
  const { userProfile, logout, getAuthToken } = useAuth();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchExams();
    fetchNotifications();
  }, []);

  const fetchExams = async () => {
    try {
      const token = await getAuthToken();
      const data = await examService.getExams(token);
      setExams(data.exams);
    } catch (error) {
      console.error("Error fetching exams:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const token = await getAuthToken();
      const data = await examService.getNotifications(token);
      setNotifications(
        data.notifications?.filter((n) => !n.isRead).slice(0, 5) || [],
      );
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const markNotificationRead = async (notificationId) => {
    try {
      const token = await getAuthToken();
      await examService.markNotificationRead(token, notificationId);
      setNotifications(notifications.filter((n) => n._id !== notificationId));
    } catch (error) {
      console.error("Error marking notification read:", error);
    }
  };

  const getExamStatus = (exam) => {
    const now = new Date();
    const scheduledAt = new Date(exam.scheduledAt);
    const endTime = new Date(scheduledAt.getTime() + exam.duration * 60000);

    if (now < scheduledAt) {
      return { status: "upcoming", label: "Upcoming", className: "status-upcoming" };
    } else if (now >= scheduledAt && now <= endTime) {
      return { status: "active", label: "Active Now", className: "status-active" };
    } else {
      return { status: "ended", label: "Ended", className: "status-ended" };
    }
  };

  const pageTitle =
    userProfile?.role === "teacher" ? "My Exams"
    : userProfile?.role === "admin" ? "All Exams"
    : userProfile?.role === "proctor" ? "Assigned Exams"
    : "Available Exams";

  if (loading) {
    return <div className="loading">Loading dashboard…</div>;
  }

  return (
    <div className="dashboard">

      {/* ─── Sticky Top Nav ─────────────────────────────────── */}
      <header className="dashboard-header">
        {/* Left — brand */}
        <h1 className="brand">MOD<span>-U-GO</span></h1>

        {/* Center — nav links */}
        <nav className="header-nav">
          <Link to="/dashboard" className="nav-link active">Dashboard</Link>
          {userProfile?.role === "student" && (
            <Link to="/my-submissions" className="nav-link">My Submissions</Link>
          )}
          {(userProfile?.role === "teacher" || userProfile?.role === "admin") && (
            <Link to="/create-exam" className="nav-link">Create Exam</Link>
          )}
          {(userProfile?.role === "proctor" || userProfile?.role === "admin") && (
            <Link to="/proctor" className="nav-link">Proctor Dashboard</Link>
          )}
          {userProfile?.role === "admin" && (
            <Link to="/admin" className="nav-link">Admin Panel</Link>
          )}
        </nav>

        {/* Right — user info */}
        <div className="header-actions">
          <div className="user-avatar">
            {userProfile?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <span className="user-name">{userProfile?.name}</span>
          <span className={`user-role role-${userProfile?.role}`}>
            {userProfile?.role?.toUpperCase()}
          </span>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </header>

      {/* ─── Main Content ────────────────────────────────────── */}
      <div className="dashboard-content">

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="notifications-banner">
            <h3>Notifications</h3>
            <div className="notification-list">
              {notifications.map((notification) => (
                <div
                  key={notification._id}
                  className={`notification-item priority-${notification.priority}`}
                >
                  <span className="notification-title">{notification.title}</span>
                  <span className="notification-message">{notification.message}</span>
                  <button
                    onClick={() => markNotificationRead(notification._id)}
                    className="btn-dismiss"
                    title="Dismiss"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Page header row */}
        <div className="dashboard-header-section">
          <div className="page-title-group">
            <h2>{pageTitle}</h2>
            {exams.length > 0 && (
              <span className="exam-count-badge">{exams.length} exam{exams.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="header-buttons">
            {(userProfile?.role === "teacher" || userProfile?.role === "admin") && (
              <button onClick={() => navigate("/create-exam")} className="btn-primary">
                + Create New Exam
              </button>
            )}
            {userProfile?.role === "student" && (
              <button onClick={() => navigate("/my-submissions")} className="btn-secondary">
                View My Submissions
              </button>
            )}
          </div>
        </div>

        {/* Empty state */}
        {exams.length === 0 ? (
          <div className="no-exams">
            <div className="no-exams-icon">📋</div>
            <p>
              {userProfile?.role === "teacher"
                ? "No exams created yet. Create your first exam!"
                : "No active exams available at the moment."}
            </p>
            {(userProfile?.role === "teacher" || userProfile?.role === "admin") && (
              <button onClick={() => navigate("/create-exam")} className="btn-primary">
                Create Your First Exam
              </button>
            )}
          </div>
        ) : (
          /* ── Exam Cards Grid ─────────────────────────────── */
          <div className="exams-grid">
            {exams.map((exam) => {
              const examStatus = getExamStatus(exam);
              return (
                <div key={exam._id} className="exam-card">

                  {/* Card Header */}
                  <div className="exam-card-header">
                    <div className="exam-title-group">
                      <h3 title={exam.title}>{exam.title}</h3>
                      {exam.description && (
                        <span className="exam-course-code">
                          {exam.description.length > 40
                            ? exam.description.slice(0, 40) + "…"
                            : exam.description}
                        </span>
                      )}
                    </div>
                    <span className={`exam-status ${examStatus.className}`}>
                      {examStatus.label}
                    </span>
                  </div>

                  {/* Divider */}
                  <div className="card-divider" />

                  {/* Stats row — 4-column grid */}
                  <div className="exam-details">
                    <div className="detail-col">
                      <CalendarIcon />
                      <span className="detail-value">
                        {new Date(exam.scheduledAt).toLocaleDateString("en-GB", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </span>
                      <span className="detail-label">Date</span>
                    </div>
                    <div className="detail-col">
                      <ClockIcon />
                      <span className="detail-value">{exam.duration} min</span>
                      <span className="detail-label">Duration</span>
                    </div>
                    <div className="detail-col">
                      <QuestionIcon />
                      <span className="detail-value">{exam.questions?.length || 0}</span>
                      <span className="detail-label">Questions</span>
                    </div>
                    <div className="detail-col">
                      <PercentIcon />
                      <span className="detail-value">
                        {exam.settings?.passingScore != null ? `${exam.settings.passingScore}%` : "—"}
                      </span>
                      <span className="detail-label">Passing</span>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="card-divider" />

                  {/* Card Footer */}
                  <div className="exam-card-footer">
                    {exam.settings?.requireWebcam && (
                      <div className="exam-mode">
                        <ShieldIcon />
                        Mode: Proctored
                      </div>
                    )}

                    <div className="exam-actions">
                      {userProfile?.role === "teacher" || userProfile?.role === "admin" ? (
                        <>
                          <button
                            onClick={() => navigate(`/edit-exam/${exam._id}`)}
                            className="btn-primary"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => navigate(`/exam-submissions/${exam._id}`)}
                            className="btn-secondary"
                          >
                            Submissions
                          </button>
                        </>
                      ) : userProfile?.role === "proctor" ? (
                        <button
                          onClick={() => navigate("/proctor")}
                          className="btn-primary"
                        >
                          Monitor
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/take-exam/${exam._id}`)}
                          className="btn-primary"
                          disabled={examStatus.status === "ended"}
                        >
                          {examStatus.status === "active"
                            ? "Take Exam Now"
                            : examStatus.status === "upcoming"
                              ? "View Details"
                              : "Exam Ended"}
                        </button>
                      )}
                    </div>
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

export default Dashboard;

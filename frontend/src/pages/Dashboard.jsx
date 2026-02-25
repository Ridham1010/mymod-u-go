import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { examService } from "../services/examService";
import "./Dashboard.css";

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
      return {
        status: "upcoming",
        label: "Upcoming",
        className: "status-upcoming",
      };
    } else if (now >= scheduledAt && now <= endTime) {
      return {
        status: "active",
        label: "Active Now",
        className: "status-active",
      };
    } else {
      return { status: "ended", label: "Ended", className: "status-ended" };
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="brand">MOD-U-GO</h1>
        <nav className="header-nav">
          <Link to="/dashboard" className="nav-link active">
            Dashboard
          </Link>
          {userProfile?.role === "student" && (
            <Link to="/my-submissions" className="nav-link">
              My Submissions
            </Link>
          )}
          {(userProfile?.role === "teacher" ||
            userProfile?.role === "admin") && (
            <Link to="/create-exam" className="nav-link">
              Create Exam
            </Link>
          )}
          {(userProfile?.role === "proctor" ||
            userProfile?.role === "admin") && (
            <Link to="/proctor" className="nav-link">
              Proctor Dashboard
            </Link>
          )}
          {userProfile?.role === "admin" && (
            <Link to="/admin" className="nav-link">
              Admin Panel
            </Link>
          )}
        </nav>
        <div className="header-actions">
          <div className="user-avatar">
            {userProfile?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <span className="user-name">Welcome, {userProfile?.name}</span>
          <span className={`user-role role-${userProfile?.role}`}>
            {userProfile?.role?.toUpperCase()}
          </span>
          <button onClick={handleLogout} className="btn-logout">
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        {/* Notifications Banner */}
        {notifications.length > 0 && (
          <div className="notifications-banner">
            <h3>Notifications</h3>
            <div className="notification-list">
              {notifications.map((notification) => (
                <div
                  key={notification._id}
                  className={`notification-item priority-${notification.priority}`}
                >
                  <span className="notification-title">
                    {notification.title}
                  </span>
                  <span className="notification-message">
                    {notification.message}
                  </span>
                  <button
                    onClick={() => markNotificationRead(notification._id)}
                    className="btn-dismiss"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="dashboard-header-section">
          <h2>
            {userProfile?.role === "teacher"
              ? "My Exams"
              : userProfile?.role === "admin"
                ? "All Exams"
                : userProfile?.role === "proctor"
                  ? "Assigned Exams"
                  : "Available Exams"}
          </h2>
          <div className="header-buttons">
            {(userProfile?.role === "teacher" ||
              userProfile?.role === "admin") && (
              <button
                onClick={() => navigate("/create-exam")}
                className="btn-primary"
              >
                + Create New Exam
              </button>
            )}
            {userProfile?.role === "student" && (
              <button
                onClick={() => navigate("/my-submissions")}
                className="btn-secondary"
              >
                View My Submissions
              </button>
            )}
          </div>
        </div>

        {exams.length === 0 ? (
          <div className="no-exams">
            <div className="no-exams-icon"></div>
            <p>
              {userProfile?.role === "teacher"
                ? "No exams created yet. Create your first exam!"
                : "No active exams available at the moment."}
            </p>
            {(userProfile?.role === "teacher" ||
              userProfile?.role === "admin") && (
              <button
                onClick={() => navigate("/create-exam")}
                className="btn-primary"
              >
                Create Your First Exam
              </button>
            )}
          </div>
        ) : (
          <div className="exams-grid">
            {exams.map((exam) => {
              const examStatus = getExamStatus(exam);
              return (
                <div
                  key={exam._id}
                  className={`exam-card ${examStatus.className}`}
                >
                  <div className="exam-card-header">
                    <h3>{exam.title}</h3>
                    <span className={`exam-status ${examStatus.className}`}>
                      {examStatus.label}
                    </span>
                  </div>
                  <p className="exam-description">{exam.description}</p>
                  <div className="exam-details">
                    <div className="detail-col">
                      <svg
                        className="detail-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      <span className="detail-label">Date:</span>
                      <span className="detail-value">
                        {new Date(exam.scheduledAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="detail-col">
                      <svg
                        className="detail-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                      <span className="detail-label">Duration:</span>
                      <span className="detail-value">{exam.duration} min</span>
                    </div>
                    <div className="detail-col">
                      <svg
                        className="detail-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <rect x="5" y="2" width="14" height="20" rx="2" />
                        <path d="M9 7h6M9 11h6M9 15h4" />
                      </svg>
                      <span className="detail-label">Questions:</span>
                      <span className="detail-value">
                        {exam.questions?.length || 0}
                      </span>
                    </div>
                    {exam.settings?.passingScore && (
                      <div className="detail-col">
                        <svg
                          className="detail-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <circle cx="7" cy="7" r="3" />
                          <circle cx="17" cy="17" r="3" />
                          <path d="M18 4L6 20" />
                        </svg>
                        <span className="detail-label">Passing:</span>
                        <span className="detail-value">
                          {exam.settings.passingScore}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="exam-card-footer">
                    {exam.settings?.requireWebcam && (
                      <div className="exam-mode">
                        <svg
                          className="mode-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        Mode: Proctored
                      </div>
                    )}
                    <div className="exam-actions">
                      {userProfile?.role === "teacher" ||
                      userProfile?.role === "admin" ? (
                        <>
                          <button
                            onClick={() => navigate(`/edit-exam/${exam._id}`)}
                            className="btn-secondary"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() =>
                              navigate(`/exam-submissions/${exam._id}`)
                            }
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

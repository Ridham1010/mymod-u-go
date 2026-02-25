import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { examService } from "../services/examService";
import "./AdminDashboard.css";

const AdminDashboard = () => {
  const { userProfile, logout, getAuthToken } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [exams, setExams] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  useEffect(() => {
    if (userProfile?.role !== "admin") {
      navigate("/dashboard");
      return;
    }
    fetchDashboardData();
  }, [userProfile]);

  const fetchDashboardData = async () => {
    try {
      const token = await getAuthToken();
      const [statsData, usersData, examsData, reportsData] = await Promise.all([
        examService.getDashboardStats(token),
        examService.getUsers(token, 1, 50),
        examService.getAdminExams(token, 1, 50),
        examService.getReports(token).catch(() => ({ reports: [] })),
      ]);

      setStats(statsData.stats);
      setUsers(usersData.users);
      setExams(examsData.exams);
      setReports(reportsData.reports);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUserRole = async (userId, newRole) => {
    try {
      const token = await getAuthToken();
      await examService.updateUser(token, userId, { role: newRole });
      setUsers(
        users.map((u) => (u._id === userId ? { ...u, role: newRole } : u)),
      );
      alert("User role updated successfully");
    } catch (error) {
      alert("Error updating user: " + error.message);
    }
  };

  const handleToggleUserStatus = async (userId, isActive) => {
    try {
      const token = await getAuthToken();
      await examService.updateUser(token, userId, { isActive: !isActive });
      setUsers(
        users.map((u) =>
          u._id === userId ? { ...u, isActive: !isActive } : u,
        ),
      );
    } catch (error) {
      alert("Error updating user: " + error.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this user? This will also delete all their data.",
      )
    ) {
      return;
    }
    try {
      const token = await getAuthToken();
      await examService.deleteUser(token, userId);
      setUsers(users.filter((u) => u._id !== userId));
      alert("User deleted successfully");
    } catch (error) {
      alert("Error deleting user: " + error.message);
    }
  };

  const handleDeleteExam = async (examId) => {
    if (!window.confirm("Are you sure you want to delete this exam?")) {
      return;
    }
    try {
      const token = await getAuthToken();
      await examService.deleteExamAdmin(token, examId);
      setExams(exams.filter((e) => e._id !== examId));
      alert("Exam deleted successfully");
    } catch (error) {
      alert("Error deleting exam: " + error.message);
    }
  };

  const generateReport = async (type) => {
    try {
      const token = await getAuthToken();
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);

      await examService.generateReport(
        token,
        type,
        startDate.toISOString(),
        endDate.toISOString(),
      );
      alert("Report generated successfully");

      const reportsData = await examService.getReports(token);
      setReports(reportsData.reports);
    } catch (error) {
      alert("Error generating report: " + error.message);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = !roleFilter || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (loading) {
    return <div className="loading">Loading admin dashboard...</div>;
  }

  return (
    <div className="dashboard admin-dashboard ">
      <header className="dashboard-header">
        <h1>Admin Dashboard</h1>
        <div className="header-actions">
          <span className="user-name">Welcome, {userProfile?.name}</span>
          <span className="user-role badge-admin">Admin</span>
          <button onClick={handleLogout} className="btn-logout">
            Logout
          </button>
        </div>
      </header>

      <nav className="admin-nav">
        <button
          className={`nav-tab ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          className={`nav-tab ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Users ({users.length})
        </button>
        <button
          className={`nav-tab ${activeTab === "exams" ? "active" : ""}`}
          onClick={() => setActiveTab("exams")}
        >
          Exams ({exams.length})
        </button>
        <button
          className={`nav-tab ${activeTab === "reports" ? "active" : ""}`}
          onClick={() => setActiveTab("reports")}
        >
          Reports
        </button>
      </nav>

      <div className="dashboard-content">
        {activeTab === "overview" && stats && (
          <div className="overview-section">
            <h2>System Overview</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Users</h3>
                <p className="stat-value">{stats.totalUsers}</p>
                <div className="stat-breakdown">
                  <span>Students: {stats.totalStudents}</span>
                  <span>Teachers: {stats.totalTeachers}</span>
                  <span>Proctors: {stats.totalProctors}</span>
                </div>
              </div>
              <div className="stat-card">
                <h3>Exams</h3>
                <p className="stat-value">{stats.totalExams}</p>
                <div className="stat-breakdown">
                  <span>Active: {stats.activeExams}</span>
                </div>
              </div>
              <div className="stat-card">
                <h3>Submissions</h3>
                <p className="stat-value">{stats.totalSubmissions}</p>
                <div className="stat-breakdown">
                  <span>Today: {stats.recentSubmissions}</span>
                  <span className="flagged">
                    Flagged: {stats.flaggedSubmissions}
                  </span>
                </div>
              </div>
            </div>

            <div className="quick-actions">
              <h3>Quick Actions</h3>
              <div className="action-buttons">
                <button
                  onClick={() => generateReport("system_usage")}
                  className="btn-action"
                >
                  Generate System Report
                </button>
                <button
                  onClick={() => generateReport("flagged_submissions")}
                  className="btn-action"
                >
                  Flagged Submissions Report
                </button>
                <button
                  onClick={() => setActiveTab("users")}
                  className="btn-action"
                >
                  Manage Users
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "users" && (
          <div className="users-section">
            <div className="section-header">
              <h2>User Management</h2>
              <div className="filters">
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="role-filter"
                >
                  <option value="">All Roles</option>
                  <option value="student">Students</option>
                  <option value="teacher">Teachers</option>
                  <option value="proctor">Proctors</option>
                  <option value="admin">Admins</option>
                </select>
              </div>
            </div>

            <div className="users-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user._id}
                      className={!user.isActive ? "inactive" : ""}
                    >
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleUpdateUserRole(user._id, e.target.value)
                          }
                          className="role-select"
                        >
                          <option value="student">Student</option>
                          <option value="teacher">Teacher</option>
                          <option value="proctor">Proctor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${user.isActive ? "active" : "inactive"}`}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                      <td className="actions">
                        <button
                          onClick={() =>
                            handleToggleUserStatus(user._id, user.isActive)
                          }
                          className="btn-small"
                        >
                          {user.isActive ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user._id)}
                          className="btn-small btn-danger"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "exams" && (
          <div className="exams-section">
            <h2>All Exams</h2>
            <div className="exams-table">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Teacher</th>
                    <th>Status</th>
                    <th>Submissions</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map((exam) => (
                    <tr key={exam._id}>
                      <td>{exam.title}</td>
                      <td>{exam.teacherId?.name || "Unknown"}</td>
                      <td>
                        <span
                          className={`status-badge ${exam.isActive && new Date(exam.endTime) > new Date() ? "active" : "ended"}`}
                        >
                          {exam.isActive && new Date(exam.endTime) > new Date()
                            ? "Active"
                            : "Ended"}
                        </span>
                      </td>
                      <td>{exam.totalSubmissions || 0}</td>
                      <td>{new Date(exam.createdAt).toLocaleDateString()}</td>
                      <td className="actions">
                        <button
                          onClick={() => handleDeleteExam(exam._id)}
                          className="btn-small btn-danger"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "reports" && (
          <div className="reports-section">
            <h2>Reports</h2>
            <div className="report-actions">
              <button
                onClick={() => generateReport("exam_analytics")}
                className="btn-report"
              >
                Exam Analytics
              </button>
              <button
                onClick={() => generateReport("student_performance")}
                className="btn-report"
              >
                Student Performance
              </button>
              <button
                onClick={() => generateReport("proctoring_summary")}
                className="btn-report"
              >
                Proctoring Summary
              </button>
              <button
                onClick={() => generateReport("system_usage")}
                className="btn-report"
              >
                System Usage
              </button>
            </div>

            <div className="reports-list">
              <h3>Generated Reports</h3>
              {reports.length === 0 ? (
                <p className="no-data">No reports generated yet.</p>
              ) : (
                <div className="reports-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Report Type</th>
                        <th>Date Range</th>
                        <th>Generated</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report) => (
                        <tr key={report._id}>
                          <td>
                            {report.type
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (l) => l.toUpperCase())}
                          </td>
                          <td>
                            {new Date(report.startDate).toLocaleDateString()} -{" "}
                            {new Date(report.endDate).toLocaleDateString()}
                          </td>
                          <td>{new Date(report.createdAt).toLocaleString()}</td>
                          <td>
                            <span className={`status-badge ${report.status}`}>
                              {report.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;

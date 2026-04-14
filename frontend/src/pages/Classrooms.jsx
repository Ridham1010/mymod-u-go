import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { examService } from "../services/examService";
import "./Dashboard.css";
import "./Classrooms.css";

/* ── SVG helpers ───────────────────────────────────────────── */
const PeopleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const BookIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2" />
    <path d="M9 7h6M9 11h6M9 15h4" />
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const BAND_COLORS = ["band-blue", "band-green", "band-purple", "band-orange", "band-pink", "band-teal"];

const Classrooms = () => {
  const { userProfile, logout, getAuthToken } = useAuth();
  const navigate = useNavigate();

  const [classrooms, setClassrooms] = useState([]);
  const [enrolledClassrooms, setEnrolledClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("my"); // "my" | "browse"
  const [joinCode, setJoinCode] = useState("");
  const [joinMessage, setJoinMessage] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", section: "", subject: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const isTeacher = userProfile?.role === "teacher" || userProfile?.role === "admin";

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");
      const token = await getAuthToken();

      if (isTeacher) {
        const data = await examService.getClassrooms(token);
        setClassrooms(data.classrooms || []);
      } else {
        // Student: fetch enrolled and all classrooms separately so one failure
        // doesn't break the other
        let enrolled = [];
        let all = [];

        try {
          const enrolledData = await examService.getEnrolledClassrooms(token);
          enrolled = enrolledData.classrooms || [];
        } catch (err) {
          console.error("Error fetching enrolled classrooms:", err);
        }

        try {
          const allData = await examService.getClassrooms(token);
          all = allData.classrooms || [];
        } catch (err) {
          console.error("Error fetching all classrooms:", err);
        }

        setEnrolledClassrooms(enrolled);
        setClassrooms(all);
      }
    } catch (err) {
      console.error("Error fetching classrooms:", err);
      setError("Failed to load classrooms. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClassroom = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;

    try {
      setCreating(true);
      const token = await getAuthToken();
      await examService.createClassroom(token, createForm);
      setShowCreateModal(false);
      setCreateForm({ name: "", description: "", section: "", subject: "" });
      fetchData();
    } catch (err) {
      console.error("Error creating classroom:", err);
      setError(err.response?.data?.message || "Failed to create classroom");
    } finally {
      setCreating(false);
    }
  };

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) return;
    try {
      const token = await getAuthToken();
      await examService.enrollByCode(token, joinCode.trim());
      setJoinMessage({ type: "success", text: "Enrolled successfully!" });
      setJoinCode("");
      fetchData();
      setTimeout(() => setJoinMessage(null), 3000);
    } catch (err) {
      setJoinMessage({
        type: "error",
        text: err.response?.data?.message || "Failed to join",
      });
      setTimeout(() => setJoinMessage(null), 4000);
    }
  };

  const handleEnroll = async (classroomId, e) => {
    e.stopPropagation();
    try {
      const token = await getAuthToken();
      await examService.enrollInClassroom(token, classroomId);
      fetchData();
    } catch (err) {
      console.error("Error enrolling:", err);
      setError(err.response?.data?.message || "Failed to enroll");
    }
  };

  const copyCode = (code, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
  };

  const getBandColor = (index) => BAND_COLORS[index % BAND_COLORS.length];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // Determine which list to render
  const displayList = isTeacher
    ? classrooms
    : activeTab === "my"
      ? enrolledClassrooms
      : classrooms;

  if (loading) {
    return <div className="loading">Loading classrooms…</div>;
  }

  return (
    <div className="classrooms-page">

      {/* ─── Sticky Top Nav (same style as Dashboard) ──────── */}
      <header className="dashboard-header">
        <h1 className="brand">MOD<span>-U-GO</span></h1>
        <nav className="header-nav">
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
          <Link to="/classrooms" className="nav-link active">Classrooms</Link>
          {userProfile?.role === "student" && (
            <Link to="/my-submissions" className="nav-link">My Submissions</Link>
          )}
          {isTeacher && (
            <Link to="/create-exam" className="nav-link">Create Exam</Link>
          )}
          {(userProfile?.role === "proctor" || userProfile?.role === "admin") && (
            <Link to="/proctor" className="nav-link">Proctor Dashboard</Link>
          )}
          {userProfile?.role === "admin" && (
            <Link to="/admin" className="nav-link">Admin Panel</Link>
          )}
        </nav>
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

      {/* ─── Body ──────────────────────────────────────────── */}
      <div className="classrooms-content">

        {error && <div className="error-banner">{error}</div>}

        {/* Page Header */}
        <div className="classrooms-header-section">
          <h2>{isTeacher ? "My Classrooms" : "Classrooms"}</h2>
          <div className="classrooms-header-right">
            {isTeacher && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary"
              >
                + Create Classroom
              </button>
            )}
          </div>
        </div>

        {/* Student tabs */}
        {!isTeacher && (
          <>
            <div className="classrooms-tabs">
              <button
                className={`tab-btn ${activeTab === "my" ? "active" : ""}`}
                onClick={() => setActiveTab("my")}
              >
                My Classrooms
              </button>
              <button
                className={`tab-btn ${activeTab === "browse" ? "active" : ""}`}
                onClick={() => setActiveTab("browse")}
              >
                Browse All
              </button>
            </div>

            {/* Join by code */}
            <div className="join-code-section">
              <label>Join with Code:</label>
              <div className="join-code-input-group">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2C3"
                  maxLength={6}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
                />
                <button
                  className="btn-join"
                  onClick={handleJoinByCode}
                  disabled={!joinCode.trim()}
                >
                  Join
                </button>
              </div>
              {joinMessage && (
                <span className={`join-message ${joinMessage.type}`}>
                  {joinMessage.text}
                </span>
              )}
            </div>
          </>
        )}

        {/* Classroom Grid */}
        {displayList.length === 0 ? (
          <div className="no-classrooms">
            <div className="no-classrooms-icon">—</div>
            <p>
              {isTeacher
                ? "No classrooms yet. Create your first classroom!"
                : activeTab === "my"
                  ? "You haven't joined any classrooms yet. Browse all classrooms or use an enrollment code."
                  : "No classrooms available at the moment."
              }
            </p>
            {isTeacher && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary"
              >
                Create Your First Classroom
              </button>
            )}
          </div>
        ) : (
          <div className="classrooms-grid">
            {displayList.map((classroom, index) => (
              <div
                key={classroom._id}
                className="classroom-card"
                onClick={() => navigate(`/classroom/${classroom._id}`)}
              >
                <div className={`classroom-card-band ${getBandColor(index)}`} />
                <div className="classroom-card-body">
                  <h3 title={classroom.name}>{classroom.name}</h3>
                  {classroom.subject && (
                    <span className="classroom-subject">{classroom.subject}</span>
                  )}
                  {classroom.section && (
                    <span className="classroom-section">{classroom.section}</span>
                  )}
                  {classroom.description && (
                    <p className="classroom-description">{classroom.description}</p>
                  )}
                  {!isTeacher && classroom.teacherId && (
                    <div className="classroom-teacher">
                      by <strong>{classroom.teacherId.name || "Teacher"}</strong>
                    </div>
                  )}
                </div>

                <div className="classroom-card-footer">
                  <div className="classroom-stats">
                    <span className="classroom-stat">
                      <PeopleIcon />
                      {classroom.studentCount || classroom.students?.length || 0}
                    </span>
                    <span className="classroom-stat">
                      <BookIcon />
                      {classroom.examCount || 0} exams
                    </span>
                  </div>

                  {/* Teacher: show enrollment code */}
                  {isTeacher && classroom.enrollmentCode && (
                    <div className="enrollment-code-display">
                      Code: <code>{classroom.enrollmentCode}</code>
                      <button
                        className="btn-copy-code"
                        onClick={(e) => copyCode(classroom.enrollmentCode, e)}
                        title="Copy code"
                      >
                        <CopyIcon />
                      </button>
                    </div>
                  )}

                  {/* Student: enrolled badge or join button */}
                  {!isTeacher && (
                    classroom.isEnrolled ? (
                      <span className="enrolled-badge">Enrolled</span>
                    ) : (
                      <button
                        className="btn-enroll-card"
                        onClick={(e) => handleEnroll(classroom._id, e)}
                      >
                        Join
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Create Classroom Modal ───────────────────────── */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Create Classroom</h2>
            <form onSubmit={handleCreateClassroom}>
              <div className="form-group">
                <label>Classroom Name *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. Computer Networks — Fall 2026"
                  required
                  autoFocus
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Subject</label>
                  <input
                    type="text"
                    value={createForm.subject}
                    onChange={(e) => setCreateForm({ ...createForm, subject: e.target.value })}
                    placeholder="e.g. CS-401"
                  />
                </div>
                <div className="form-group">
                  <label>Section</label>
                  <input
                    type="text"
                    value={createForm.section}
                    onChange={(e) => setCreateForm({ ...createForm, section: e.target.value })}
                    placeholder="e.g. Section A"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Brief description of this classroom…"
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel-modal"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? "Creating…" : "Create Classroom"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Classrooms;

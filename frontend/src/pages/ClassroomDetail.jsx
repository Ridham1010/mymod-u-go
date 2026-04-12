import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { examService } from "../services/examService";
import "./Dashboard.css";
import "./ClassroomDetail.css";

/* ── small SVG helpers ─────────────────────────────────────── */
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

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ClassroomDetail = () => {
  const { classroomId } = useParams();
  const { userProfile, getAuthToken } = useAuth();
  const navigate = useNavigate();

  const [classroom, setClassroom] = useState(null);
  const [exams, setExams] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("exams"); // "exams" | "students"
  const [error, setError] = useState("");

  const isTeacher = userProfile?.role === "teacher" || userProfile?.role === "admin";

  useEffect(() => {
    fetchClassroomData();
  }, [classroomId]);

  const fetchClassroomData = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();

      const classroomData = await examService.getClassroom(token, classroomId);
      setClassroom(classroomData.classroom);

      const examsData = await examService.getClassroomExams(token, classroomId);
      setExams(examsData.exams);

      // Fetch students for teachers
      if (isTeacher) {
        try {
          const studentsData = await examService.getClassroomStudents(token, classroomId);
          setStudents(studentsData.students);
        } catch {
          // Non-critical
        }
      }
    } catch (err) {
      console.error("Error fetching classroom:", err);
      setError(err.response?.data?.message || "Failed to load classroom");
    } finally {
      setLoading(false);
    }
  };

  const getExamStatus = (exam) => {
    const now = new Date();
    const scheduledAt = new Date(exam.scheduledAt);
    const endTime = new Date(exam.endTime);

    if (now < scheduledAt) {
      return { status: "upcoming", label: "Upcoming", className: "access-upcoming" };
    } else if (now >= scheduledAt && now <= endTime) {
      return { status: "available", label: "Active Now", className: "access-available" };
    } else {
      return { status: "ended", label: "Ended", className: "access-ended" };
    }
  };

  const copyCode = () => {
    if (classroom?.enrollmentCode) {
      navigator.clipboard.writeText(classroom.enrollmentCode);
    }
  };

  const handleEnroll = async () => {
    try {
      const token = await getAuthToken();
      await examService.enrollInClassroom(token, classroomId);
      fetchClassroomData();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to enroll");
    }
  };

  const handleUnenroll = async () => {
    if (!window.confirm("Are you sure you want to leave this classroom?")) return;
    try {
      const token = await getAuthToken();
      await examService.unenrollFromClassroom(token, classroomId);
      navigate("/classrooms");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to unenroll");
    }
  };

  if (loading) {
    return <div className="loading">Loading classroom…</div>;
  }

  if (!classroom) {
    return (
      <div className="loading">
        <p>{error || "Classroom not found"}</p>
        <button className="btn-primary" onClick={() => navigate("/classrooms")}>
          Back to Classrooms
        </button>
      </div>
    );
  }

  return (
    <div className="classroom-detail">

      {/* ─── Sticky Top Nav ───────────────────────────────── */}
      <header className="dashboard-header">
        <Link to="/dashboard" className="brand" style={{ textDecoration: "none" }}>
          MOD<span>-U-GO</span>
        </Link>
        <nav className="header-nav">
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
          <Link to="/classrooms" className="nav-link">Classrooms</Link>
          {userProfile?.role === "student" && (
            <Link to="/my-submissions" className="nav-link">My Submissions</Link>
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
        </div>
      </header>

      {/* ─── Body ──────────────────────────────────────────── */}
      <div className="classroom-detail-content">

        {/* Breadcrumb */}
        <div className="breadcrumb">
          <Link to="/classrooms">Classrooms</Link>
          <span className="separator">›</span>
          <span className="current">{classroom.name}</span>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {/* Classroom Info Header */}
        <div className="classroom-info-header">
          <div className="classroom-info-top">
            <div className="classroom-info-left">
              <h1>{classroom.name}</h1>
              <div className="classroom-meta-row">
                {classroom.subject && (
                  <span className="meta-chip subject-chip">{classroom.subject}</span>
                )}
                {classroom.section && (
                  <span className="meta-chip">{classroom.section}</span>
                )}
                <span className="meta-chip">
                  {classroom.students?.length || 0} student{(classroom.students?.length || 0) !== 1 ? "s" : ""}
                </span>
                <span className="meta-chip">
                  {classroom.examCount || 0} exam{(classroom.examCount || 0) !== 1 ? "s" : ""}
                </span>
                {!isTeacher && classroom.teacherId && (
                  <span className="meta-chip">
                    {classroom.teacherId.name || "Teacher"}
                  </span>
                )}
              </div>
            </div>
            <div className="classroom-info-right">
              {/* Enrollment code for teachers */}
              {isTeacher && classroom.enrollmentCode && (
                <div className="enrollment-code-large">
                  <div>
                    <span className="code-label">Enrollment Code</span>
                    <code>{classroom.enrollmentCode}</code>
                  </div>
                  <button className="btn-copy-large" onClick={copyCode} title="Copy code">
                    <CopyIcon />
                  </button>
                </div>
              )}

              {/* Student: enroll/unenroll */}
              {!isTeacher && !classroom.isEnrolled && (
                <button className="btn-primary" onClick={handleEnroll}>
                  Join Classroom
                </button>
              )}
              {!isTeacher && classroom.isEnrolled && (
                <button className="btn-secondary" onClick={handleUnenroll}>
                  Leave Classroom
                </button>
              )}
            </div>
          </div>
          {classroom.description && (
            <p className="classroom-description-block">{classroom.description}</p>
          )}
        </div>

        {/* Tabs (Teacher only — students always see exams) */}
        {isTeacher && (
          <div className="detail-tabs">
            <button
              className={`detail-tab-btn ${activeTab === "exams" ? "active" : ""}`}
              onClick={() => setActiveTab("exams")}
            >
              Exams <span className="tab-count">{exams.length}</span>
            </button>
            <button
              className={`detail-tab-btn ${activeTab === "students" ? "active" : ""}`}
              onClick={() => setActiveTab("students")}
            >
              Students <span className="tab-count">{students.length}</span>
            </button>
          </div>
        )}

        {/* ─── Exams Tab ───────────────────────────────────── */}
        {(activeTab === "exams" || !isTeacher) && (
          <>
            <div className="detail-action-bar">
              <h3>
                {isTeacher ? "Exams in this Classroom" : "Available Exams"}
                {exams.length > 0 && (
                  <span style={{ fontWeight: 400, color: "#6B7280", fontSize: "13px", marginLeft: "8px" }}>
                    ({exams.length})
                  </span>
                )}
              </h3>
              {isTeacher && (
                <button
                  className="btn-primary"
                  onClick={() => navigate(`/create-exam?classroomId=${classroomId}`)}
                >
                  + Create Exam
                </button>
              )}
            </div>

            {exams.length === 0 ? (
              <div className="no-classrooms">
                <div className="no-classrooms-icon">—</div>
                <p>
                  {isTeacher
                    ? "No exams yet. Create your first exam in this classroom!"
                    : "No exams available in this classroom yet."
                  }
                </p>
                {isTeacher && (
                  <button
                    className="btn-primary"
                    onClick={() => navigate(`/create-exam?classroomId=${classroomId}`)}
                  >
                    Create First Exam
                  </button>
                )}
              </div>
            ) : (
              <div className="detail-exams-grid">
                {exams.map((exam) => {
                  const examStatus = getExamStatus(exam);
                  return (
                    <div key={exam._id} className="exam-card">
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
                        <span className={`access-badge ${examStatus.className}`}>
                          {examStatus.label}
                        </span>
                      </div>

                      <div className="card-divider" />

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

                      <div className="card-divider" />

                      <div className="exam-card-footer">
                        {exam.settings?.requireWebcam && (
                          <div className="exam-mode">
                            <ShieldIcon />
                            Mode: Proctored
                          </div>
                        )}

                        <div className="exam-actions">
                          {isTeacher ? (
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
                          ) : (
                            <button
                              onClick={() => navigate(`/take-exam/${exam._id}`)}
                              className="btn-primary"
                              disabled={examStatus.status === "ended" || examStatus.status === "upcoming"}
                            >
                              {examStatus.status === "available"
                                ? "Take Exam Now"
                                : examStatus.status === "upcoming"
                                  ? `Starts ${new Date(exam.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
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
          </>
        )}

        {/* ─── Students Tab (Teacher only) ─────────────────── */}
        {activeTab === "students" && isTeacher && (
          <>
            <div className="detail-action-bar">
              <h3>
                Enrolled Students
                <span style={{ fontWeight: 400, color: "#6B7280", fontSize: "13px", marginLeft: "8px" }}>
                  ({students.length})
                </span>
              </h3>
            </div>

            {students.length === 0 ? (
              <div className="no-classrooms">
                <div className="no-classrooms-icon">—</div>
                <p>No students enrolled yet. Share the enrollment code with your students.</p>
              </div>
            ) : (
              <div className="students-list">
                <table className="students-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Email</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student._id}>
                        <td>
                          <span className="student-avatar-small">
                            {student.name?.charAt(0)?.toUpperCase() || "?"}
                          </span>
                          {student.name}
                        </td>
                        <td>{student.email}</td>
                        <td>
                          {student.createdAt
                            ? new Date(student.createdAt).toLocaleDateString("en-GB", {
                                day: "numeric", month: "short", year: "numeric",
                              })
                            : "—"
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ClassroomDetail;

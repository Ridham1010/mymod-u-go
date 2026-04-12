import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import CreateExam from "./pages/CreateExam";
import TakeExam from "./pages/TakeExam";
import MySubmissions from "./pages/MySubmissions";
import AdminDashboard from "./pages/AdminDashboard";
import ProctorDashboard from "./pages/ProctorDashboard";
import ExamSubmissions from "./pages/ExamSubmissions";
import Classrooms from "./pages/Classrooms";
import ClassroomDetail from "./pages/ClassroomDetail";
import "./App.css";

const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
};

const PublicRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return !currentUser ? children : <Navigate to="/dashboard" />;
};

const RoleRoute = ({ children, allowedRoles }) => {
  const { currentUser, userProfile } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (!userProfile) {
    return <div className="loading">Loading...</div>;
  }

  if (!allowedRoles.includes(userProfile.role)) {
    return <Navigate to="/dashboard" />;
  }

  return children;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicRoute>
                <Signup />
              </PublicRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/create-exam"
            element={
              <RoleRoute allowedRoles={["teacher", "admin"]}>
                <CreateExam />
              </RoleRoute>
            }
          />
          <Route
            path="/edit-exam/:examId"
            element={
              <RoleRoute allowedRoles={["teacher", "admin"]}>
                <CreateExam />
              </RoleRoute>
            }
          />
          <Route
            path="/take-exam/:examId"
            element={
              <RoleRoute allowedRoles={["student"]}>
                <TakeExam />
              </RoleRoute>
            }
          />
          <Route
            path="/my-submissions"
            element={
              <RoleRoute allowedRoles={["student"]}>
                <MySubmissions />
              </RoleRoute>
            }
          />
          <Route
            path="/exam-submissions/:examId"
            element={
              <RoleRoute allowedRoles={["teacher", "admin", "proctor"]}>
                <ExamSubmissions />
              </RoleRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <RoleRoute allowedRoles={["admin"]}>
                <AdminDashboard />
              </RoleRoute>
            }
          />
          <Route
            path="/proctor"
            element={
              <RoleRoute allowedRoles={["proctor", "admin"]}>
                <ProctorDashboard />
              </RoleRoute>
            }
          />
          <Route
            path="/classrooms"
            element={
              <PrivateRoute>
                <Classrooms />
              </PrivateRoute>
            }
          />
          <Route
            path="/classroom/:classroomId"
            element={
              <PrivateRoute>
                <ClassroomDetail />
              </PrivateRoute>
            }
          />
          {/* Catch all route */}
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;

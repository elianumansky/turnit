import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Register from "./components/Register";
import Login from "./components/Login";
import UserDashboard from "./components/UserDashboard";
import ReserveTurn from "./components/ReserveTurn";
import AdminDashboard from "./components/AdminDashboard";
import PrivateRoute from "./components/PrivateRoute";
import { auth } from "./firebase";
import { useAuthState } from "react-firebase-hooks/auth";

export default function App() {
  const [user, loading] = useAuthState(auth);

  if (loading) return <div>Cargando...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <Register />} />
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute user={user}>
              <UserDashboard user={user} />
            </PrivateRoute>
          }
        />
        <Route
          path="/reserve"
          element={
            <PrivateRoute user={user}>
              <ReserveTurn user={user} />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <PrivateRoute user={user} adminOnly user={user}>
              <AdminDashboard user={user} />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
      </Routes>
    </Router>
  );
}
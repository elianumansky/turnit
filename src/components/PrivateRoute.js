import React from "react";
import { Navigate } from "react-router-dom";

export default function PrivateRoute({ user, adminOnly = false, children }) {
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && user.email !== "admin@tudominio.com")
    return <Navigate to="/dashboard" />;
  return children;
}
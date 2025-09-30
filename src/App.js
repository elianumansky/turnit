import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

// Componentes
import Start from "./components/Start";
import Register from "./components/Register";
import Login from "./components/Login";
import UserDashboard from "./components/UserDashboard";
import ReserveTurn from "./components/ReserveTurn";
import RegisterPlace from "./components/RegisterPlace";
import PlaceDashboard from "./components/PlaceDashboard";
import PublishTurn from "./components/PublishTurn";
import PlacesNearby from "./components/PlacesNearby";
import PlaceDetail from "./components/PlaceDetail";
import PlaceProfile from "./components/PlaceProfile";

// ---- Guard: exige email verificado (salvo login con Google) ----
function RequireVerified({ user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  const isGoogle = (user.providerData || []).some((p) => p.providerId === "google.com");
  const allowed = isGoogle || user.emailVerified === true;
  return allowed ? children : <Navigate to="/login?verify=1" replace />;
}

function App() {
  const [user, setUser] = useState(null);
  const [isPlace, setIsPlace] = useState(false); // dueño de lugar (no existe staff)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);

          // ✅ SOLO dueños: existe un place con ownerId === uid
          const qOwner = query(collection(db, "places"), where("ownerId", "==", currentUser.uid));
          const ownerSnap = await getDocs(qOwner);
          setIsPlace(!ownerSnap.empty);
        } else {
          setUser(null);
          setIsPlace(false);
        }
      } catch (e) {
        console.error("Error detectando si es dueño de lugar:", e);
        setIsPlace(false);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) return <div>Cargando...</div>;

  return (
    <Router>
      <Routes>
        {/* públicas */}
        <Route path="/" element={<Start />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register-place" element={<RegisterPlace />} />

        {/* protegidas (requieren verificación) */}
        <Route
          path="/reserve-turn"
          element={
            <RequireVerified user={user}>
              <ReserveTurn user={user} />
            </RequireVerified>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireVerified user={user}>
              <UserDashboard user={user} />
            </RequireVerified>
          }
        />
        <Route
          path="/place-dashboard"
          element={
            <RequireVerified user={user}>
              <PlaceDashboard user={user} />
            </RequireVerified>
          }
        />
        <Route
          path="/publish-turn"
          element={
            <RequireVerified user={user}>
              <PublishTurn user={user} />
            </RequireVerified>
          }
        />
        <Route
          path="/place-profile"
          element={
            <RequireVerified user={user}>
              <PlaceProfile user={user} />
            </RequireVerified>
          }
        />
        <Route
          path="/lugares"
          element={
            <RequireVerified user={user}>
              <PlacesNearby />
            </RequireVerified>
          }
        />
        <Route
          path="/place/:id"
          element={
            <RequireVerified user={user}>
              <PlaceDetail />
            </RequireVerified>
          }
        />

        {/* Redirección por defecto según tenga lugar o no */}
        {user ? (
          <Route path="*" element={<Navigate to={isPlace ? "/place-dashboard" : "/dashboard"} replace />} />
        ) : (
          <Route path="/*" element={<Navigate to="/" replace />} />
        )}
      </Routes>
    </Router>
  );
}

export default App;

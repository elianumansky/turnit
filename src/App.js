import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

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
import PlaceProfile from "./components/PlaceProfile"; // <-- NUEVO

function App() {
  const [user, setUser] = useState(null);
  const [isPlace, setIsPlace] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);

          // ✅ Detectar si es dueño o staff del lugar (no por id de doc)
          let hasPlace = false;

          // Dueño
          const qOwner = query(
            collection(db, "places"),
            where("ownerId", "==", currentUser.uid)
          );
          const ownerSnap = await getDocs(qOwner);
          if (!ownerSnap.empty) hasPlace = true;

          // Staff
          if (!hasPlace) {
            const qStaff = query(
              collection(db, "places"),
              where("staffIds", "array-contains", currentUser.uid)
            );
            const staffSnap = await getDocs(qStaff);
            if (!staffSnap.empty) hasPlace = true;
          }

          setIsPlace(hasPlace);
        } else {
          setUser(null);
          setIsPlace(false);
        }
      } catch (e) {
        console.error("Error detectando rol de lugar:", e);
        setIsPlace(false);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div>Cargando...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Start />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register-place" element={<RegisterPlace />} />

        {user ? (
          <>
            <Route path="/reserve-turn" element={<ReserveTurn user={user} />} />
            <Route path="/dashboard" element={<UserDashboard user={user} />} />
            <Route path="/place-dashboard" element={<PlaceDashboard user={user} />} />
            <Route path="/publish-turn" element={<PublishTurn user={user} />} />
            <Route path="/place-profile" element={<PlaceProfile user={user} />} /> {/* <-- NUEVA RUTA */}
            <Route path="/lugares" element={<PlacesNearby />} />
            <Route path="/place/:id" element={<PlaceDetail />} />

            {/* Redirección por defecto según rol */}
            <Route
              path="*"
              element={<Navigate to={isPlace ? "/place-dashboard" : "/dashboard"} />}
            />
          </>
        ) : (
          <Route path="/*" element={<Navigate to="/" />} />
        )}
      </Routes>
    </Router>
  );
}

export default App;
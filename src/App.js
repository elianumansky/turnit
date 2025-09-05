import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

// Importa todos tus componentes desde la carpeta 'components'
import Start from "./components/Start";
import Register from "./components/Register";
import Login from "./components/Login";
import UserDashboard from "./components/UserDashboard";
import ReserveTurn from "./components/ReserveTurn";
import RegisterPlace from './components/RegisterPlace';
import PlaceDashboard from "./components/PlaceDashboard";
import PublishTurn from "./components/PublishTurn"; // <-- Nuevo componente importado
import PlacesNearby from "./components/PlacesNearby";
import PlaceDetail from "./components/PlaceDetail";

function App() {
  const [user, setUser] = useState(null);
  const [isPlace, setIsPlace] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const placeDoc = await getDoc(doc(db, "places", currentUser.uid));
        setIsPlace(placeDoc.exists());
      } else {
        setUser(null);
        setIsPlace(false);
      }
      setLoading(false);
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
            <Route path="/publish-turn" element={<PublishTurn user={user} />} /> {/* <-- Nueva ruta para publicar turnos */}
            <Route path="*" element={<Navigate to={isPlace ? "/place-dashboard" : "/dashboard"} />} />
            <Route path="/lugares" element={<PlacesNearby />} />
            <Route path="/place/:id" element={<PlaceDetail />} />
          </>
        ) : (
          <Route path="/*" element={<Navigate to="/" />} />
        )}
      </Routes>
    </Router>
  );
}

export default App;
import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Typography, Card, CardContent, Button, Grid } from "@mui/material";

export default function UserDashboard({ user }) {
  const [availableTurns, setAvailableTurns] = useState([]);
  const [userTurns, setUserTurns] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(true);
  const [loadingUserTurns, setLoadingUserTurns] = useState(true);
  const [error, setError] = useState("");

  // ------------------------------
  // Turnos disponibles
  // ------------------------------
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "turnos"), where("slotsAvailable", ">", 0)),
      (snapshot) => {
        const turns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        turns.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
        setAvailableTurns(turns);
        setLoadingAvailable(false);
      },
      (err) => {
        console.error("Error al cargar turnos disponibles:", err);
        setError("No se pudieron cargar los turnos disponibles");
      }
    );

    return () => unsubscribe();
  }, []);

  // ------------------------------
  // Turnos reservados por el usuario
  // ------------------------------
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(
      query(collection(db, "turnos"), where("reservations", "array-contains", user.uid)),
      (snapshot) => {
        const turns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUserTurns(turns);
        setLoadingUserTurns(false);
      },
      (err) => {
        console.error("Error al cargar turnos del usuario:", err);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // ------------------------------
  // Función para reservar un turno
  // ------------------------------
  const handleReserve = async (turno) => {
    setError("");
    try {
      const turnoRef = doc(db, "turnos", turno.id);
      await updateDoc(turnoRef, {
        slotsAvailable: turno.slotsAvailable - 1,
        reservations: turno.reservations
          ? [...turno.reservations, user.uid]
          : [user.uid],
      });
    } catch (err) {
      console.error("Error al reservar turno:", err);
      setError("Ocurrió un error al reservar el turno");
    }
  };

  // ------------------------------
  // Función para cancelar un turno
  // ------------------------------
  const handleCancel = async (turno) => {
    setError("");
    try {
      const turnoRef = doc(db, "turnos", turno.id);
      await updateDoc(turnoRef, {
        slotsAvailable: turno.slotsAvailable + 1,
        reservations: turno.reservations.filter(uid => uid !== user.uid),
      });
    } catch (err) {
      console.error("Error al cancelar turno:", err);
      setError("Ocurrió un error al cancelar el turno");
    }
  };

  // ------------------------------
  // Render
  // ------------------------------
  return (
    <div style={{ padding: "2rem", maxWidth: "1000px", margin: "0 auto" }}>
      <Typography variant="h4" gutterBottom>
        Bienvenido {user.displayName || user.email}
      </Typography>

      {/* ---------------- Turnos disponibles ---------------- */}
      <Typography variant="h5" gutterBottom>Turnos Disponibles</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {loadingAvailable ? (
        <Typography>Cargando turnos disponibles...</Typography>
      ) : availableTurns.length === 0 ? (
        <Typography>No hay turnos disponibles</Typography>
      ) : (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {availableTurns.map(turno => (
            <Grid item xs={12} sm={6} md={4} key={turno.id}>
              <Card>
                <CardContent>
                  <Typography variant="h6">{turno.placeName}</Typography>
                  <Typography>Fecha: {turno.date}</Typography>
                  <Typography>Hora: {turno.time}</Typography>
                  {turno.distance !== undefined && (
                    <Typography>Distancia: {turno.distance.toFixed(2)} km</Typography>
                  )}
                  <Typography>Turnos disponibles: {turno.slotsAvailable}</Typography>
                  <Button
                    variant="contained"
                    color="primary"
                    sx={{ mt: 1 }}
                    onClick={() => handleReserve(turno)}
                  >
                    Reservar
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* ---------------- Turnos reservados por el usuario ---------------- */}
      <Typography variant="h5" gutterBottom>Mis Turnos Reservados</Typography>
      {loadingUserTurns ? (
        <Typography>Cargando tus turnos...</Typography>
      ) : userTurns.length === 0 ? (
        <Typography>No reservaste turnos</Typography>
      ) : (
        <Grid container spacing={2}>
          {userTurns.map(turno => (
            <Grid item xs={12} sm={6} md={4} key={turno.id}>
              <Card>
                <CardContent>
                  <Typography variant="h6">{turno.placeName}</Typography>
                  <Typography>Fecha: {turno.date}</Typography>
                  <Typography>Hora: {turno.time}</Typography>
                  {turno.distance !== undefined && (
                    <Typography>Distancia: {turno.distance.toFixed(2)} km</Typography>
                  )}
                  <Button
                    variant="outlined"
                    color="error"
                    sx={{ mt: 1 }}
                    onClick={() => handleCancel(turno)}
                  >
                    Cancelar Turno
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </div>
  );
}

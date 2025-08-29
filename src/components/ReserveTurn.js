import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Typography, Button, TextField } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function ReserveTurn({ user }) {
  const [placeId, setPlaceId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [availableTurns, setAvailableTurns] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Buscar turnos disponibles según placeId, fecha y hora
  const searchAvailableTurns = async () => {
    if (!placeId || !date || !time) return;
    const q = query(
      collection(db, "turnos"),
      where("placeId", "==", placeId),
      where("date", "==", date),
      where("time", "==", time),
      where("slotsAvailable", ">", 0)
    );
    const snapshot = await getDocs(q);
    setAvailableTurns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  useEffect(() => {
    searchAvailableTurns();
  }, [placeId, date, time]);

  const handleReserve = async () => {
    setError("");

    if (!placeId || !date || !time) {
      setError("Completa todos los campos");
      return;
    }

    if (availableTurns.length === 0) {
      setError("No hay turnos disponibles para esa fecha y hora");
      return;
    }

    try {
      const turnoToReserve = availableTurns[0]; // reservar el primero disponible
      const turnoRef = doc(db, "turnos", turnoToReserve.id);

      await updateDoc(turnoRef, {
        slotsAvailable: turnoToReserve.slotsAvailable - 1,
        reservations: turnoToReserve.reservations
          ? [...turnoToReserve.reservations, user.uid]
          : [user.uid],
      });

      alert("Turno reservado con éxito!");
      navigate("/dashboard");
    } catch (err) {
      console.error("Error al reservar turno:", err);
      setError("Ocurrió un error al reservar el turno");
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "400px", margin: "0 auto" }}>
      <Typography variant="h4" gutterBottom>Reservar Turno</Typography>

      <TextField
        label="Place ID"
        fullWidth
        margin="normal"
        value={placeId}
        onChange={(e) => setPlaceId(e.target.value)}
        required
      />
      <TextField
        label="Fecha"
        type="date"
        fullWidth
        margin="normal"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        InputLabelProps={{ shrink: true }}
        required
      />
      <TextField
        label="Hora"
        type="time"
        fullWidth
        margin="normal"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        InputLabelProps={{ shrink: true }}
        required
      />

      {error && <Typography color="error" sx={{ mt: 1 }}>{error}</Typography>}

      <Button
        variant="contained"
        color="primary"
        fullWidth
        sx={{ mt: 2 }}
        onClick={handleReserve}
      >
        Reservar
      </Button>
    </div>
  );
}

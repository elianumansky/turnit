import React, { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Typography, Box, TextField, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function PublishTurn({ user }) {
  const navigate = useNavigate();

  // --- SETEAMOS PLACEID Y NOMBRE POR DEFAULT ---
  const placeId = "DEFAULT_PLACE_ID";       // <--- reemplazá con el ID real de tu lugar
  const [placeName] = useState("Mi Lugar Default"); // nombre opcional para mostrar

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState(1);
  const [error, setError] = useState("");

  const handlePublish = async (e) => {
    e.preventDefault();
    setError("");

    if (!user?.uid) return setError("Debes iniciar sesión.");
    if (!date || !time) return setError("Completá fecha y hora.");

    try {
      const dateTimeISO = new Date(`${date}T${time}:00`).toISOString();

      await addDoc(collection(db, "turnos"), {
        userId: user.uid,
        placeId,
        placeName,
        date,
        time,
        dateTime: dateTimeISO,
        slots: Math.max(1, Number(slots)),
        slotsAvailable: Math.max(1, Number(slots)),
        reservations: [],
        createdAt: serverTimestamp(),
      });

      navigate("/place-dashboard"); // ahora va al dashboard del lugar

    } catch (e) {
      console.error(e);
      setError("No se pudo publicar el turno.");
    }
  };

  if (!user) return <Typography>Iniciá sesión para publicar turnos.</Typography>;

  return (
    <Box component="form" onSubmit={handlePublish} p={2}>
      <Typography variant="h6" gutterBottom>
        Publicar Turno
      </Typography>

      <Typography>Lugar: {placeName}</Typography>

      <TextField
        label="Fecha"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        InputLabelProps={{ shrink: true }}
        fullWidth
        required
        sx={{ mt: 2 }}
      />

      <TextField
        label="Hora"
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        InputLabelProps={{ shrink: true }}
        fullWidth
        required
        sx={{ mt: 2 }}
      />

      <TextField
        label="Cupos"
        type="number"
        value={slots}
        onChange={(e) => setSlots(e.target.value)}
        inputProps={{ min: 1 }}
        fullWidth
        sx={{ mt: 2, mb: 2 }}
      />

      {error && <Typography color="error">{error}</Typography>}

      <Button type="submit" variant="contained">
        Publicar
      </Button>
    </Box>
  );
}

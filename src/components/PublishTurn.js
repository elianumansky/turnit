import React, { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Typography, Box, TextField, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function PublishTurn({ user }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState(1);
  const navigate = useNavigate();

  const handlePublish = async () => {
    if (!date || !time || slots < 1) {
      alert("Por favor, completa todos los campos.");
      return;
    }

    try {
      await addDoc(collection(db, "availableTurns"), {
        placeId: user.uid,
        placeName: user.email,
        date: date,
        time: time,
        slotsAvailable: slots,
        reservedBy: [],
      });
      alert("Turno publicado con éxito!");
      navigate('/place-dashboard'); // <-- Redirige al dashboard después de publicar
    } catch (error) {
      console.error("Error al publicar el turno:", error);
      alert("Hubo un error al publicar el turno.");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4">Publicar Turnos Disponibles</Typography>
      <TextField
        label="Fecha"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        fullWidth
        sx={{ mt: 2, mb: 2 }}
        InputLabelProps={{ shrink: true }}
      />
      <TextField
        label="Hora"
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        fullWidth
        sx={{ mb: 2 }}
        InputLabelProps={{ shrink: true }}
      />
      <TextField
        label="Número de Slots"
        type="number"
        value={slots}
        onChange={(e) => setSlots(Number(e.target.value))}
        fullWidth
        sx={{ mb: 2 }}
        inputProps={{ min: 1 }}
      />
      <Button variant="contained" onClick={handlePublish}>
        Publicar Turno
      </Button>
    </Box>
  );
}
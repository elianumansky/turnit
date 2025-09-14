import React, { useState, useEffect } from "react";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Typography, Box, TextField, Button } from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";

export default function PublishTurn({ user }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [placeId, setPlaceId] = useState(null);
  const [placeName, setPlaceName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPlace = async () => {
      if (!user?.uid) return;

      // Si viene por navigation state
      if (location.state?.placeId) {
        setPlaceId(location.state.placeId);
        setPlaceName(location.state.placeName || "Mi Lugar");
        return;
      }

      // Sino, obtener de Firestore
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.placeId) {
            setPlaceId(data.placeId);
            setPlaceName(data.placeName || "Mi Lugar");
          } else setError("No se encontró un lugar asociado al usuario.");
        }
      } catch (err) {
        console.error(err);
        setError("Error al obtener los datos del lugar.");
      }
    };

    fetchPlace();
  }, [user, location.state]);

  const handlePublish = async (e) => {
    e.preventDefault();
    setError("");

    if (!user?.uid) return setError("Debes iniciar sesión.");
    if (!placeId) return setError("No se pudo obtener el ID del lugar.");
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

      navigate("/place-dashboard");
    } catch (err) {
      console.error(err);
      setError("No se pudo publicar el turno.");
    }
  };

  if (!user) return <Typography>Iniciá sesión para publicar turnos.</Typography>;

  return (
    <Box component="form" onSubmit={handlePublish} p={2}>
      <Typography variant="h6">Publicar Turno</Typography>
      <Typography>Lugar: {placeName || "—"}</Typography>

      <TextField label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth required sx={{ mt: 2 }} />
      <TextField label="Hora" type="time" value={time} onChange={(e) => setTime(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth required sx={{ mt: 2 }} />
      <TextField label="Cupos" type="number" value={slots} onChange={(e) => setSlots(e.target.value)} inputProps={{ min: 1 }} fullWidth sx={{ mt: 2, mb: 2 }} />

      {error && <Typography color="error">{error}</Typography>}
      <Button type="submit" variant="contained">Publicar</Button>
    </Box>
  );
}

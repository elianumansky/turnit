import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Typography, Box, TextField, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function PublishTurn({ user }) {
  const [date, setDate] = useState("");       // yyyy-mm-dd
  const [time, setTime] = useState("");       // hh:mm
  const [slots, setSlots] = useState(1);      // número de cupos
  const [placeId, setPlaceId] = useState(null);
  const [placeName, setPlaceName] = useState("");
  const [loadingPlace, setLoadingPlace] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();

  // ------------------------------
  // Buscar automáticamente el lugar del usuario
  // ------------------------------
  useEffect(() => {
    const fetchPlace = async () => {
      if (!user) return;

      try {
        setLoadingPlace(true);
        setErrorMsg("");

        // Intentar buscar en "places"
        let q = query(collection(db, "places"), where("ownerId", "==", user.uid));
        let snap = await getDocs(q);

        if (!snap.empty) {
          const d = snap.docs[0];
          setPlaceId(d.id);
          setPlaceName(d.data().name || "");
        } else {
          // fallback: buscar en "lugares"
          q = query(collection(db, "lugares"), where("ownerId", "==", user.uid));
          snap = await getDocs(q);
          if (!snap.empty) {
            const d = snap.docs[0];
            setPlaceId(d.id);
            setPlaceName(d.data().name || "");
          } else {
            setErrorMsg("No se encontró un lugar asociado a tu usuario. Creá uno primero.");
          }
        }
      } catch (err) {
        console.error("Error al cargar lugar:", err);
        setErrorMsg("No se pudo cargar el lugar.");
      } finally {
        setLoadingPlace(false);
      }
    };

    fetchPlace();
  }, [user]);

  // ------------------------------
  // Publicar turno
  // ------------------------------
  const handlePublish = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!user) {
      setErrorMsg("Debes iniciar sesión.");
      return;
    }
    if (!placeId) {
      setErrorMsg("No hay un lugar asignado a tu usuario.");
      return;
    }
    if (!date || !time) {
      setErrorMsg("Completá fecha y hora.");
      return;
    }

    try {
      const isoDateTime = new Date(`${date}T${time}:00`).toISOString();

      const payload = {
        userId: user.uid,
        placeId,
        placeName,
        date,
        time,
        dateTime: isoDateTime,
        slots: Number(slots) || 1,
        slotsAvailable: Number(slots) || 1,
        reservations: [],
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "turnos"), payload);

      // Redirigir al PlaceDashboard
      navigate("/place-dashboard");
    } catch (err) {
      console.error("Error al publicar turno:", err);
      setErrorMsg("No se pudo publicar el turno. Revisá la consola.");
    }
  };

  // ------------------------------
  // Render
  // ------------------------------
  if (!user) {
    return (
      <Box p={2}>
        <Typography>Iniciá sesión para publicar turnos.</Typography>
      </Box>
    );
  }

  return (
    <Box p={2} component="form" onSubmit={handlePublish}>
      <Typography variant="h6" gutterBottom>Publicar Turno</Typography>

      {loadingPlace ? (
        <Typography>Cargando lugar…</Typography>
      ) : (
        <>
          <Box mb={2}>
            <Typography variant="body2" color="text.secondary">Lugar</Typography>
            <Typography variant="subtitle1">
              {placeName ? `${placeName} (ID: ${placeId})` : "—"}
            </Typography>
          </Box>

          <Box mb={2} display="flex" gap={2}>
            <TextField
              label="Fecha"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              required
            />
            <TextField
              label="Hora"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              required
            />
          </Box>

          <Box mb={2}>
            <TextField
              label="Cupos"
              type="number"
              value={slots}
              onChange={(e) => setSlots(e.target.value)}
              inputProps={{ min: 1 }}
              fullWidth
            />
          </Box>

          {errorMsg && (
            <Box mb={2}>
              <Typography color="error">{errorMsg}</Typography>
            </Box>
          )}

          <Button type="submit" variant="contained">Publicar</Button>
        </>
      )}
    </Box>
  );
}

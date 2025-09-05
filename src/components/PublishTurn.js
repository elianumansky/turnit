import React, { useState, useEffect } from "react";
import { collection, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Typography, Box, TextField, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function PublishTurn({ user }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState(1);
  const [placeId, setPlaceId] = useState(null);
  const [placeName, setPlaceName] = useState("");
  const [loadingPlace, setLoadingPlace] = useState(true);
  const navigate = useNavigate();

  // Obtener placeId y nombre del lugar del usuario logueado
  useEffect(() => {
    const fetchPlace = async () => {
      if (!user) {
        setLoadingPlace(false);
        return;
      }
      try {
        const userRef = doc(db, "places", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setPlaceId(data.placeId);
          setPlaceName(data.name);
        } else {
          console.log("No se encontró documento del lugar");
        }
      } catch (err) {
        console.error("Error al obtener datos del lugar:", err);
      } finally {
        setLoadingPlace(false);
      }
    };
    fetchPlace();
  }, [user]);

  const handlePublish = async () => {
    if (!date || !time || !slots || !placeId) {
      alert("Por favor, completa todos los campos correctamente.");
      return;
    }

    try {
      const turnosRef = collection(db, "turnos");
      const newTurnoRef = doc(turnosRef);
      const turnoId = newTurnoRef.id;

      await setDoc(newTurnoRef, {
        turnoId,
        placeId,
        placeName,
        date,
        time,
        slotsAvailable: slots,
        createdAt: new Date(),
      });

      alert("Turno publicado con éxito!");
      navigate("/place-dashboard");
    } catch (err) {
      console.error("Error al publicar turno:", err);
      alert("Hubo un error al publicar el turno.");
    }
  };

  if (loadingPlace) return <Typography>Cargando datos del lugar...</Typography>;

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

      <Button
        variant="contained"
        onClick={handlePublish}
        disabled={!user || !placeId}
      >
        Publicar Turno
      </Button>
    </Box>
  );
}

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

  // Cargar placeId y nombre del lugar
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
          setPlaceId(data.placeId || user.uid); // fallback: uid si no hay placeId
          setPlaceName(data.name || "Mi Lugar");
        } else {
          console.log("No se encontró documento del lugar, se usará UID como placeId");
          setPlaceId(user.uid);
          setPlaceName("Mi Lugar");
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
    if (!date || !time || !slots) {
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

  if (loadingPlace)
    return (
      <Typography sx={{ p: 3 }}>Cargando datos del lugar...</Typography>
    );

  return (
    <Box sx={{ p: 3, maxWidth: 400, mx: "auto" }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: "bold" }}>
        Publicar Turnos Disponibles
      </Typography>

      <TextField
        label="Fecha"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        fullWidth
        sx={{ mb: 2 }}
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
        sx={{ mb: 3 }}
        inputProps={{ min: 1 }}
      />

      <Button
        variant="contained"
        fullWidth
        sx={{
          background: "linear-gradient(135deg, #4e54c8, #8f94fb)",
          color: "#fff",
          fontWeight: "bold",
          py: 1.5,
          ":hover": {
            background: "linear-gradient(135deg, #8f94fb, #4e54c8)",
          },
        }}
        onClick={handlePublish}
        disabled={!date || !time || !slots || !placeId}
      >
        Publicar Turno
      </Button>
    </Box>
  );
}

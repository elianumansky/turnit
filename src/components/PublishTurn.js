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
  const [loadingPlace, setLoadingPlace] = useState(true);
  const navigate = useNavigate();

  // Obtener placeId del usuario logueado
  useEffect(() => {
    const fetchPlaceId = async () => {
      if (!user) {
        console.log("No hay usuario logueado");
        setLoadingPlace(false);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          console.log("Documento usuario:", data);
          setPlaceId(data.placeId);
        } else {
          console.log("No se encontró documento del usuario");
        }
      } catch (error) {
        console.error("Error al obtener placeId:", error);
      } finally {
        setLoadingPlace(false);
      }
    };

    fetchPlaceId();
  }, [user]);

  const handlePublish = async () => {
    console.log({ date, time, slots, user, placeId }); // depuración

    if (!date || !time || !user || !placeId || slots < 1) {
      alert("Por favor, completa todos los campos correctamente.");
      return;
    }

    try {
      const newTurnRef = doc(collection(db, "turnos")); // genera un ID único
      const turnoId = newTurnRef.id;

      await setDoc(newTurnRef, {
        turnoId,
        userId: user.uid,
        placeId,
        date,
        time,
        slotsAvailable: slots,
        createdAt: new Date(),
      });

      alert("Turno publicado con éxito!");
      navigate("/place-dashboard");
    } catch (error) {
      console.error("Error al publicar el turno:", error);
      alert("Hubo un error al publicar el turno.");
    }
  };

  if (loadingPlace) {
    return <Typography>Cargando lugar...</Typography>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Publicar Turnos Disponibles
      </Typography>

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
        disabled={!user || !placeId || !date || !time || slots < 1}
      >
        Publicar Turno
      </Button>
    </Box>
  );
}

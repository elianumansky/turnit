import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { TextField, Button, Typography, Box, CircularProgress, Alert } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function PublishTurn() {
  const navigate = useNavigate();
  const [authedUser, setAuthedUser] = useState(null);
  const [placeId, setPlaceId] = useState(null);
  const [placeName, setPlaceName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Esperar a que Auth confirme sesión
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      console.log("Auth state changed:", user?.uid || "No logueado");
      setAuthedUser(user || null);
    });
    return () => unsub();
  }, []);

  // Cargar datos del lugar del usuario
  useEffect(() => {
    const run = async () => {
      if (!authedUser?.uid) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, "users", authedUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setPlaceId(data.placeId || null);
          setPlaceName(data.placeName || "");
        }
      } catch (err) {
        console.error(err);
        setError("Error al obtener datos del lugar.");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [authedUser]);

  const handlePublish = async (e) => {
    e.preventDefault();
    setError("");

    if (!authedUser?.uid) {
      setError("No hay sesión activa. Iniciá sesión para continuar.");
      return;
    }
    if (!placeId) {
      setError("No se encontró tu placeId. Registrá un lugar primero.");
      return;
    }
    if (!date || !time) {
      setError("Completa fecha y hora.");
      return;
    }

    const dateTimeString = `${date}T${time}:00`;
    const jsDate = new Date(dateTimeString);
    if (isNaN(jsDate.getTime())) {
      setError("Fecha u hora inválida.");
      return;
    }

    const startAt = Timestamp.fromDate(jsDate);
    const createdAt = Timestamp.now();

    const bookingId = `${placeId}_${Date.now()}`;
    const payload = {
      placeId,
      startAt,
      userId: authedUser.uid,
      createdAt,
      status: "active",
    };

    try {
      setSaving(true);

      console.log("UID en cliente:", authedUser.uid);
      console.log("Booking ID:", bookingId);
      console.log("Payload a guardar:", {
        ...payload,
        startAt: startAt.toDate(),
        createdAt: createdAt.toDate(),
      });

      await setDoc(doc(db, "bookings", bookingId), payload);

      navigate("/place-dashboard");
    } catch (err) {
      console.error("Error al publicar:", err.code, err.message);
      setError(`Error: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box p={3} display="flex" justifyContent="center">
        <CircularProgress />
      </Box>
    );
  }

  if (!authedUser) {
    return (
      <Box p={3}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Necesitás iniciar sesión para publicar turnos.
        </Alert>
        <Button variant="contained" onClick={() => navigate("/login")}>
          Ir a iniciar sesión
        </Button>
      </Box>
    );
  }

  if (!placeId) {
    return (
      <Box p={3}>
        <Alert severity="info" sx={{ mb: 2 }}>
          No tenés un lugar asociado. Registrá uno para poder publicar turnos.
        </Alert>
        <Button variant="contained" onClick={() => navigate("/register-place")}>
          Registrar lugar
        </Button>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Typography variant="h5" gutterBottom>
        Publicar turno para {placeName}
      </Typography>
      <form onSubmit={handlePublish}>
        <TextField
          label="Fecha"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          fullWidth
          InputLabelProps={{ shrink: true }}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Hora"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          fullWidth
          InputLabelProps={{ shrink: true }}
          sx={{ mb: 2 }}
        />
        {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
        <Button type="submit" variant="contained" disabled={saving}>
          {saving ? "Publicando..." : "Publicar"}
        </Button>
      </form>
    </Box>
  );
}

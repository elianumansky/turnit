import React, { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Button, Typography, Box, CircularProgress, Alert } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function PlaceDashboard({ user }) {
  const navigate = useNavigate();
  const [placeId, setPlaceId] = useState(null);
  const [placeName, setPlaceName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setPlaceId(data.placeId || null);
          setPlaceName(data.placeName || "");
        } else {
          setError("No se encontró el documento del usuario.");
        }
      } catch (err) {
        console.error(err);
        setError("Error al obtener datos del usuario.");
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user]);

  if (loading) {
    return (
      <Box p={3} display="flex" justifyContent="center">
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return (
      <Box p={3}>
        <Alert severity="warning">Iniciá sesión para acceder al dashboard.</Alert>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Typography variant="h5" gutterBottom>
        Dashboard del Lugar
      </Typography>
      <Typography variant="subtitle1" gutterBottom>
        Bienvenido: {user.email}
      </Typography>
      <Typography variant="subtitle1" gutterBottom>
        Lugar: {placeName || "—"}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!placeId && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No hay un lugar asociado a tu cuenta. Registrá un lugar para poder publicar turnos.
        </Alert>
      )}

      <Button
        variant="contained"
        color="primary"
        disabled={!placeId}
        onClick={() => navigate("/publish-turn", { state: { placeId, placeName } })}
        sx={{ mr: 2 }}
      >
        PUBLICAR TURNOS
      </Button>

      <Button
        variant="contained"
        color="secondary"
        onClick={() => {/* lógica de logout */}}
      >
        CERRAR SESIÓN
      </Button>

      <Box mt={4}>
        <Typography variant="h6">Tus Turnos Publicados</Typography>
        {/* Aquí iría la lista de turnos */}
      </Box>
    </Box>
  );
}

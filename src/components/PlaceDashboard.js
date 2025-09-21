import React, { useEffect, useState } from "react";
import {
  Typography, Box, Button, Grid, Card, CardContent,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";
import { collection, query, where, onSnapshot, updateDoc, deleteDoc, doc, getDocs } from "firebase/firestore";

// Calendario
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import "react-big-calendar/lib/css/react-big-calendar.css";
import es from "date-fns/locale/es";

const locales = { es: es };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

export default function PlaceDashboard({ user }) {
  const [publishedTurns, setPublishedTurns] = useState([]);
  const [placeId, setPlaceId] = useState(null);
  const [placeName, setPlaceName] = useState("");
  const navigate = useNavigate();

  // Obtener lugar del usuario
  useEffect(() => {
    const fetchPlace = async () => {
      if (!user?.uid) return;
      try {
        const q = query(collection(db, "places"), where("ownerId", "==", user.uid));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const firstPlace = snap.docs[0];
          setPlaceId(firstPlace.id);
          setPlaceName(firstPlace.data().name || "");
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchPlace();
  }, [user]);

  // Obtener turnos del lugar
  useEffect(() => {
    if (!placeId) return;
    const q = query(collection(db, "turnos"), where("placeId", "==", placeId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const turnsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPublishedTurns(turnsData);
    });
    return () => unsubscribe();
  }, [placeId]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/");
  };

  // Manejo de eliminar slot / turno completo
  const handleDeleteSlot = async (turn) => {
    const turnoRef = doc(db, "turnos", turn.id);

    if ((turn.slotsAvailable || turn.slots) > 1) {
      await updateDoc(turnoRef, {
        slotsAvailable: (turn.slotsAvailable || turn.slots) - 1
      });
    } else {
      await deleteDoc(turnoRef);
    }
  };

  const handleCancelReservation = async (turno, userUid) => {
    const turnoRef = doc(db, "turnos", turno.id);
    await updateDoc(turnoRef, {
      slotsAvailable: (turno.slotsAvailable || turno.slots) + 1,
      reservations: (turno.reservations || []).filter(uid => uid !== userUid),
    });
  };

  // ---------------- Crear eventos para el calendario ----------------
  const calendarEvents = publishedTurns.map(turn => {
    const start = new Date(`${turn.date}T${turn.time}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hora por defecto
    return {
      id: turn.id,
      title: `${turn.placeName || "Turno"} (${turn.slotsAvailable || turn.slots} slots)`,
      start,
      end,
      turn,
    };
  });

  // ---------------- Estilos violeta ----------------
  const styles = {
    container: {
      p: 3,
      minHeight: "100vh",
      background: "linear-gradient(135deg, #4e54c8, #8f94fb)",
      color: "#fff",
    },
    card: {
      background: "#6c63ff",
      color: "#fff",
    },
    buttonPrimary: {
      mr: 2,
      backgroundColor: "#fff",
      color: "#6c63ff",
      "&:hover": { backgroundColor: "#eee" },
    },
    buttonSecondary: {
      backgroundColor: "#ff6cec",
      "&:hover": { backgroundColor: "#ff4ed9" },
    },
  };

  return (
    <Box sx={styles.container}>
      <Typography variant="h4">Dashboard del Lugar</Typography>
      <Typography sx={{ mt: 2 }}>¡Bienvenido, {user.email}!</Typography>
      <Typography variant="h6" sx={{ mt: 1 }}>Lugar: {placeName || "—"}</Typography>

      <Box sx={{ mt: 3, mb: 3 }}>
        <Button
          variant="contained"
          sx={styles.buttonPrimary}
          onClick={() => navigate("/publish-turn", { state: { placeId, placeName } })}
          disabled={!placeId}
        >
          Publicar Turnos
        </Button>
        <Button variant="contained" sx={styles.buttonSecondary} onClick={handleLogout}>
          Cerrar Sesión
        </Button>
      </Box>

      <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>Calendario de Turnos</Typography>
      <Calendar
        localizer={localizer}
        events={calendarEvents}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 500, marginBottom: 20, backgroundColor: "#fff", color: "#000", borderRadius: 8 }}
        onSelectEvent={(event) => {
          if (window.confirm(`Eliminar turno de ${event.turn.placeName}?`)) {
            handleDeleteSlot(event.turn);
          }
        }}
      />

      <Typography variant="h5" sx={{ mt: 4 }}>Tus Turnos Publicados</Typography>
      {publishedTurns.length === 0 ? (
        <Typography>No has publicado ningún turno todavía.</Typography>
      ) : (
        <Grid container spacing={2}>
          {publishedTurns.map(turn => (
            <Grid item xs={12} sm={6} md={4} key={turn.id}>
              <Card sx={styles.card}>
                <CardContent>
                  <Typography variant="h6">Fecha: {turn.date}</Typography>
                  <Typography>Hora: {turn.time}</Typography>
                  <Typography>Slots disponibles: {turn.slotsAvailable || turn.slots}</Typography>

                  {turn.reservations && turn.reservations.length > 0 && (
                    <>
                      <Typography variant="subtitle2" sx={{ mt: 1 }}>Usuarios Reservados:</Typography>
                      {turn.reservations.map(uid => (
                        <Box key={uid} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 0.5 }}>
                          <Typography variant="body2">{uid}</Typography>
                          <Button variant="outlined" color="error" size="small"
                            onClick={() => handleCancelReservation(turn, uid)}>Cancelar Reserva</Button>
                        </Box>
                      ))}
                    </>
                  )}

                  <Button variant="contained" color="secondary" sx={{ mt: 1 }}
                    onClick={() => handleDeleteSlot(turn)}>Eliminar Slot</Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}

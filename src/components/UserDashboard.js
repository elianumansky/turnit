import React, { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, runTransaction } from "firebase/firestore";
import { db, auth } from "../firebase";
import { Typography, Card, CardContent, Button, Grid, Box } from "@mui/material";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function UserDashboard({ user }) {
  const navigate = useNavigate();
  const [availableTurns, setAvailableTurns] = useState([]);
  const [userTurns, setUserTurns] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(true);
  const [loadingUserTurns, setLoadingUserTurns] = useState(true);
  const [error, setError] = useState("");

  // ------------------------------
  // Turnos disponibles
  // ------------------------------
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "turnos"), where("slotsAvailable", ">", 0));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const turns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const filtered = turns.filter(t => !(t.reservations?.includes(user.uid)));
        setAvailableTurns(filtered);
        setLoadingAvailable(false);
      },
      (err) => {
        console.error("Error al cargar turnos disponibles:", err);
        setError("No se pudieron cargar los turnos disponibles");
        setLoadingAvailable(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // ------------------------------
  // Turnos reservados por el usuario
  // ------------------------------
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "turnos"), where("reservations", "array-contains", user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const turns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUserTurns(turns);
        setLoadingUserTurns(false);
      },
      (err) => {
        console.error("Error al cargar turnos del usuario:", err);
        setLoadingUserTurns(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // ------------------------------
  // Función para reservar un turno
  // ------------------------------
  const handleReserve = async (turno) => {
    try {
      const turnoRef = doc(db, "turnos", turno.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(turnoRef);
        if (!snap.exists()) throw new Error("Turno inexistente");
        const t = snap.data();
        if (t.slotsAvailable <= 0) throw new Error("No hay cupos disponibles");
        if (t.reservations?.includes(user.uid)) throw new Error("Ya reservaste este turno");

        tx.update(turnoRef, {
          slotsAvailable: t.slotsAvailable - 1,
          reservations: t.reservations ? [...t.reservations, user.uid] : [user.uid],
        });
      });
      setError("");
    } catch (err) {
      console.error("Error al reservar turno:", err);
      setError(err.message || "Ocurrió un error al reservar el turno");
    }
  };

  // ------------------------------
  // Función para cancelar un turno
  // ------------------------------
  const handleCancel = async (turno) => {
    try {
      const turnoRef = doc(db, "turnos", turno.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(turnoRef);
        if (!snap.exists()) throw new Error("Turno inexistente");
        const t = snap.data();
        if (!t.reservations?.includes(user.uid)) throw new Error("No tenés reserva en este turno");

        tx.update(turnoRef, {
          slotsAvailable: t.slotsAvailable + 1,
          reservations: t.reservations.filter(uid => uid !== user.uid),
        });
      });
      setError("");
    } catch (err) {
      console.error("Error al cancelar turno:", err);
      setError(err.message || "Ocurrió un error al cancelar el turno");
    }
  };

  // ------------------------------
  // Función para cerrar sesión
  // ------------------------------
  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (err) {
      console.error("Error al cerrar sesión:", err);
    }
  };

  // ------------------------------
  // Estilos violeta
  // ------------------------------
  const styles = {
    container: {
      p: 3,
      width: "100vw",
      height: "100vh",
      overflowY: "auto",
      background: "linear-gradient(135deg, #4e54c8, #8f94fb)",
      color: "#fff",
    },
    card: {
      background: "#6c63ff",
      color: "#fff",
    },
    buttonReserve: {
      mt: 1,
      backgroundColor: "#fff",
      color: "#6c63ff",
      "&:hover": { backgroundColor: "#eee" },
    },
    buttonCancel: {
      mt: 1,
      backgroundColor: "#ff6cec",
      "&:hover": { backgroundColor: "#ff4ed9" },
    },
    buttonLogout: {
      mt: 2,
      mb: 2,
      backgroundColor: "#ff4ed9",
      "&:hover": { backgroundColor: "#ff1ecb" },
    },
  };

  return (
    <Box sx={styles.container}>
      <Typography variant="h4" gutterBottom>
        Bienvenido {user.displayName || user.email}
      </Typography>

      <Button variant="contained" sx={styles.buttonLogout} onClick={handleLogout}>
        Cerrar Sesión
      </Button>

      {/* ---------------- Turnos disponibles ---------------- */}
      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>Turnos Disponibles</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {loadingAvailable ? (
        <Typography>Cargando turnos disponibles...</Typography>
      ) : availableTurns.length === 0 ? (
        <Typography>No hay turnos disponibles</Typography>
      ) : (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {availableTurns.map(turno => (
            <Grid item xs={12} sm={6} md={4} key={turno.id}>
              <Card sx={styles.card}>
                <CardContent>
                  <Typography variant="h6">{turno.placeName || "—"}</Typography>
                  <Typography>Fecha: {turno.date}</Typography>
                  <Typography>Hora: {turno.time}</Typography>
                  <Typography>Turnos disponibles: {turno.slotsAvailable ?? 0}</Typography>
                  <Button
                    variant="contained"
                    sx={styles.buttonReserve}
                    onClick={() => handleReserve(turno)}
                    disabled={turno.slotsAvailable <= 0 || turno.reservations?.includes(user.uid)}
                  >
                    Reservar
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* ---------------- Turnos reservados por el usuario ---------------- */}
      <Typography variant="h5" gutterBottom>Mis Turnos Reservados</Typography>
      {loadingUserTurns ? (
        <Typography>Cargando tus turnos...</Typography>
      ) : userTurns.length === 0 ? (
        <Typography>No reservaste turnos</Typography>
      ) : (
        <Grid container spacing={2}>
          {userTurns.map(turno => (
            <Grid item xs={12} sm={6} md={4} key={turno.id}>
              <Card sx={styles.card}>
                <CardContent>
                  <Typography variant="h6">{turno.placeName || "—"}</Typography>
                  <Typography>Fecha: {turno.date}</Typography>
                  <Typography>Hora: {turno.time}</Typography>
                  <Typography>Turnos disponibles: {turno.slotsAvailable ?? 0}</Typography>
                  <Button
                    variant="contained"
                    sx={styles.buttonCancel}
                    onClick={() => handleCancel(turno)}
                  >
                    Cancelar Turno
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}

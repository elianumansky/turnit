import React, { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, runTransaction, deleteDoc, getDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { Typography, Card, CardContent, Button, Grid, Box, TextField, Chip } from "@mui/material";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function UserDashboard({ user }) {
  const navigate = useNavigate();
  const [availableTurns, setAvailableTurns] = useState([]);
  const [userTurns, setUserTurns] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(true);
  const [loadingUserTurns, setLoadingUserTurns] = useState(true);
  const [error, setError] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [favorites, setFavorites] = useState([]);

  // ------------------------------
  // Borrar turnos expirados
  // ------------------------------
  const removeExpiredTurns = async (turns) => {
    const now = new Date();
    for (let t of turns) {
      if (new Date(t.dateTime) < now) {
        try {
          await deleteDoc(doc(db, "turnos", t.id));
        } catch (err) {
          console.error("Error al borrar turno expirado:", err);
        }
      }
    }
  };

  // ------------------------------
  // Cargar favoritos del usuario
  // ------------------------------
  useEffect(() => {
    if (!user) return;
    const fetchFavorites = async () => {
      const docRef = doc(db, "users", user.uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setFavorites(snap.data().favoritePlaces || []);
      }
    };
    fetchFavorites();
  }, [user]);

  // ------------------------------
  // Turnos disponibles
  // ------------------------------
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "turnos"), where("slotsAvailable", ">", 0));
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        let turns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        await removeExpiredTurns(turns);

        let filtered = turns.filter(t => !(t.reservations?.includes(user.uid)) && new Date(t.dateTime) > new Date());

        if (dateFilter) filtered = filtered.filter(t => t.date === dateFilter);
        if (timeFilter) filtered = filtered.filter(t => t.time === timeFilter);

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
  }, [user, dateFilter, timeFilter]);

  // ------------------------------
  // Turnos reservados por el usuario
  // ------------------------------
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "turnos"), where("reservations", "array-contains", user.uid));
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        let turns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        await removeExpiredTurns(turns);
        const futureTurns = turns.filter(t => new Date(t.dateTime) > new Date());
        setUserTurns(futureTurns);
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
  // Reservar un turno
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

      // Sumar puntos al usuario
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const currentPoints = userSnap.data().points || 0;
        await updateDoc(userRef, { points: currentPoints + 10 });
      }

      setError("");
    } catch (err) {
      console.error("Error al reservar turno:", err);
      setError(err.message || "Ocurrió un error al reservar el turno");
    }
  };

  // ------------------------------
  // Cancelar un turno
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
  // Favoritos
  // ------------------------------
  const toggleFavorite = async (placeId) => {
    const userRef = doc(db, "users", user.uid);
    const isFav = favorites.includes(placeId);
    let updated = isFav ? favorites.filter(f => f !== placeId) : [...favorites, placeId];
    await updateDoc(userRef, { favoritePlaces: updated });
    setFavorites(updated);
  };

  // ------------------------------
  // Cerrar sesión
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
  // Estilos y diseño
  // ------------------------------
  const styles = {
    container: {
      p: 3,
      width: "100vw",
      minHeight: "100vh",
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
    chipFav: {
      mt: 1,
      mb: 1,
      cursor: "pointer",
      backgroundColor: "#fff",
      color: "#6c63ff",
    },
  };

  return (
    <Box sx={styles.container}>
      <Typography variant="h4" gutterBottom>
        Bienvenido {user.displayName || user.email} &nbsp;
        <Chip label={`Puntos: ${user.points || 0}`} color="secondary" size="small" />
      </Typography>

      <Button variant="contained" sx={styles.buttonLogout} onClick={handleLogout}>
        Cerrar Sesión
      </Button>

      {/* ---------------- Filtros ---------------- */}
      <Box sx={{ mt: 2, mb: 2, display: "flex", gap: 2 }}>
        <TextField
          label="Filtrar por fecha"
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="Filtrar por hora"
          type="time"
          value={timeFilter}
          onChange={e => setTimeFilter(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Box>

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
                  <Typography variant="h6">{turno.placeName || "—"} &nbsp;
                    <Chip
                      label={favorites.includes(turno.placeId) ? "★" : "☆"}
                      onClick={() => toggleFavorite(turno.placeId)}
                      sx={styles.chipFav}
                    />
                  </Typography>
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

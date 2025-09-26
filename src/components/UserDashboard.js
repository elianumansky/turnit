import React, { useEffect, useMemo, useState } from "react";
import {
  collection, query, where, onSnapshot, doc, runTransaction,
  getDoc, updateDoc, deleteDoc
} from "firebase/firestore";
import { db, auth } from "../firebase";
import {
  Typography, Card, CardContent, Button, Grid, Box, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Snackbar, Alert, Tabs, Tab, CardMedia, TextField
} from "@mui/material";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

// Calendario
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, addMinutes } from "date-fns";
import es from "date-fns/locale/es";
import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = { es };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });
const timeToDate = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00`);

export default function UserDashboard({ user }) {
  const navigate = useNavigate();

  // Tabs
  const [tab, setTab] = useState(0);

  // Buscador y filtro
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  // Lugares y turnos
  const [places, setPlaces] = useState([]);
  const [placeNameById, setPlaceNameById] = useState({});
  const [placeIdsWithTurns, setPlaceIdsWithTurns] = useState(new Set());
  const [selectedPlace, setSelectedPlace] = useState(null);

  const [placeTurns, setPlaceTurns] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [myTurns, setMyTurns] = useState([]);
  const [loadingMyTurns, setLoadingMyTurns] = useState(true);
  const [favorites, setFavorites] = useState([]);

  const [confirmTurn, setConfirmTurn] = useState(null);
  const [toast, setToast] = useState({ open: false, msg: "", sev: "success" });

  // Limpieza de turnos expirados
  const removeExpiredTurns = async (turns) => {
    const now = new Date();
    for (const t of turns) {
      try {
        if (t?.dateTime && new Date(t.dateTime) < now) await deleteDoc(doc(db, "turnos", t.id));
      } catch (_) {}
    }
  };

  // Cargar favoritos
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) setFavorites(snap.data().favoritePlaces || []);
    })();
  }, [user]);

  // Cargar lugares
  useEffect(() => {
    const qPlaces = query(collection(db, "places"));
    const unsub = onSnapshot(qPlaces, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPlaces(list);
      const map = {};
      for (const p of list) map[p.id] = p.name || "—";
      setPlaceNameById(map);
    });
    return () => unsub();
  }, []);

  // Lugares con turnos futuros
  useEffect(() => {
    const qTurns = query(collection(db, "turnos"));
    const unsub = onSnapshot(qTurns, (snap) => {
      const now = new Date();
      const setIds = new Set();
      for (const d of snap.docs) {
        const t = d.data();
        if (!t?.placeId) continue;
        if (!t.dateTime || new Date(t.dateTime) >= now) setIds.add(t.placeId);
      }
      setPlaceIdsWithTurns(setIds);
      if (!selectedPlace && places.length) {
        const fav = places.find(p => setIds.has(p.id) && favorites.includes(p.id));
        setSelectedPlace(fav || places.find(p => setIds.has(p.id)) || null);
      }
    });
    return () => unsub();
  }, [places, favorites]);

  // Suscripción turnos del lugar seleccionado
  useEffect(() => {
    if (!selectedPlace?.id) { setPlaceTurns([]); setBlocks([]); return; }

    const qT = query(collection(db, "turnos"), where("placeId", "==", selectedPlace.id));
    const unsubT = onSnapshot(qT, async (snap) => {
      const turns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      await removeExpiredTurns(turns);
      setPlaceTurns(turns.filter(t => !t?.dateTime || new Date(t.dateTime) > new Date()));
    });

    const qB = query(collection(db, "blocks"), where("placeId", "==", selectedPlace.id));
    const unsubB = onSnapshot(qB, (snap) => {
      setBlocks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubT(); unsubB(); };
  }, [selectedPlace?.id]);

  // Mis turnos
  useEffect(() => {
    if (!user?.uid) return;
    setLoadingMyTurns(true);
    const qMine = query(collection(db, "turnos"), where("reservationUids", "array-contains", user.uid));
    const unsub = onSnapshot(qMine, async (snap) => {
      const turns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      await removeExpiredTurns(turns);
      setMyTurns(turns.filter(t => !t?.dateTime || new Date(t.dateTime) > new Date()));
      setLoadingMyTurns(false);
    }, () => setLoadingMyTurns(false));
    return () => unsub();
  }, [user]);

  const displayPlaceName = (turn) => turn.placeName || placeNameById[turn.placeId] || "—";

  // Eventos calendario
  const calendarEvents = useMemo(() => {
    if (!selectedPlace) return [];
    const out = [];
    for (const t of placeTurns) {
      if (!t?.date || !t?.time) continue;
      const start = timeToDate(t.date, t.time);
      const end = addMinutes(start, 60);
      const avail = Number(t.slotsAvailable ?? t.slots ?? 0);
      out.push({ id: t.id, title: avail > 0 ? "Disponible" : "Ocupado", start, end, type: "turn", turn: t });
    }
    for (const b of blocks) {
      if (!b?.date || !b?.startTime || !b?.endTime) continue;
      out.push({ id: `block-${b.id}`, title: `Bloqueado`, start: timeToDate(b.date, b.startTime), end: timeToDate(b.date, b.endTime), type: "block" });
    }
    return out;
  }, [placeTurns, blocks, selectedPlace]);

  const eventPropGetter = (event) => {
    if (event.type === "block") return { style: { backgroundColor: "#9e9e9e", color: "#fff", borderRadius: 6, border: 0 } };
    const avail = Number(event.turn?.slotsAvailable ?? event.turn?.slots ?? 0);
    return { style: { backgroundColor: avail <= 0 ? "#e53935" : "#43a047", color: "#fff", borderRadius: 6, border: 0, padding: "2px 6px" } };
  };

  const onSelectEvent = (ev) => {
    if (ev.type === "block") return;
    if ((Number(ev.turn?.slotsAvailable ?? ev.turn?.slots ?? 0)) <= 0) return;
    setConfirmTurn(ev.turn);
  };

  const toggleFavorite = async (placeId) => {
    if (!user?.uid) return;
    const ref = doc(db, "users", user.uid);
    const updated = favorites.includes(placeId) ? favorites.filter(f => f !== placeId) : [...favorites, placeId];
    await updateDoc(ref, { favoritePlaces: updated });
    setFavorites(updated);
  };

  const styles = {
    container: { p: 3, minHeight: "100vh", background: "linear-gradient(135deg,#4e54c8,#8f94fb)", color: "#fff" },
    whitePanel: { background: "#fff", borderRadius: 12, padding: 12, color: "#000" },
    card: { background: "#6c63ff", color: "#fff" },
    placeCard: { cursor: "pointer", borderRadius: 10, border: "1px solid #eaeaea", height: "100%" },
    buttonLogout: { mt: 2, mb: 2, backgroundColor: "#ff4ed9", "&:hover": { backgroundColor: "#ff1ecb" } },
    buttonCancel: { mt: 1, backgroundColor: "#ff6cec", "&:hover": { backgroundColor: "#ff4ed9" } }
  };

  // Filtrar por categoría y búsqueda
  const placesWithTurns = places.filter(p => placeIdsWithTurns.has(p.id));
  const favoritePlaces = places.filter(p => favorites.includes(p.id));
  const filteredPlaces = placesWithTurns.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) &&
    (filterCategory ? p.categories?.includes(filterCategory) : true)
  );
  const filteredFavorites = favoritePlaces.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) &&
    (filterCategory ? p.categories?.includes(filterCategory) : true)
  );

  const handleConfirmReserve = async () => {
    if (!confirmTurn || !user?.uid) return;
    try {
      const ref = doc(db, "turnos", confirmTurn.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error("El turno ya no existe.");
        const data = snap.data();
        const avail = Number(data.slotsAvailable ?? data.slots ?? 0);
        if (avail <= 0) throw new Error("El turno ya fue reservado.");
        transaction.update(ref, {
          slotsAvailable: avail - 1,
          reservationUids: [...(data.reservationUids || []), user.uid],
          placeName: placeNameById[data.placeId] || data.placeName || "—"
        });
      });
      setToast({ open: true, msg: "Turno reservado con éxito ✅", sev: "success" });
      setConfirmTurn(null);
    } catch (err) {
      setToast({ open: true, msg: err.message, sev: "error" });
    }
  };

  const handleCancel = async (turno) => {
    try {
      const ref = doc(db, "turnos", turno.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error("El turno ya no existe.");
        const data = snap.data();
        transaction.update(ref, {
          slotsAvailable: (data.slotsAvailable ?? data.slots ?? 0) + 1,
          reservationUids: (data.reservationUids || []).filter(uid => uid !== user.uid)
        });
      });
      setToast({ open: true, msg: "Turno cancelado ❌", sev: "success" });
    } catch (err) {
      setToast({ open: true, msg: err.message, sev: "error" });
    }
  };

  return (
    <Box sx={styles.container}>
      <Typography variant="h4">¡Hola {user?.displayName || user?.email}!</Typography>
      <Button variant="contained" sx={styles.buttonLogout} onClick={async()=>{ await signOut(auth); navigate("/"); }}>Cerrar Sesión</Button>

      <Box sx={{ mt: 2, ...styles.whitePanel }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Reservar turnos" />
          <Tab label="Mis reservas" />
          <Tab label="Favoritos" />
        </Tabs>
      </Box>

      {/* === TAB 0: Reservar === */}
      {tab === 0 && (
        <Box sx={{ mt: 2, ...styles.whitePanel }}>
          <TextField
            select
            label="Filtrar por categoría"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            SelectProps={{ native: true }}
            fullWidth
            sx={{ mb: 2 }}
          >
            <option value="">Todas</option>
            {[...new Set(places.flatMap(p => p.categories || []))].map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </TextField>

          <TextField
            fullWidth
            variant="outlined"
            size="small"
            placeholder="Buscar lugar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ mb: 2 }}
          />

          <Typography variant="subtitle1" sx={{ mb: 1 }}>Elegí un lugar</Typography>
          {filteredPlaces.length === 0 ? (
            <Typography color="text.secondary">No hay lugares con turnos publicados.</Typography>
          ) : (
            <Grid container spacing={2}>
              {filteredPlaces.map((p) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={p.id}>
                  <Card
                    sx={{ ...styles.placeCard, boxShadow: selectedPlace?.id === p.id ? "0 0 0 3px #4e54c8" : "" }}
                    onClick={() => setSelectedPlace(p)}
                  >
                    {p.photoUrl && <CardMedia component="img" height="140" image={p.photoUrl} alt={p.name || "Lugar"} />}
                    <CardContent>
                      <Typography variant="h6">{p.name || "—"}</Typography>
                      {p.categories?.map((cat) => (
                        <Chip key={cat} label={cat} size="small" color="info" sx={{ mb: 0.5, mr: 0.5 }} />
                      ))}
                      {p.description && <Typography variant="body2" color="text.secondary">{p.description}</Typography>}
                      <Chip
                        label={favorites.includes(p.id) ? "★ Favorito" : "☆ Agregar a favoritos"}
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
                        color={favorites.includes(p.id) ? "warning" : "default"}
                        size="small"
                      />
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}

          {selectedPlace && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6">{selectedPlace.name}</Typography>
              <Calendar
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                defaultView={Views.WEEK}
                views={[Views.WEEK, Views.DAY, Views.MONTH]}
                style={{ height: 500, background: "#fff", color: "#000" }}
                onSelectEvent={onSelectEvent}
                eventPropGetter={eventPropGetter}
              />
            </Box>
          )}
        </Box>
      )}

      {/* === TAB 1: Mis reservas === */}
      {tab === 1 && (
        <Box sx={{ mt: 2 }}>
          {loadingMyTurns ? (
            <Typography>Cargando tus turnos…</Typography>
          ) : myTurns.length === 0 ? (
            <Typography>No tenés reservas futuras.</Typography>
          ) : (
            <Grid container spacing={2}>
              {myTurns.map(turno => (
                <Grid item xs={12} sm={6} md={4} key={turno.id}>
                  <Card sx={styles.card}>
                    <CardContent>
                      <Typography variant="h6">{displayPlaceName(turno)}</Typography>
                      <Typography>Fecha: {turno.date}</Typography>
                      <Typography>Hora: {turno.time}</Typography>
                      <Button variant="contained" sx={styles.buttonCancel} onClick={() => handleCancel(turno)}>
                        Cancelar turno
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* === TAB 2: Favoritos === */}
      {tab === 2 && (
        <Box sx={{ mt: 2, ...styles.whitePanel }}>
          <TextField
            select
            label="Filtrar por categoría"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            SelectProps={{ native: true }}
            fullWidth
            sx={{ mb: 2 }}
          >
            <option value="">Todas</option>
            {[...new Set(places.flatMap(p => p.categories || []))].map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </TextField>

          <TextField
            fullWidth
            variant="outlined"
            size="small"
            placeholder="Buscar en favoritos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ mb: 2 }}
          />

          <Typography variant="subtitle1">Tus lugares favoritos</Typography>
          {filteredFavorites.length === 0 ? (
            <Typography color="text.secondary">No tenés lugares favoritos.</Typography>
          ) : (
            <Grid container spacing={2}>
              {filteredFavorites.map((p) => (
                <Grid item xs={12} sm={6} md={4} key={p.id}>
                  <Card sx={styles.placeCard} onClick={() => setSelectedPlace(p)}>
                    {p.photoUrl && <CardMedia component="img" height="140" image={p.photoUrl} />}
                    <CardContent>
                      <Typography variant="h6">{p.name}</Typography>
                      {p.categories?.map((cat) => (
                        <Chip key={cat} label={cat} size="small" color="info" sx={{ mb: 0.5, mr: 0.5 }} />
                      ))}
                                            {p.description && <Typography variant="body2">{p.description}</Typography>}
                      <Chip
                        label="Quitar de favoritos"
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
                        color="warning"
                        size="small"
                      />
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* Diálogo de confirmación de reserva */}
      <Dialog open={!!confirmTurn} onClose={() => setConfirmTurn(null)}>
        <DialogTitle>Confirmar reserva</DialogTitle>
        <DialogContent>
          {confirmTurn && (
            <>
              <Typography>Lugar: {confirmTurn.placeName || placeNameById[confirmTurn.placeId]}</Typography>
              <Typography>Fecha: {confirmTurn.date}</Typography>
              <Typography>Hora: {confirmTurn.time}</Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmTurn(null)}>Cancelar</Button>
          <Button variant="contained" onClick={handleConfirmReserve}>Reservar</Button>
        </DialogActions>
      </Dialog>

      {/* Toast de notificaciones */}
      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.sev} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
}

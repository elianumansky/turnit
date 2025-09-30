// UserDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection, query, where, onSnapshot, doc, runTransaction,
  getDoc, updateDoc, deleteDoc, getDocs, addDoc, serverTimestamp
} from "firebase/firestore";
import { db, auth } from "../firebase";
import {
  Typography, Card, CardContent, Button, Grid, Box, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Snackbar, Alert, Tabs, Tab, CardMedia, TextField, MenuItem
} from "@mui/material";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

// Calendario
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import es from "date-fns/locale/es";
import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = { es };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });
const timeToDate = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00`);
const pad2 = (n) => String(n).padStart(2, "0");

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
  const [placeById, setPlaceById] = useState({});
  const [placeIdsWithTurns, setPlaceIdsWithTurns] = useState(new Set());
  const [selectedPlace, setSelectedPlace] = useState(null);

  const [placeTurns, setPlaceTurns] = useState([]);
  const [myTurns, setMyTurns] = useState([]);
  const [loadingMyTurns, setLoadingMyTurns] = useState(true);
  const [favorites, setFavorites] = useState([]);

  const [confirmTurn, setConfirmTurn] = useState(null);

  // Elección de servicio/duración (para modo flex o fixed)
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState(""); // flex

  const [toast, setToast] = useState({ open: false, msg: "", sev: "success" });

  // Limpieza de turnos expirados
  const removeExpiredTurns = async (turns) => {
    const now = new Date();
    for (const t of turns) {
      try {
        if (t?.date && t?.time) {
          const start = timeToDate(t.date, t.time);
          const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
          if (end < now) await deleteDoc(doc(db, "turnos", t.id));
        }
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
      const full = {};
      for (const p of list) { map[p.id] = p.name || "—"; full[p.id] = p; }
      setPlaceNameById(map);
      setPlaceById(full);
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
        if (!t.date || !t.time) continue;
        const start = timeToDate(t.date, t.time);
        const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
        if (end >= now) setIds.add(t.placeId);
      }
      setPlaceIdsWithTurns(setIds);
      if (!selectedPlace && places.length) {
        const fav = places.find(p => setIds.has(p.id) && favorites.includes(p.id));
        setSelectedPlace(fav || places.find(p => setIds.has(p.id)) || null);
      }
    });
    return () => unsub();
  }, [places, favorites, selectedPlace]);

  // Suscripción turnos del lugar seleccionado
  useEffect(() => {
    if (!selectedPlace?.id) { setPlaceTurns([]); return; }
    const qT = query(collection(db, "turnos"), where("placeId", "==", selectedPlace.id));
    const unsubT = onSnapshot(qT, async (snap) => {
      const turns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      await removeExpiredTurns(turns);
      setPlaceTurns(turns.filter(t => {
        if (!t?.date || !t?.time) return false;
        const start = timeToDate(t.date, t.time);
        const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
        return end > new Date();
      }));
    });
    return () => { unsubT(); };
  }, [selectedPlace?.id]);

  // Mis turnos
  useEffect(() => {
    if (!user?.uid) return;
    setLoadingMyTurns(true);
    const qMine = query(collection(db, "turnos"), where("reservationUids", "array-contains", user.uid));
    const unsub = onSnapshot(qMine, async (snap) => {
      const turns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      await removeExpiredTurns(turns);
      setMyTurns(turns.filter(t => {
        if (!t?.date || !t?.time) return false;
        const start = timeToDate(t.date, t.time);
        const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
        return end > new Date();
      }));
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
      const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
      const avail = Number(t.slotsAvailable ?? t.slots ?? 0);
      out.push({ id: t.id, title: avail > 0 ? "Disponible" : "Ocupado", start, end, type: "turn", turn: t });
    }
    return out;
  }, [placeTurns, selectedPlace]);

  const eventPropGetter = (event) => {
    const avail = Number(event.turn?.slotsAvailable ?? event.turn?.slots ?? 0);
    return { style: { backgroundColor: avail <= 0 ? "#e53935" : "#43a047", color: "#fff", borderRadius: 6, border: 0, padding: "2px 6px" } };
  };

  const onSelectEvent = (ev) => {
    if ((Number(ev.turn?.slotsAvailable ?? ev.turn?.slots ?? 0)) <= 0) return;
    setConfirmTurn(ev.turn);
    setSelectedServiceId("");
    setSelectedOptionId("");
  };

  const toggleFavorite = async (placeId) => {
  if (!user?.uid) return;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const arr = snap.exists() ? (snap.data().favoritePlaces || []) : [];
  const updated = arr.includes(placeId) ? arr.filter(f => f !== placeId) : [...arr, placeId];
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

  const selectedPlaceDoc = selectedPlace ? placeById[selectedPlace.id] : null;
  const schedulingMode = selectedPlaceDoc?.schedulingMode || (selectedPlaceDoc?.flexibleEnabled ? "flex" : "fixed");
  const services = selectedPlaceDoc?.services || [];
  const selectedService = services.find(s => s.id === selectedServiceId) || null;
  const serviceOptions = selectedService ? (selectedService.options || []) : [];
  const depositPercent = Number(selectedPlaceDoc?.depositPercent || 0);
  const selectedOption = serviceOptions.find(o => o.id === selectedOptionId) || null;

  const selectedPrice = selectedOption ? Number(selectedOption.price || 0) : 0;
  const depositDue = Math.round(selectedPrice * (depositPercent / 100));

  // Reservar (incluye merge de bloques contiguos en modo flex si la duración > paso base)
  const handleConfirmReserve = async () => {
    if (!confirmTurn || !user?.uid) return;

    try {
      const turnRef = doc(db, "turnos", confirmTurn.id);
      const turnSnap = await getDoc(turnRef);
      if (!turnSnap.exists()) throw new Error("El turno ya no existe.");
      const t0 = turnSnap.data();

      const placeRef = doc(db, "places", t0.placeId);
      const placeSnap = await getDoc(placeRef);
      const p = placeSnap.exists() ? placeSnap.data() : {};
      const mode = p.schedulingMode || (p.flexibleEnabled ? "flex" : "fixed");

      if (mode === "fixed") {
        await runTransaction(db, async (tx) => {
          const s = await tx.get(turnRef);
          if (!s.exists()) throw new Error("Turno inexistente");
          const data = s.data();
          const avail = Number(data.slotsAvailable ?? data.slots ?? 0);
          if (avail <= 0) throw new Error("El turno ya fue reservado.");

          const reservations = Array.isArray(data.reservations) ? [...data.reservations] : [];
          reservations.push({
            uid: user.uid,
            name: user.displayName || user.email || "Cliente",
            serviceId: selectedServiceId || data.serviceId || null,
            serviceName: (services.find(sv => sv.id === selectedServiceId)?.name) || data.serviceName || null,
            durationMinutes: Number(data.durationMinutes || 60),
            price: 0,
            depositPercent: Number(p.depositPercent || 0),
            depositDue: 0,
          });

          tx.update(turnRef, {
            slotsAvailable: avail - 1,
            reservationUids: [...(data.reservationUids || []), user.uid],
            reservations,
            placeName: data.placeName || selectedPlace?.name || "—"
          });
        });

      } else {
        if (!selectedService || !selectedOption) {
          setToast({ open: true, msg: "Elegí servicio y duración.", sev: "warning" });
          return;
        }

        const step = Number((services.flatMap(s => s.options || []).map(o => o.durationMinutes).sort((a,b)=>a-b)[0]) || 30);
        const need = Number(selectedOption.durationMinutes);
        if (need <= 0) throw new Error("Duración inválida.");

        const k = Math.ceil(need / step);

        const startDate = t0.date;
        const [hh, mm] = t0.time.split(":").map(Number);
        const baseStart = new Date(`${startDate}T${pad2(hh)}:${pad2(mm)}:00`);
        const neededTimes = [];
        for (let i = 0; i < k; i++) {
          const dt = new Date(baseStart.getTime() + i * step * 60000);
          neededTimes.push(`${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`);
        }

        const qBlocks = query(
          collection(db, "turnos"),
          where("placeId", "==", t0.placeId),
          where("date", "==", startDate)
        );
        const allSnap = await getDocs(qBlocks);
        const byTime = {};
        allSnap.docs.forEach(d => { const td = d.data(); byTime[td.time] = { id: d.id, ...td }; });

        const blockDocs = neededTimes.map(tm => byTime[tm]).filter(Boolean);
        if (blockDocs.length < neededTimes.length) {
          throw new Error("No hay disponibilidad contigua para esa duración.");
        }
        for (const b of blockDocs) {
          const avail = Number(b.slotsAvailable ?? b.slots ?? 0);
          if (avail <= 0 || b.status === "expired") throw new Error("No hay disponibilidad contigua suficiente.");
        }

        await runTransaction(db, async (tx) => {
          const snaps = await Promise.all(blockDocs.map(b => tx.get(doc(db, "turnos", b.id))));
          const fresh = snaps.map(s => ({ id: s.id, ...s.data() }));
          for (const b of fresh) {
            const avail = Number(b.slotsAvailable ?? b.slots ?? 0);
            if (avail <= 0 || b.status === "expired") throw new Error("No hay disponibilidad contigua suficiente.");
          }

          const first = fresh[0];
          const firstRef = doc(db, "turnos", first.id);
          const reservations = Array.isArray(first.reservations) ? [...first.reservations] : [];
          reservations.push({
            uid: user.uid,
            name: user.displayName || user.email || "Cliente",
            serviceId: selectedService.id,
            serviceName: selectedService.name,
            optionId: selectedOption.id,
            durationMinutes: need,
            price: Number(selectedOption.price),
            depositPercent: Number(p.depositPercent || 0),
            depositDue: Math.round(Number(selectedOption.price) * Number(p.depositPercent || 0) / 100),
          });

          tx.update(firstRef, {
            durationMinutes: need,
            slotsAvailable: Number(first.slotsAvailable ?? first.slots ?? 0) - 1,
            reservationUids: [...(first.reservationUids || []), user.uid],
            reservations,
            placeName: first.placeName || selectedPlace?.name || "—",
          });

          for (let i = 1; i < fresh.length; i++) {
            tx.delete(doc(db, "turnos", fresh[i].id));
          }
        });
      }

      setToast({ open: true, msg: "Turno reservado con éxito ✅", sev: "success" });
      setConfirmTurn(null);
    } catch (err) {
      setToast({ open: true, msg: err.message || "No se pudo reservar.", sev: "error" });
    }
  };

  // CANCELAR (con reconstrucción de bloques si corresponde)
  // CANCELAR (con reconstrucción de bloques si corresponde)
const handleCancel = async (turno) => {
  try {
    const result = await runTransaction(db, async (tx) => {
      const ref = doc(db, "turnos", turno.id);

      // 1) LECTURAS (todas antes de cualquier escritura)
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("El turno ya no existe.");
      const data = snap.data();

      const placeRef = doc(db, "places", data.placeId);
      const pSnap = await tx.get(placeRef); // leer place SIEMPRE (para cumplir la regla)
      const pData = pSnap.exists() ? pSnap.data() : {};

      // 2) Cálculos en memoria
      const newReservations = (data.reservations || []).filter(r => r.uid !== user.uid);
      const newUids = (data.reservationUids || []).filter(uid => uid !== user.uid);
      const newAvail = (data.slotsAvailable ?? data.slots ?? 0) + 1;

      const isFlex = data.mode === "flex";
      const allOpts = (pData.services || []).flatMap(s => s.options || []);
      const step = Math.max(
        5,
        Math.min(...allOpts.map(o => Number(o.durationMinutes || 0)).filter(n => n > 0))
        || Number(data.durationMinutes || 30)
      );

      const needReconstruct =
        isFlex &&
        newReservations.length === 0 &&
        Number(data.durationMinutes || step) > step;

      // 3) ESCRITURAS (después de todas las lecturas)
      if (needReconstruct) {
        // encoger el bloque principal al paso base
        tx.update(ref, {
          durationMinutes: step,
          slotsAvailable: newAvail,
          reservationUids: newUids,
          reservations: newReservations
        });
      } else {
        // cancelación normal
        tx.update(ref, {
          slotsAvailable: newAvail,
          reservationUids: newUids,
          reservations: newReservations
        });
      }

      // 4) Devolver instrucciones para reconstruir fuera de la transacción
      if (needReconstruct) {
        const baseDate = data.date;
        const [hh, mm] = (data.time || "00:00").split(":").map(Number);
        const baseStartMs = new Date(
          `${baseDate}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`
        ).getTime();

        const dur = Number(data.durationMinutes || step);
        const extra = dur - step;
        const kMore = Math.ceil(extra / step);

        return {
          recreate: {
            placeId: data.placeId,
            placeName: data.placeName || "—",
            baseDate,
            baseStartMs,
            step,
            kMore,
            mode: "flex"
          }
        };
      }

      return { recreate: null };
    });

    // Fuera de la transacción: reconstrucción de bloques si corresponde
    if (result?.recreate) {
      const { placeId, placeName, baseDate, baseStartMs, step, kMore, mode } = result.recreate;

      for (let i = 1; i <= kMore; i++) {
        const start = new Date(baseStartMs + i * step * 60000);
        const hh2 = String(start.getHours()).padStart(2, "0");
        const mm2 = String(start.getMinutes()).padStart(2, "0");
        const timeStr = `${hh2}:${mm2}`;

        // evitar duplicados si alguien creó algo en el medio
        const clashQ = query(
          collection(db, "turnos"),
          where("placeId", "==", placeId),
          where("date", "==", baseDate),
          where("time", "==", timeStr)
        );
        const clashSnap = await getDocs(clashQ);
        if (!clashSnap.empty) continue;

        await addDoc(collection(db, "turnos"), {
          placeId,
          placeName,
          date: baseDate,
          time: timeStr,
          dateTime: new Date(`${baseDate}T${timeStr}:00`).toISOString(),
          durationMinutes: step,
          slots: 1,
          slotsAvailable: 1,
          reservations: [],
          reservationUids: [],
          status: "available",
          createdAt: serverTimestamp(),
          mode
        });
      }
    }

    setToast({ open: true, msg: "Turno cancelado ❌", sev: "success" });
  } catch (err) {
    setToast({ open: true, msg: err.message || "No se pudo cancelar.", sev: "error" });
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

              {/* Selector servicio / duración visible sobre el calendario */}
              <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
                <TextField
                  select
                  label="Servicio"
                  value={selectedServiceId}
                  onChange={(e)=>{ setSelectedServiceId(e.target.value); setSelectedOptionId(""); }}
                  sx={{ minWidth: 240 }}
                >
                  <MenuItem value="">(Sin servicio)</MenuItem>
                  {(services || []).map(s => (
                    <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                  ))}
                </TextField>

                {(schedulingMode === "flex") && (
                  <TextField
                    select
                    label="Duración (opción)"
                    value={selectedOptionId}
                    onChange={(e)=> setSelectedOptionId(e.target.value)}
                    sx={{ minWidth: 220 }}
                  >
                    <MenuItem value="">(Elegir)</MenuItem>
                    {(selectedService?.options || []).map(o => (
                      <MenuItem key={o.id} value={o.id}>
                        {o.durationMinutes} min — ${o.price}
                      </MenuItem>
                    ))}
                  </TextField>
                )}

                {(schedulingMode === "flex" && selectedOption) && (
                  <Chip color="success" label={`Total: $${selectedPrice} · Seña: $${depositDue}`} />
                )}
              </Box>

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
                      <Typography>Duración: {turno.durationMinutes || 60} min</Typography>
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

              {schedulingMode === "fixed" ? (
                <>
                  <Typography sx={{ mt: 1, fontWeight: 600 }}>Turno fijo</Typography>
                  <Typography>Duración: {confirmTurn.durationMinutes || 60} min</Typography>
                  <TextField
                    select
                    label="Servicio"
                    value={selectedServiceId}
                    onChange={(e)=> setSelectedServiceId(e.target.value)}
                    sx={{ mt: 1, minWidth: 220 }}
                  >
                    <MenuItem value="">(Sin servicio)</MenuItem>
                    {(services || []).map(s => (
                      <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                    ))}
                  </TextField>
                </>
              ) : (
                <>
                  <Typography sx={{ mt: 1, fontWeight: 600 }}>Turno flexible</Typography>
                  <TextField
                    select
                    label="Servicio"
                    value={selectedServiceId}
                    onChange={(e)=>{ setSelectedServiceId(e.target.value); setSelectedOptionId(""); }}
                    sx={{ mt: 1, minWidth: 240 }}
                  >
                    <MenuItem value="">(Elegir)</MenuItem>
                    {(services || []).map(s => (
                      <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Duración"
                    value={selectedOptionId}
                    onChange={(e)=> setSelectedOptionId(e.target.value)}
                    sx={{ mt: 1, minWidth: 220 }}
                    disabled={!selectedService}
                  >
                    <MenuItem value="">(Elegir)</MenuItem>
                    {(selectedService?.options || []).map(o => (
                      <MenuItem key={o.id} value={o.id}>
                        {o.durationMinutes} min — ${o.price}
                      </MenuItem>
                    ))}
                  </TextField>

                  {selectedOption && (
                    <Box sx={{ mt: 1 }}>
                      <Chip color="success" label={`Total: $${selectedPrice} · Seña: $${depositDue}`} />
                    </Box>
                  )}
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmTurn(null)}>Cancelar</Button>
          <Button variant="contained" onClick={handleConfirmReserve}>Reservar</Button>
        </DialogActions>
      </Dialog>

      {/* Toast de notificaciones */}
      <Snackbar open={toast.open} autoHideDuration={3200} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.sev} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
}

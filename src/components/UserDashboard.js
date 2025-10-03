// src/components/UserDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection, query, where, onSnapshot, doc, runTransaction,
  getDoc, updateDoc, addDoc, serverTimestamp, getDocs
} from "firebase/firestore";
import { db } from "../firebase";
import {
  Typography, Card, CardContent, Button, Grid, Box, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Snackbar, Alert, Tabs, Tab, CardMedia, TextField, MenuItem, Rating, Divider
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { getAuth, signOut as fbSignOut } from "firebase/auth";

// Calendario
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import es from "date-fns/locale/es";
import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = { es };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });
const timeToDate = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00`);
const pad2 = (n) => String(n).padStart(2, "0");

// Haversine para km
const toRad = (v) => (v * Math.PI) / 180;
const distanceKm = (a, b) => {
  if (!a || !b) return Infinity;
  const R = 6371;
  const dLat = toRad((b.lat || 0) - (a.lat || 0));
  const dLon = toRad((b.lng || 0) - (a.lng || 0));
  const lat1 = toRad(a.lat || 0);
  const lat2 = toRad(b.lat || 0);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
};

export default function UserDashboard({ user }) {
  const navigate = useNavigate();

  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDistance, setFilterDistance] = useState("all"); // all|5|10|20|50

  const [places, setPlaces] = useState([]);
  const [placeById, setPlaceById] = useState({});
  const [placeIdsWithTurns, setPlaceIdsWithTurns] = useState(new Set());
  const [selectedPlace, setSelectedPlace] = useState(null);

  const [placeTurns, setPlaceTurns] = useState([]);
  const [myFutureTurns, setMyFutureTurns] = useState([]);
  const [myPastTurns, setMyPastTurns] = useState([]);
  const [loadingMyTurns, setLoadingMyTurns] = useState(true);
  const [favorites, setFavorites] = useState([]);

  const [confirmTurn, setConfirmTurn] = useState(null);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState("");

  const [toast, setToast] = useState({ open: false, msg: "", sev: "success" });

  const [userLocation, setUserLocation] = useState(null); // {lat, lng}

  // ----- logout robusto -----
  const handleLogout = async () => {
    try {
      await fbSignOut(getAuth());
      navigate("/");
    } catch (e) {
      console.error("Logout error:", e);
      setToast({ open: true, sev: "error", msg: "No se pudo cerrar sesión." });
    }
  };

  // ----- cargar ubicación del usuario (si está guardada en users/{uid}.location) -----
  useEffect(() => {
    (async () => {
      if (!user?.uid) return;
      const uref = doc(db, "users", user.uid);
      const usnap = await getDoc(uref);
      const loc = usnap.exists() ? usnap.data().location : null;
      if (loc?.lat && loc?.lng) setUserLocation(loc);
    })();
  }, [user]);
  useEffect(() => {
  if (!userLocation && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    });
  }
}, [userLocation]);


  // ----- favoritos -----
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) setFavorites(snap.data().favoritePlaces || []);
    })();
  }, [user]);

  // ----- lugares -----
  useEffect(() => {
    const qPlaces = query(collection(db, "places"));
    const unsub = onSnapshot(qPlaces, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPlaces(list);
      const map = {};
      for (const p of list) map[p.id] = p;
      setPlaceById(map);
    });
    return () => unsub();
  }, []);

  // ----- lugares con turnos futuros -----
  useEffect(() => {
    const qTurns = query(collection(db, "turnos"));
    const unsub = onSnapshot(qTurns, (snap) => {
      const now = new Date();
      const setIds = new Set();
      for (const d of snap.docs) {
        const t = d.data();
        if (!t?.placeId || !t?.date || !t?.time) continue;
        const start = timeToDate(t.date, t.time);
        const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
        if (end >= now && t.status !== "canceled") setIds.add(t.placeId);
      }
      setPlaceIdsWithTurns(setIds);
      if (!selectedPlace && places.length) {
        const fav = places.find(p => setIds.has(p.id) && favorites.includes(p.id));
        setSelectedPlace(fav || places.find(p => setIds.has(p.id)) || null);
      }
    });
    return () => unsub();
  }, [places, favorites, selectedPlace]);

  // ----- turnos del lugar seleccionado -----
  useEffect(() => {
    if (!selectedPlace?.id) { setPlaceTurns([]); return; }
    const qT = query(collection(db, "turnos"), where("placeId", "==", selectedPlace.id));
    const unsub = onSnapshot(qT, async (snap) => {
      const now = new Date();
      const turns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Marcar completados (no borrar)
      for (const t of turns) {
        if (!t?.date || !t?.time || t.status === "canceled") continue;
        const start = timeToDate(t.date, t.time);
        const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
        if (end < now && t.status !== "completed") {
          try { await updateDoc(doc(db, "turnos", t.id), { status: "completed" }); } catch {}
        }
      }
      setPlaceTurns(
        turns.filter(t => {
          if (!t?.date || !t?.time) return false;
          const start = timeToDate(t.date, t.time);
          const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
          return end > now && t.status !== "canceled";
        })
      );
    });
    return () => unsub();
  }, [selectedPlace?.id]);

  // ----- mis turnos (futuros y pasados) -----
  useEffect(() => {
    if (!user?.uid) return;
    setLoadingMyTurns(true);
    const qMine = query(collection(db, "turnos"), where("reservationUids", "array-contains", user.uid));
    const unsub = onSnapshot(qMine, async (snap) => {
      const now = new Date();
      const turns = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // marcar completados
      for (const t of turns) {
        if (!t?.date || !t?.time || t.status === "canceled") continue;
        const start = timeToDate(t.date, t.time);
        const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
        if (end < now && t.status !== "completed") {
          try { await updateDoc(doc(db, "turnos", t.id), { status: "completed" }); } catch {}
        }
      }

      setMyFutureTurns(
        turns.filter(t => {
          if (!t?.date || !t?.time) return false;
          const start = timeToDate(t.date, t.time);
          const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
          return end > now && t.status !== "canceled";
        })
      );
      setMyPastTurns(turns.filter(t => t.status === "completed"));
      setLoadingMyTurns(false);
    }, () => setLoadingMyTurns(false));
    return () => unsub();
  }, [user]);

  // ----- helpers UI -----
  const styles = {
    container: { p: 3, minHeight: "100vh", background: "linear-gradient(135deg,#4e54c8,#8f94fb)", color: "#fff" },
    whitePanel: { background: "#fff", borderRadius: 12, padding: 12, color: "#000" },
    placeCard: { cursor: "pointer", borderRadius: 10, border: "1px solid #eaeaea", height: "100%" },
    placeCardSelected: { boxShadow: "0 0 0 3px #4e54c8" },
    userCard: { background: "#6c63ff", color: "#fff" },
    logoutBtn: { mt: 2, mb: 2, backgroundColor: "#ff4ed9", "&:hover": { backgroundColor: "#ff1ecb" } },
    cancelBtn: { mt: 1, backgroundColor: "#ff6cec", "&:hover": { backgroundColor: "#ff4ed9" } }
  };

  const placeDistance = (p) =>
    p?.location?.lat && p?.location?.lng && userLocation
      ? distanceKm(userLocation, p.location)
      : Infinity;

  // filtros
  const placesWithTurns = places.filter(p => placeIdsWithTurns.has(p.id));

  const filteredPlaces = placesWithTurns
    .filter(p =>
      (p.name || "—").toLowerCase().includes(search.toLowerCase()) &&
      (filterCategory ? (p.categories || []).includes(filterCategory) : true)
    )
    .filter(p => {
      if (filterDistance === "all") return true;
      const km = Number(filterDistance);
      return placeDistance(p) <= km + 0.0001;
    })
    .sort((a, b) => {
      if (!userLocation) return 0;
      return placeDistance(a) - placeDistance(b);
    });

  const favoritePlaces = places.filter(p => favorites.includes(p.id));

  // datos del lugar seleccionado
  const selectedPlaceDoc = selectedPlace ? placeById[selectedPlace.id] : null;
  const services = selectedPlaceDoc?.services || [];
  const schedulingMode = selectedPlaceDoc?.schedulingMode || (selectedPlaceDoc?.flexibleEnabled ? "flex" : "fixed");
  const selectedService = services.find(s => s.id === selectedServiceId) || null;
  const serviceOptions = selectedService ? (selectedService.options || []) : [];
  const selectedOption = serviceOptions.find(o => o.id === selectedOptionId) || null;
  const depositPercent = Number(selectedPlaceDoc?.depositPercent || 0);
  const selectedPrice = selectedOption ? Number(selectedOption.price || 0) : 0;
  const depositDue = Math.round(selectedPrice * (depositPercent / 100));

  const calendarEvents = useMemo(() => {
    if (!selectedPlace) return [];
    return placeTurns.map(t => {
      const start = timeToDate(t.date, t.time);
      const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
      const avail = Number(t.slotsAvailable ?? t.slots ?? 0);
      return { id: t.id, title: avail > 0 ? "Disponible" : "Ocupado", start, end, type: "turn", turn: t };
    });
  }, [placeTurns, selectedPlace]);

  const eventPropGetter = (event) => {
    const avail = Number(event.turn?.slotsAvailable ?? event.turn?.slots ?? 0);
    return { style: { backgroundColor: avail <= 0 ? "#e53935" : "#43a047", color: "#fff", borderRadius: 6, border: 0, padding: "2px 6px" } };
  };

  const onSelectEvent = (ev) => {
    const avail = Number(ev.turn?.slotsAvailable ?? ev.turn?.slots ?? 0);
    if (avail <= 0) return;
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

  // ----- Reservar -----
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

        const allDur = (services.flatMap(s => s.options || []).map(o => Number(o.durationMinutes)).filter(Boolean));
        const step = Math.min(...allDur) || 30;
        const need = Number(selectedOption.durationMinutes);

        // construir tiempos contiguos requeridos
        const [hh, mm] = t0.time.split(":").map(Number);
        const baseStart = new Date(`${t0.date}T${pad2(hh)}:${pad2(mm)}:00`);
        const blocksNeeded = Math.ceil(need / step);
        const neededTimes = Array.from({ length: blocksNeeded }, (_, i) => {
          const dt = new Date(baseStart.getTime() + i * step * 60000);
          return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
        });

        // leer todos los bloques del día
        const qBlocks = query(
          collection(db, "turnos"),
          where("placeId", "==", t0.placeId),
          where("date", "==", t0.date)
        );
        const allSnap = await getDocs(qBlocks);
        const byTime = {};
        allSnap.docs.forEach(d => { const td = d.data(); byTime[td.time] = { id: d.id, ...td }; });

        const blockDocs = neededTimes.map(tm => byTime[tm]).filter(Boolean);
        if (blockDocs.length < neededTimes.length) throw new Error("No hay disponibilidad contigua suficiente.");
        for (const b of blockDocs) {
          const avail = Number(b.slotsAvailable ?? b.slots ?? 0);
          if (avail <= 0 || b.status === "expired" || b.status === "canceled") throw new Error("No hay disponibilidad contigua suficiente.");
        }

        await runTransaction(db, async (tx) => {
          // refrescar dentro de la tx
          const fresh = await Promise.all(blockDocs.map(b => tx.get(doc(db, "turnos", b.id))));
          const blocks = fresh.map(s => ({ id: s.id, ...s.data() }));
          for (const b of blocks) {
            const avail = Number(b.slotsAvailable ?? b.slots ?? 0);
            if (avail <= 0 || b.status === "expired" || b.status === "canceled") throw new Error("No hay disponibilidad contigua suficiente.");
          }

          // reservar en el primero
          const first = blocks[0];
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
            mode: "flex"
          });

          // borrar los bloques sobrantes (fusionar)
          for (let i = 1; i < blocks.length; i++) {
            tx.delete(doc(db, "turnos", blocks[i].id));
          }
        });
      }

      setToast({ open: true, msg: "Turno reservado con éxito ✅", sev: "success" });
      setConfirmTurn(null);
    } catch (err) {
      setToast({ open: true, msg: err.message || "No se pudo reservar.", sev: "error" });
    }
  };

  // ----- cancelar turno con reconstrucción externa -----
  const handleCancel = async (turno) => {
    try {
      const result = await runTransaction(db, async (tx) => {
        const ref = doc(db, "turnos", turno.id);

        // lecturas
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("El turno ya no existe.");
        const data = snap.data();

        const placeRef = doc(db, "places", data.placeId);
        const pSnap = await tx.get(placeRef);
        const pData = pSnap.exists() ? pSnap.data() : {};

        // cálculo
        const newReservations = (data.reservations || []).filter(r => r.uid !== user.uid);
        const newUids = (data.reservationUids || []).filter(uid => uid !== user.uid);
        const newAvail = (data.slotsAvailable ?? data.slots ?? 0) + 1;

        const isFlex = (data.mode === "flex");
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

        // escrituras
        tx.update(ref, {
          slotsAvailable: newAvail,
          reservationUids: newUids,
          reservations: newReservations,
          status: data.status === "completed" ? "completed" : "available"
        });

        if (needReconstruct) {
          const baseDate = data.date;
          const [hh, mm] = (data.time || "00:00").split(":").map(Number);
          const baseStartMs = new Date(`${baseDate}T${pad2(hh)}:${pad2(mm)}:00`).getTime();
          const dur = Number(data.durationMinutes || step);
          const extra = dur - step;
          const kMore = Math.ceil(extra / step);

          // encoger bloque principal
          tx.update(ref, { durationMinutes: step });

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

      if (result?.recreate) {
        const { placeId, placeName, baseDate, baseStartMs, step, kMore, mode } = result.recreate;

        for (let i = 1; i <= kMore; i++) {
          const start = new Date(baseStartMs + i * step * 60000);
          const hh2 = pad2(start.getHours());
          const mm2 = pad2(start.getMinutes());
          const timeStr = `${hh2}:${mm2}`;

          // evitar duplicados
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

  // ----- Reseñas -----
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const maxWords = 60;
  const wordsCount = reviewComment.trim().split(/\s+/).filter(Boolean).length;

  // Versión más permisiva: si tuvo cualquier turno pasado en el lugar (aunque no esté marcado completed) permite reseñar
  const canReviewForPlace = (placeId) => {
    const now = new Date();
    const hadAnyPast = (arr) =>
      arr.some(t => {
        if (t.placeId !== placeId || !t.date || !t.time) return false;
        const start = new Date(`${t.date}T${t.time}:00`);
        return start < now && t.status !== "canceled";
      });
    return hadAnyPast(myPastTurns) || hadAnyPast(myFutureTurns);
  };
  const hasReviewedPlace = (placeId) => {
  return reviews.some(r => r.userId === user.uid);
};


  const submitReview = async (placeId) => {
    const wc = wordsCount;
    if (reviewRating < 1 || reviewRating > 5) {
      setToast({ open: true, msg: "Elegí una calificación (1 a 5).", sev: "warning" });
      return;
    }
    if (wc === 0 || wc > maxWords) {
      setToast({ open: true, msg: `El comentario debe tener entre 1 y ${maxWords} palabras.`, sev: "warning" });
      return;
    }
    try {
      await addDoc(collection(db, "places", placeId, "reviews"), {
        userId: user.uid,
        userName: user.displayName || user.email || "Cliente",
        rating: Number(reviewRating),
        comment: reviewComment.trim(),
        wordsCount: wc,
        createdAt: serverTimestamp(),
      });
      setReviewRating(0);
      setReviewComment("");
      setToast({ open: true, msg: "¡Gracias por tu reseña!", sev: "success" });
    } catch (e) {
      setToast({ open: true, msg: "No se pudo enviar la reseña.", sev: "error" });
    }
  };

  const [reviews, setReviews] = useState([]);
  // cargar reseñas del lugar seleccionado
  useEffect(() => {
    if (!selectedPlace?.id) { setReviews([]); return; }
    const qR = query(collection(db, "places", selectedPlace.id, "reviews"));
    const unsub = onSnapshot(qR, (snap) => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selectedPlace?.id]);

  return (
    <Box sx={styles.container}>
      <Typography variant="h4">¡Hola {user?.displayName || user?.email}!</Typography>
      <Button variant="contained" sx={styles.logoutBtn} onClick={handleLogout}>
        Cerrar Sesión
      </Button>

      <Box sx={{ mt: 2, ...styles.whitePanel }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Reservar turnos" />
          <Tab label="Mis reservas" />
          <Tab label="Historial" />
        </Tabs>
      </Box>

      {/* === TAB 0: Reservar === */}
      {tab === 0 && (
        <Box sx={{ mt: 2, ...styles.whitePanel }}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField
                select label="Categoría" value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                SelectProps={{ native: true }} fullWidth
              >
                <option value="">Todas</option>
                {[...new Set(places.flatMap(p => p.categories || []))].map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                select label="Distancia" value={filterDistance}
                onChange={(e) => setFilterDistance(e.target.value)}
                SelectProps={{ native: true }} fullWidth
                helperText={userLocation ? "Filtrar por km desde tu ubicación" : "Agrega ubicación en tu perfil para filtrar por distancia"}
              >
                <option value="all">Todas</option>
                <option value="5">≦ 5 km</option>
                <option value="10">≦ 10 km</option>
                <option value="20">≦ 20 km</option>
                <option value="50">≦ 50 km</option>
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth variant="outlined" size="small" placeholder="Buscar lugar..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </Grid>
          </Grid>

          <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>Elegí un lugar</Typography>
          {filteredPlaces.length === 0 ? (
            <Typography color="text.secondary">No hay lugares con turnos publicados.</Typography>
          ) : (
            <Grid container spacing={2}>
              {filteredPlaces.map((p) => {
                const km = placeDistance(p);
                return (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={p.id}>
                    <Card
                      sx={{ ...styles.placeCard, ...(selectedPlace?.id === p.id ? styles.placeCardSelected : {}) }}
                      onClick={() => setSelectedPlace(p)}
                    >
                      {p.photoUrl && <CardMedia component="img" height="140" image={p.photoUrl} alt={p.name || "Lugar"} />}
                      <CardContent>
                        <Typography variant="h6">{p.name || "—"}</Typography>
                        {(p.categories || []).map((cat) => (
                          <Chip key={cat} label={cat} size="small" color="info" sx={{ mb: 0.5, mr: 0.5 }} />
                        ))}
                        {p.description && <Typography variant="body2" color="text.secondary">{p.description}</Typography>}
                        {userLocation && isFinite(km) && (
                          <Chip sx={{ mt: 1 }} size="small" label={`${km.toFixed(1)} km`} />
                        )}
                        <Chip
                          sx={{ mt: 1, ml: 1 }}
                          label={favorites.includes(p.id) ? "★ Favorito" : "☆ Agregar a favoritos"}
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
                          color={favorites.includes(p.id) ? "warning" : "default"}
                          size="small"
                        />
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}

          {selectedPlace && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6">{selectedPlace.name}</Typography>

              {/* Selector servicio / duración */}
              <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
                <TextField
                  select label="Servicio" value={selectedServiceId}
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
                    select label="Duración (opción)" value={selectedOptionId}
                    onChange={(e)=> setSelectedOptionId(e.target.value)} sx={{ minWidth: 220 }}
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
                startAccessor="start" endAccessor="end"
                defaultView={Views.WEEK} views={[Views.WEEK, Views.DAY, Views.MONTH]}
                style={{ height: 500, background: "#fff", color: "#000" }}
                onSelectEvent={onSelectEvent} eventPropGetter={eventPropGetter}
              />

              {/* Reseñas del lugar */}
              <Box sx={{ mt: 3 }}>
                <Typography variant="h6">Reseñas</Typography>
                <Divider sx={{ my: 1 }} />
                {reviews.length === 0 ? (
                  <Typography color="text.secondary">Sé el primero en reseñar este lugar.</Typography>
                ) : (
                  <Grid container spacing={2}>
                    {reviews.map(r => (
                      <Grid key={r.id} item xs={12} md={6}>
                        <Card variant="outlined">
                          <CardContent>
                            <Box sx={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <Typography sx={{ fontWeight: 600 }}>{r.userName || "Cliente"}</Typography>
                              <Rating readOnly value={Number(r.rating || 0)} />
                            </Box>
                            {r.comment && <Typography sx={{ mt: 1 }}>{r.comment}</Typography>}
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                )}

                {/* Form de reseña (si tuvo algún turno pasado en este lugar) */}
                {canReviewForPlace(selectedPlace.id) && !hasReviewedPlace(selectedPlace.id) && (
                  <Box sx={{ mt: 2, p: 2, border: "1px dashed #ccc", borderRadius: 2 }}>
                    <Typography variant="subtitle1">Dejar reseña</Typography>
                    <Box sx={{ display:"flex", alignItems:"center", gap:2, mt:1, flexWrap:"wrap" }}>
                      <Rating value={reviewRating} onChange={(_, v)=> setReviewRating(v || 0)} />
                      <TextField
                        placeholder={`Comentario (máx. ${maxWords} palabras)`}
                        value={reviewComment}
                        onChange={(e)=> setReviewComment(e.target.value)}
                        fullWidth
                      />
                      <Chip size="small" label={`${wordsCount}/${maxWords} palabras`} />
                      <Button variant="contained" onClick={()=> submitReview(selectedPlace.id)}>Enviar</Button>
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* === TAB 1: Mis reservas (futuras) === */}
      {tab === 1 && (
        <Box sx={{ mt: 2 }}>
          {loadingMyTurns ? (
            <Typography>Cargando tus turnos…</Typography>
          ) : myFutureTurns.length === 0 ? (
            <Typography>No tenés reservas futuras.</Typography>
          ) : (
            <Grid container spacing={2}>
              {myFutureTurns.map(t => {
                const p = placeById[t.placeId] || {};
                return (
                  <Grid item xs={12} sm={6} md={4} key={t.id}>
                    <Card sx={styles.placeCard}>
                      {p.photoUrl && <CardMedia component="img" height="140" image={p.photoUrl} alt={p.name || "Lugar"} />}
                      <CardContent>
                        <Typography variant="h6">{p.name || t.placeName || "—"}</Typography>
                        {(p.categories || []).map((cat) => (
                          <Chip key={cat} label={cat} size="small" color="info" sx={{ mb: 0.5, mr: 0.5 }} />
                        ))}
                        {p.description && <Typography variant="body2" color="text.secondary">{p.description}</Typography>}
                        <Divider sx={{ my: 1 }} />
                        <Typography>Fecha: {t.date}</Typography>
                        <Typography>Hora: {t.time}</Typography>
                        <Typography>Duración: {t.durationMinutes || 60} min</Typography>
                        <Button variant="contained" sx={styles.cancelBtn} onClick={() => handleCancel(t)}>
                          Cancelar turno
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      )}

      {/* === TAB 2: Historial (completados) === */}
      {tab === 2 && (
        <Box sx={{ mt: 2, ...styles.whitePanel }}>
          {myPastTurns.length === 0 ? (
            <Typography color="text.secondary">Sin historial por ahora.</Typography>
          ) : (
            <Grid container spacing={2}>
              {myPastTurns.map(t => {
                const p = placeById[t.placeId] || {};
                return (
                  <Grid item xs={12} sm={6} md={4} key={t.id}>
                    <Card sx={styles.placeCard}>
                      {p.photoUrl && <CardMedia component="img" height="140" image={p.photoUrl} alt={p.name || "Lugar"} />}
                      <CardContent>
                        <Typography variant="h6">{p.name || t.placeName || "—"}</Typography>
                        {(p.categories || []).map((cat) => (
                          <Chip key={cat} label={cat} size="small" color="info" sx={{ mb: 0.5, mr: 0.5 }} />
                        ))}
                        {p.description && <Typography variant="body2" color="text.secondary">{p.description}</Typography>}
                        <Divider sx={{ my: 1 }} />
                        <Typography>Fecha: {t.date}</Typography>
                        <Typography>Hora: {t.time}</Typography>
                        <Typography>Duración: {t.durationMinutes || 60} min</Typography>
                        <Chip size="small" color="success" label="Completado" sx={{ mt: 1 }} />
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      )}

      {/* Confirmación de reserva */}
      <Dialog open={!!confirmTurn} onClose={() => setConfirmTurn(null)}>
        <DialogTitle>Confirmar reserva</DialogTitle>
        <DialogContent>
          {confirmTurn && (
            <>
              <Typography>Lugar: {placeById[confirmTurn.placeId]?.name || confirmTurn.placeName}</Typography>
              <Typography>Fecha: {confirmTurn.date}</Typography>
              <Typography>Hora: {confirmTurn.time}</Typography>
              {schedulingMode === "fixed" ? (
                <>
                  <Typography sx={{ mt: 1, fontWeight: 600 }}>Turno fijo</Typography>
                  <Typography>Duración: {confirmTurn.durationMinutes || 60} min</Typography>
                  <TextField
                    select label="Servicio" value={selectedServiceId}
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
                    select label="Servicio" value={selectedServiceId}
                    onChange={(e)=>{ setSelectedServiceId(e.target.value); setSelectedOptionId(""); }}
                    sx={{ mt: 1, minWidth: 240 }}
                  >
                    <MenuItem value="">(Elegir)</MenuItem>
                    {(services || []).map(s => (
                      <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select label="Duración" value={selectedOptionId}
                    onChange={(e)=> setSelectedOptionId(e.target.value)}
                    sx={{ mt: 1, minWidth: 220 }} disabled={!selectedService}
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

      {/* Toast */}
      <Snackbar open={toast.open} autoHideDuration={3200} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.sev} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
}

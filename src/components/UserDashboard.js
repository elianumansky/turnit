import React, { useEffect, useMemo, useState } from "react";

import {
  collection, query, where, onSnapshot, doc, runTransaction,
  getDoc, updateDoc, addDoc, serverTimestamp, getDocs, deleteDoc, setDoc
} from "firebase/firestore";

import { auth, db } from "../firebase";

import {
  Typography, Card, CardContent, Button, Grid, Box, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Snackbar, Alert, Tabs, Tab, CardMedia, TextField, MenuItem,
  Rating, Divider, IconButton, Tooltip
} from "@mui/material";

import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import { signOut } from "firebase/auth";

import { useNavigate } from "react-router-dom";

import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";

import { format, parse, startOfWeek, getDay } from "date-fns";

import es from "date-fns/locale/es";

import "react-big-calendar/lib/css/react-big-calendar.css";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";

import L from "leaflet";

import "leaflet/dist/leaflet.css";

const locales = { es };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

const timeToDate = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00`);
const pad2 = (n) => String(n).padStart(2, "0");

// Haversine
const toRad = (v) => (v * Math.PI) / 180;
const distanceKm = (a, b) => {
  if (!a || !b) return Infinity;
  const R = 6371;
  const dLat = toRad((b.lat || 0) - (a.lat || 0));
  const dLon = toRad((b.lng || 0) - (a.lng || 0));
  const lat1 = toRad(a.lat || 0);
  const lat2 = toRad(b.lat || 0);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
};

// Leaflet icons
const defaultIcon = new L.Icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -28], shadowSize: [41, 41],
});

const selectedIcon = new L.Icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [30, 50], iconAnchor: [15, 50], popupAnchor: [1, -34], shadowSize: [50, 50],
});

function FlyTo({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) map.flyTo([lat, lng], 14, { duration: 0.5 });
  }, [lat, lng, map]);
  return null;
}
async function geocodeAddress(address) {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`,
      { headers: { "User-Agent": "TurnIt-App/1.0 (contacto@turnit.com)" } }
    );
    const data = await resp.json();
    if (!data || !data[0]) throw new Error("No se pudo geocodificar la dirección");
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (err) {
    console.error("Error al geocodificar:", err);
    return null;
  }
}

export default function UserDashboard({ user }) {
  const navigate = useNavigate();

  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDistance, setFilterDistance] = useState("all"); // all|5|10|20|50

  const [places, setPlaces] = useState([]);
  const [placeById, setPlaceById] = useState({});
  const [selectedPlace, setSelectedPlace] = useState(null);

  const [placeTurns, setPlaceTurns] = useState([]);
  const [myFutureTurns, setMyFutureTurns] = useState([]);
  const [myPastTurns, setMyPastTurns] = useState([]);
  const [loadingMyTurns, setLoadingMyTurns] = useState(true);

  const [favorites, setFavorites] = useState([]);
  const [confirmTurn, setConfirmTurn] = useState(null);
  const [profileAddress, setProfileAddress] = useState("");

  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState("");

  const [toast, setToast] = useState({ open: false, msg: "", sev: "success" });

  const [userLocation, setUserLocation] = useState(null); // {lat, lng}
  const [profileName, setProfileName] = useState(user?.displayName || ""); // editable name
  const [profileLat, setProfileLat] = useState(""); // editable lat
  const [profileLng, setProfileLng] = useState(""); // editable lng
  const [savingProfile, setSavingProfile] = useState(false);

  // Utils
  const safeAvg = (avg) => Math.max(0, Math.min(5, Number(avg || 0)));

  // Load user profile name/location
  useEffect(() => {
    (async () => {
      if (!user?.uid) return;
      try {
        const uref = doc(db, "users", user.uid);
        const usnap = await getDoc(uref);
        if (usnap.exists()) {
          const u = usnap.data();
          const loc = u.location || null;
          if (typeof u.name === "string") setProfileName(u.name);
          if (loc?.lat && loc?.lng) {
            setUserLocation(loc);
            setProfileLat(String(loc.lat));
            setProfileLng(String(loc.lng));
          } else if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const autoLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserLocation(autoLoc);
                setProfileLat(String(autoLoc.lat));
                setProfileLng(String(autoLoc.lng));
              },
              () => {},
              { enableHighAccuracy: true, timeout: 5000 }
            );
          }
        }
      } catch {}
    })();
  }, [user]);

  // Favoritos
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        setFavorites(snap.exists() ? (snap.data().favoritePlaces || []) : []);
      } catch {}
    })();
  }, [user]);

  // Lugares
  useEffect(() => {
    const qPlaces = query(collection(db, "places"));
    const unsub = onSnapshot(qPlaces, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPlaces(list);
      const map = {};
      for (const p of list) map[p.id] = p;
      setPlaceById(map);
      // robust default selected place (maintain prev if still exists)
      setSelectedPlace(prev => {
        if (prev && map[prev.id]) return prev;
        if (list.length === 0) return null;
        const withLoc = list.find(p => p?.location?.lat && p?.location?.lng);
        return withLoc || list[0];
      });
    });
    return () => unsub();
  }, []);

  // Reseñas: promedio robusto por lugar (per-place listeners)
  const [ratingsByPlace, setRatingsByPlace] = useState({}); // { [placeId]: {avg,count,myReviewExists:boolean} }
  useEffect(() => {
    // Clean up previous listeners
    let unsubs = [];
    // Attach a reviews listener for each place to compute avg locally
    (places || []).forEach((p) => {
      if (!p?.id) return;
      const qR = query(collection(db, "places", p.id, "reviews"));
      const unsub = onSnapshot(
        qR,
        (snap) => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          const ratings = docs
            .map(r => Number(r.rating))
            .filter(r => Number.isFinite(r) && r > 0 && r <= 5);
          const sum = ratings.reduce((a, b) => a + b, 0);
          const count = ratings.length;
          const avg = count ? sum / count : 0;
          const myExists = !!docs.find(d => d.id === user?.uid);
          setRatingsByPlace(prev => ({
            ...prev,
            [p.id]: {
              avg: Number.isFinite(avg) ? avg : 0,
              count,
              myReviewExists: myExists
            }
          }));
        },
        () => {
          // no-op
        }
      );
      unsubs.push(unsub);
    });
    return () => {
      unsubs.forEach(fn => fn && fn());
      unsubs = [];
    };
  }, [places, user?.uid]);

  // Reviews list for selected place (UI)
  const [reviews, setReviews] = useState([]);
  useEffect(() => {
    if (!selectedPlace?.id) { setReviews([]); return; }
    const qR = query(collection(db, "places", selectedPlace.id, "reviews"));
    const unsub = onSnapshot(qR, (snap) => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selectedPlace?.id]);

  // Turnos de lugar seleccionado
  useEffect(() => {
    if (!selectedPlace?.id) { setPlaceTurns([]); return; }
    const qT = query(collection(db, "turnos"), where("placeId", "==", selectedPlace.id));
    const unsub = onSnapshot(qT, async (snap) => {
      const now = new Date();
      const turns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

  // Mis turnos
  useEffect(() => {
    if (!user?.uid) return;
    setLoadingMyTurns(true);
    const qMine = query(collection(db, "turnos"), where("reservationUids", "array-contains", user.uid));
    const unsub = onSnapshot(qMine, async (snap) => {
      const now = new Date();
      const turns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

  // UI helpers
  const styles = {
    container: { p: 3, minHeight: "100vh", background: "linear-gradient(135deg,#4e54c8,#8f94fb)", color: "#fff" },
    whitePanel: { background: "#fff", borderRadius: 12, padding: 12, color: "#000" },
    placeCard: { cursor: "pointer", borderRadius: 10, border: "1px solid #eaeaea", height: "100%" },
    placeCardSelected: { boxShadow: "0 0 0 3px #4e54c8" },
    logoutBtn: { mt: 2, mb: 2, backgroundColor: "#ff4ed9", "&:hover": { backgroundColor: "#ff1ecb" } },
    cancelBtn: { mt: 1, backgroundColor: "#ff6cec", "&:hover": { backgroundColor: "#ff4ed9" } }
  };

  const placeDistance = (p) =>
    p?.location?.lat && p?.location?.lng && userLocation
      ? distanceKm(userLocation, p.location)
      : Infinity;

  // Filtros
  const filteredPlaces = (places || [])
    .filter(p =>
      (p.name || "—").toLowerCase().includes((search || "").toLowerCase()) &&
      (filterCategory ? (p.categories || []).includes(filterCategory) : true)
    )
    .filter(p => {
      if (filterDistance === "all" || !userLocation) return true;
      const km = Number.isFinite(placeDistance(p)) ? placeDistance(p) : Infinity;
      const limit = Number(filterDistance);
      return km <= limit + 0.0001;
    })
    .sort((a, b) => {
      if (!userLocation) return 0;
      return placeDistance(a) - placeDistance(b);
    });

  // Datos del lugar seleccionado
  const selectedPlaceDoc = selectedPlace ? placeById[selectedPlace.id] : null;
  const services = selectedPlaceDoc?.services || [];
  const schedulingMode = selectedPlaceDoc?.schedulingMode || (selectedPlaceDoc?.flexibleEnabled ? "flex" : "fixed");
  const selectedService = services.find(s => s.id === selectedServiceId) || null;
  const serviceOptions = selectedService ? (selectedService.options || []) : [];
  const selectedOption = serviceOptions.find(o => o.id === selectedOptionId) || null;
  const depositPercent = Number(selectedPlaceDoc?.depositPercent || 0);
  const selectedPrice = selectedOption ? Number(selectedOption.price || 0) : 0;
  const depositDue = Math.round(selectedPrice * (depositPercent / 100));

  // Favoritos
  const favoritePlaces = (places || []).filter(p => (favorites || []).includes(p.id));

  // Eventos calendario (evitar solapados en flex expandido)
  const calendarEvents = useMemo(() => {
    if (!selectedPlace) return [];
    const base = (placeTurns || []).map(t => {
      const start = timeToDate(t.date, t.time);
      const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
      const avail = Number(t.slotsAvailable ?? t.slots ?? 0);
      return { id: t.id, title: avail > 0 ? "Disponible" : "Ocupado", start, end, type: "turn", turn: t };
    });
    const extended = base.filter(e => e.turn.mode === "flex" && (e.turn.reservations || []).length > 0);
    return base.filter(e => !extended.some(x =>
      x.turn.date === e.turn.date && e.start >= x.start && e.start < x.end && e.id !== x.id
    ));
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
    try {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      const arr = snap.exists() ? (snap.data().favoritePlaces || []) : [];
      const updated = arr.includes(placeId) ? arr.filter(f => f !== placeId) : [...arr, placeId];
      await updateDoc(ref, { favoritePlaces: updated });
      setFavorites(updated);
    } catch {
      setToast({ open: true, msg: "No se pudo actualizar favoritos.", sev: "error" });
    }
  };

  // Reservar
  const [reserveBusyIds, setReserveBusyIds] = useState(new Set());

  const handleConfirmReserve = async () => {
    if (!confirmTurn || !user?.uid) return;
    if (reserveBusyIds.has(confirmTurn.id)) return;
    setReserveBusyIds(prev => new Set(prev).add(confirmTurn.id));
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
          if (reservations.some(r => r.uid === user.uid)) throw new Error("Ya tenés reserva en este turno.");

          const resUids = new Set([...(data.reservationUids || []), user.uid]);

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
  reservationUids: Array.from(resUids),
  reservations,
  placeName: data.placeName || selectedPlace?.name || "—", // 👈 restaurado
  status: "available"
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

        const [hh, mm] = (t0.time || "00:00").split(":").map(Number);
        const baseStart = new Date(`${t0.date}T${pad2(hh)}:${pad2(mm)}:00`);
        const blocksNeeded = Math.ceil(need / step);
        const neededTimes = Array.from({ length: blocksNeeded }, (_, i) => {
          const dt = new Date(baseStart.getTime() + i * step * 60000);
          return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
        });

        const qBlocks = query(collection(db, "turnos"), where("placeId", "==", t0.placeId), where("date", "==", t0.date));
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
          const firstRef = doc(db, "turnos", blockDocs[0].id);
          const sFirst = await tx.get(firstRef);
          if (!sFirst.exists()) throw new Error("Turno inexistente");
          const first = sFirst.data();
          const avail = Number(first.slotsAvailable ?? first.slots ?? 0);
          if (avail <= 0) throw new Error("El turno ya fue reservado.");

          const reservations = Array.isArray(first.reservations) ? [...first.reservations] : [];
          if (reservations.some(r => r.uid === user.uid)) throw new Error("Ya tenés reserva en este turno.");

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
  slotsAvailable: avail - 1,
  reservationUids: [...(first.reservationUids || []), user.uid],
  reservations,
  placeName: first.placeName || selectedPlace?.name || "—", // 👈 restaurado
  mode: "flex",
  status: "available"
});
        });
      }

      setToast({ open: true, msg: "Turno reservado con éxito ✅", sev: "success" });
      setConfirmTurn(null);
    } catch (err) {
      setToast({ open: true, msg: err.message || "No se pudo reservar.", sev: "error" });
    } finally {
      setReserveBusyIds(prev => {
        const n = new Set(prev);
        n.delete(confirmTurn?.id);
        return n;
      });
    }
  };

  // Cancelar turno
  const handleCancel = async (turno) => {
    try {
      const result = await runTransaction(db, async (tx) => {
        const ref = doc(db, "turnos", turno.id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("El turno ya no existe.");
        const data = snap.data();

        const placeRef = doc(db, "places", data.placeId);
        const pSnap = await tx.get(placeRef);
        const pData = pSnap.exists() ? pSnap.data() : {};

        const newReservations = (data.reservations || []).filter(r => r.uid !== user.uid);
        const newUids = (data.reservationUids || []).filter(uid => uid !== user.uid);
        const newAvail = (data.slotsAvailable ?? data.slots ?? 0) + 1;

        const isFlex = (data.mode === "flex");
        const allOpts = (pData.services || []).flatMap(s => s.options || []);
        const step = Math.max(
          5,
          Math.min(...allOpts.map(o => Number(o.durationMinutes || 0)).filter(n => n > 0)) || Number(data.durationMinutes || 30)
        );

        const needReconstruct =
          isFlex &&
          newReservations.length === 0 &&
          Number(data.durationMinutes || step) > step;

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

          const clashQ = query(collection(db, "turnos"), where("placeId", "==", placeId), where("date", "==", baseDate), where("time", "==", timeStr));
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

  // Reseñas
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const maxWords = 60;
  const wordsCount = (reviewComment || "").trim().split(/\s+/).filter(Boolean).length;
  const hasMyReview = (placeId) => !!ratingsByPlace[placeId]?.myReviewExists;
  const canReviewForPlace = (placeId) => myPastTurns.some(t => t.placeId === placeId) && !hasMyReview(placeId);

  const submitReview = async (placeId) => {
    if (!user?.uid) {
      setToast({ open: true, msg: "No hay usuario válido para guardar reseña.", sev: "error" });
      return;
    }
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
      await setDoc(doc(db, "places", placeId, "reviews", user.uid), {
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

  const deleteMyReview = async (placeId) => {
    try {
      if (!user?.uid) throw new Error("Usuario inválido.");
      await deleteDoc(doc(db, "places", placeId, "reviews", user.uid));
      setToast({ open: true, msg: "Reseña eliminada.", sev: "success" });
    } catch {
      setToast({ open: true, msg: "No se pudo eliminar la reseña.", sev: "error" });
    }
  };

  // Guardar perfil (nombre y ubicación)
  const saveProfile = async () => {
  if (!user?.uid) {
    setToast({ open: true, msg: "No hay usuario válido.", sev: "error" });
    return;
  }
  setSavingProfile(true);
  try {
    let coords = userLocation;
    if (profileAddress.trim()) {
      coords = await geocodeAddress(profileAddress.trim());
    }
    const uref = doc(db, "users", user.uid);
    await setDoc(uref, {
      name: (profileName || "").trim(),
      location: coords,
      updatedAt: serverTimestamp()
    }, { merge: true });
    setUserLocation(coords);
    setToast({ open: true, msg: "Perfil actualizado ✅", sev: "success" });
  } catch (e) {
    console.error("Error al guardar perfil:", e);
    setToast({ open: true, msg: "No se pudo actualizar el perfil.", sev: "error" });
  } finally {
    setSavingProfile(false);
  }
};

  const fillLocationFromGPS = async () => {
    if (!("geolocation" in navigator)) {
      setToast({ open: true, msg: "GPS no disponible en el navegador.", sev: "warning" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setProfileLat(String(lat));
        setProfileLng(String(lng));
        setUserLocation({ lat, lng });
        setToast({ open: true, msg: "Ubicación detectada por GPS.", sev: "info" });
      },
      () => {
        setToast({ open: true, msg: "No se pudo obtener ubicación.", sev: "error" });
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  // Render
  return (
    <Box sx={styles.container}>
      <Typography variant="h4">¡Hola {user?.displayName || user?.email}!</Typography>

      <Button
        variant="contained"
        sx={styles.logoutBtn}
        onClick={async () => { try { await signOut(auth); } catch {} navigate("/"); }}
      >
        Cerrar Sesión
      </Button>

      <Box sx={{ mt: 2, ...styles.whitePanel }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Reservar turnos" />
          <Tab label="Mis reservas" />
          <Tab label="Historial" />
          <Tab label="Favoritos" />
          <Tab label="Perfil" />
        </Tabs>
      </Box>

      {/* TAB 0: Reservar */}
      {tab === 0 && (
        <Box sx={{ mt: 2, ...styles.whitePanel }}>
          {/* Filtros */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField
                select
                label="Categoría"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                SelectProps={{ displayEmpty: true }}
                fullWidth
                size="small"
                variant="outlined"
              >
                <MenuItem value=""><em>Todas</em></MenuItem>
                {[...new Set((places || []).flatMap(p => p.categories || []))].map(cat => (
                  <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} md={3}>
              <TextField
                select
                label="Distancia"
                value={filterDistance}
                onChange={(e) => setFilterDistance(e.target.value)}
                SelectProps={{ displayEmpty: true }}
                fullWidth
                size="small"
                variant="outlined"
                helperText={userLocation ? "Filtrar por km desde tu ubicación" : "Agrega ubicación en tu perfil o habilita GPS"}
              >
                <MenuItem value="all">Todas</MenuItem>
                <MenuItem value="5">≦ 5 km</MenuItem>
                <MenuItem value="10">≦ 10 km</MenuItem>
                <MenuItem value="20">≦ 20 km</MenuItem>
                <MenuItem value="50">≦ 50 km</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                variant="outlined"
                size="small"
                placeholder="Buscar lugar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Grid>
          </Grid>

          {/* Mapa + Lista */}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <Box sx={{ height: 420, borderRadius: 2, overflow: "hidden", border: "1px solid #eee" }}>
                <MapContainer
                  center={
                    selectedPlace?.location?.lat
                      ? [selectedPlace.location.lat, selectedPlace.location.lng]
                      : [-34.6037, -58.3816]
                  }
                  zoom={selectedPlace?.location?.lat ? 13 : 11}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; OpenStreetMap'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {selectedPlace?.location?.lat && (
                    <FlyTo lat={selectedPlace.location.lat} lng={selectedPlace.location.lng} />
                  )}
                  {(filteredPlaces || [])
                    .filter(p => p?.location?.lat && p?.location?.lng)
                    .map(p => {
                      const isSel = selectedPlace?.id === p.id;
                      const ratingData = ratingsByPlace[p.id] || { avg: 0, count: 0 };
                      return (
                        <Marker
                          key={p.id}
                          position={[p.location.lat, p.location.lng]}
                          icon={isSel ? selectedIcon : defaultIcon}
                          eventHandlers={{ click: () => setSelectedPlace(p) }}
                        >
                          <Popup>
                            <div style={{ minWidth: 180 }}>
                              <strong>{p.name || "—"}</strong>
                              <div style={{ marginTop: 4 }}>
                                <Rating size="small" readOnly value={safeAvg(ratingData.avg)} precision={0.1} />
                                <small> ({ratingData.count || 0})</small>
                              </div>
                              {userLocation && Number.isFinite(placeDistance(p)) && (
                                <div style={{ marginTop: 6 }}>
                                  <small>{placeDistance(p).toFixed(1)} km</small>
                                </div>
                              )}
                              <Button size="small" sx={{ mt: 1 }} variant="contained" onClick={() => setSelectedPlace(p)}>
                                Ver turnos
                              </Button>
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })}
                </MapContainer>
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Elegí un lugar</Typography>
              {(filteredPlaces || []).length === 0 ? (
                <Typography color="text.secondary">No hay lugares.</Typography>
              ) : (
                <Grid container spacing={2}>
                  {(filteredPlaces || []).map((p) => {
                    const km = placeDistance(p);
                    const ratingData = ratingsByPlace[p.id] || { avg: 0, count: 0 };
                    return (
                      <Grid item xs={12} sm={6} md={4} key={p.id}>
                        <Card
                          sx={{ ...styles.placeCard, ...(selectedPlace?.id === p.id ? styles.placeCardSelected : {}) }}
                          onClick={() => setSelectedPlace(p)}
                        >
                          {p.photoUrl && <CardMedia component="img" height="140" image={p.photoUrl} alt={p.name || "Lugar"} />}
                          <CardContent>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 1 }}>
                              <Typography variant="h6">{p.name || "—"}</Typography>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Rating readOnly size="small" value={safeAvg(ratingData.avg)} precision={0.1} />
                                <Typography variant="body2" color="text.secondary">({ratingData.count || 0})</Typography>
                              </Box>
                            </Box>
                            {(p.categories || []).map((cat) => (
                              <Chip key={cat} label={cat} size="small" color="info" sx={{ mr: 0.5, mt: 0.5 }} />
                            ))}
                            {p.description && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                {p.description}
                              </Typography>
                            )}
                            {userLocation && Number.isFinite(km) && (
                              <Chip sx={{ mt: 1 }} size="small" label={`${km.toFixed(1)} km`} />
                            )}
                            <Chip
                              sx={{ mt: 1 }}
                              label={(favorites || []).includes(p.id) ? "★ Favorito" : "☆ Agregar a favoritos"}
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
                              color={(favorites || []).includes(p.id) ? "warning" : "default"}
                              size="small"
                            />
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              )}
            </Grid>
          </Grid>

          {/* Calendario + Reseñas */}
          {selectedPlace && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6">{selectedPlace.name}</Typography>

              <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
                <TextField
                  select
                  label="Servicio"
                  value={selectedServiceId}
                  onChange={(e) => { setSelectedServiceId(e.target.value); setSelectedOptionId(""); }}
                  sx={{ minWidth: 240 }}
                >
                  <MenuItem value="">(Sin servicio)</MenuItem>
                  {(services || []).map(s => (
                    <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                  ))}
                </TextField>

                {schedulingMode === "flex" && (
                  <TextField
                    select
                    label="Duración (opción)"
                    value={selectedOptionId}
                    onChange={(e) => setSelectedOptionId(e.target.value)}
                    sx={{ minWidth: 220 }}
                    disabled={!selectedService}
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

              <Box sx={{ mt: 3 }}>
                <Typography variant="h6">Reseñas</Typography>
                <Divider sx={{ my: 1 }} />
                {(reviews || []).length === 0 ? (
                  <Typography color="text.secondary">Sé el primero en reseñar este lugar.</Typography>
                ) : (
                  <Grid container spacing={2}>
                    {(reviews || []).map(r => (
                      <Grid key={r.id} item xs={12} md={6}>
                        <Card variant="outlined">
                          <CardContent>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <Typography sx={{ fontWeight: 600 }}>{r.userName || "Cliente"}</Typography>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Rating readOnly value={Math.max(0, Math.min(5, Number(r.rating || 0)))} />
                                {user?.uid && r.id === user.uid && (
                                  <Tooltip title="Eliminar mi reseña">
                                    <IconButton color="error" size="small" onClick={() => deleteMyReview(selectedPlace.id)}>
                                      <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            </Box>
                            {r.comment && <Typography sx={{ mt: 1 }}>{r.comment}</Typography>}
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                )}

                {canReviewForPlace(selectedPlace.id) && (
                  <Box sx={{ mt: 2, p: 2, border: "1px dashed #ccc", borderRadius: 2 }}>
                    <Typography variant="subtitle1">Dejar reseña</Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1, flexWrap: "wrap" }}>
                      <Rating value={reviewRating} onChange={(_, v) => setReviewRating(v || 0)} />
                      <TextField
                        placeholder={`Comentario (máx. ${maxWords} palabras)`}
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        fullWidth
                      />
                      <Chip size="small" label={`${wordsCount}/${maxWords} palabras`} />
                      <Button variant="contained" onClick={() => submitReview(selectedPlace.id)}>Enviar</Button>
                    </Box>
                  </Box>
                )}

                {hasMyReview(selectedPlace.id) && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Ya escribiste una reseña. Podés eliminarla para escribir otra.
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* TAB 1: Mis reservas */}
      {tab === 1 && (
        <Box sx={{ mt: 2 }}>
          {loadingMyTurns ? (
            <Typography>Cargando tus turnos…</Typography>
          ) : (myFutureTurns || []).length === 0 ? (
            <Typography>No tenés reservas futuras.</Typography>
          ) : (
            <Grid container spacing={2}>
              {(myFutureTurns || []).map(t => {
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

      {/* TAB 2: Historial */}
      {tab === 2 && (
        <Box sx={{ mt: 2, ...styles.whitePanel }}>
          {(myPastTurns || []).length === 0 ? (
            <Typography color="text.secondary">Sin historial por ahora.</Typography>
          ) : (
            <Grid container spacing={2}>
              {(myPastTurns || []).map(t => {
                const p = placeById[t.placeId] || {};
                const ratingData = ratingsByPlace[p.id] || { avg: 0, count: 0 };
                return (
                  <Grid item xs={12} sm={6} md={4} key={t.id}>
                    <Card sx={styles.placeCard}>
                      {p.photoUrl && <CardMedia component="img" height="140" image={p.photoUrl} alt={p.name || "Lugar"} />}
                      <CardContent>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 1 }}>
                          <Typography variant="h6">{p.name || t.placeName || "—"}</Typography>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Rating readOnly size="small" value={safeAvg(ratingData.avg)} precision={0.1} />
                            <Typography variant="body2" color="text.secondary">({ratingData.count || 0})</Typography>
                          </Box>
                        </Box>
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

      {/* TAB 3: Favoritos */}
      {tab === 3 && (
        <Box sx={{ mt: 2, ...styles.whitePanel }}>
          <Typography variant="h6">Tus lugares favoritos</Typography>
          {(favoritePlaces || []).length === 0 ? (
            <Typography color="text.secondary" sx={{ mt: 1 }}>No tenés lugares favoritos aún.</Typography>
          ) : (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              {(favoritePlaces || []).map((p) => {
                const ratingData = ratingsByPlace[p.id] || { avg: 0, count: 0 };
                const km = placeDistance(p);
                return (
                  <Grid item xs={12} sm={6} md={4} key={p.id}>
                    <Card sx={styles.placeCard} onClick={() => setSelectedPlace(p)}>
                      {p.photoUrl && <CardMedia component="img" height="140" image={p.photoUrl} alt={p.name || "Lugar"} />}
                      <CardContent>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 1 }}>
                          <Typography variant="h6">{p.name || "—"}</Typography>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Rating readOnly size="small" value={safeAvg(ratingData.avg)} precision={0.1} />
                            <Typography variant="body2" color="text.secondary">({ratingData.count || 0})</Typography>
                          </Box>
                        </Box>
                        {(p.categories || []).map((cat) => (
                          <Chip key={cat} label={cat} size="small" color="info" sx={{ mb: 0.5, mr: 0.5 }} />
                        ))}
                        {p.description && <Typography variant="body2" color="text.secondary">{p.description}</Typography>}
                        {userLocation && Number.isFinite(km) && (
                          <Chip sx={{ mt: 1 }} size="small" label={`${km.toFixed(1)} km`} />
                        )}
                        <Chip
                          sx={{ mt: 1, ml: 1 }}
                          label={(favorites || []).includes(p.id) ? "★ Favorito" : "☆ Agregar a favoritos"}
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
                          color={(favorites || []).includes(p.id) ? "warning" : "default"}
                          size="small"
                        />
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      )}

      {/* TAB 4: Perfil */}
{tab === 4 && (
  <Box sx={{ mt: 2, ...styles.whitePanel }}>
    <Typography variant="h6">Editar perfil</Typography>
    <Grid container spacing={2} sx={{ mt: 1 }}>
      <Grid item xs={12} md={6}>
        <TextField
          label="Nombre"
          fullWidth
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          placeholder="Tu nombre"
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          label="Dirección"
          fullWidth
          value={profileAddress}
          onChange={(e) => setProfileAddress(e.target.value)}
          placeholder="Ej: Av. Corrientes 1234, Buenos Aires"
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <Button variant="outlined" onClick={fillLocationFromGPS}>
          Usar ubicación actual (GPS)
        </Button>
      </Grid>
      <Grid item xs={12} md={6} sx={{ textAlign: { xs: "left", md: "right" } }}>
        <Button variant="contained" onClick={saveProfile} disabled={savingProfile}>
          {savingProfile ? "Guardando..." : "Guardar perfil"}
        </Button>
      </Grid>
    </Grid>
    <Divider sx={{ my: 2 }} />
    <Typography variant="body2" color="text.secondary">
      Tu perfil se guarda en Firestore bajo users/{user?.uid}. Ahora podés escribir tu dirección y se convertirá automáticamente en coordenadas.
    </Typography>
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

              {(confirmTurn.mode || schedulingMode) === "fixed" ? (
                <>
                  <Typography sx={{ mt: 1, fontWeight: 600 }}>Turno fijo</Typography>
                  <Typography>Duración: {confirmTurn.durationMinutes || 60} min</Typography>
                  <TextField
                    select label="Servicio" value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
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
                    onChange={(e) => { setSelectedServiceId(e.target.value); setSelectedOptionId(""); }}
                    sx={{ mt: 1, minWidth: 240 }}
                  >
                    <MenuItem value="">(Elegir)</MenuItem>
                    {(services || []).map(s => (
                      <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select label="Duración" value={selectedOptionId}
                    onChange={(e) => setSelectedOptionId(e.target.value)}
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
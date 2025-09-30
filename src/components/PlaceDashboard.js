// PlaceDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection, query, where, onSnapshot, doc, getDocs, getDoc,
  updateDoc, addDoc, serverTimestamp, deleteDoc, runTransaction
} from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  Box, Typography, Button, Grid, Card, CardContent, Divider, TextField,
  Snackbar, Alert, Tabs, Tab, MenuItem, RadioGroup, FormControlLabel, Radio,
  Stack, Dialog, DialogTitle, DialogContent, DialogActions, Chip
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";

// Calendario
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, addMinutes, isSameDay } from "date-fns";
import es from "date-fns/locale/es";
import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = { es };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

// helpers
const pad2 = (n) => String(n).padStart(2, "0");
const yyyymmdd = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const timeToDate = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00`);
const nowMs = () => new Date().getTime();
const getDurationMin = (t) => Number(t?.durationMinutes || 60);

export default function PlaceDashboard({ user }) {
  const navigate = useNavigate();

  // place
  const [placeId, setPlaceId] = useState(null);
  const [place, setPlace] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);


  // datos
  const [turns, setTurns] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // notifs
  const [toast, setToast] = useState({ open: false, sev: "success", msg: "" });

  // panel inferior
  const [adminTab, setAdminTab] = useState(0);

  // diálogo (ver turno + reserva manual)
  const [dialogTurn, setDialogTurn] = useState(null);
  const [manualName, setManualName] = useState("");
  const [manualServiceId, setManualServiceId] = useState("");
  const [manualOptionId, setManualOptionId] = useState(""); // flex: duración+precio

  // ===== CARGA DE LUGAR (solo dueño) =====
  useEffect(() => {
    const fetchPlace = async () => {
      if (!user?.uid) return;
      try {
        const qOwner = query(collection(db, "places"), where("ownerId", "==", user.uid));
        const sOwner = await getDocs(qOwner);
        if (sOwner.empty) {
          setToast({ open: true, sev: "error", msg: "No se encontró un lugar asociado a tu cuenta." });
          return;
        }
        const d = sOwner.docs[0];
        setPlaceId(d.id);
        setPlace({ id: d.id, ...d.data() });
      } catch {
        setToast({ open: true, sev: "error", msg: "Error cargando tu lugar." });
      }
    };
    fetchPlace();
  }, [user]);

  // Suscripción a place (para ver cambios en vivo)
  useEffect(() => {
    if (!placeId) return;
    const pref = doc(db, "places", placeId);
    const unsub = onSnapshot(pref, (snap) => {
      if (snap.exists()) setPlace({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [placeId]);

  // Turnos del lugar
  useEffect(() => {
    if (!placeId) return;
    const qT = query(collection(db, "turnos"), where("placeId", "==", placeId));
    const unsubT = onSnapshot(qT, (snap) => setTurns(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubT(); };
  }, [placeId]);

  // Expirar turnos
  useEffect(() => {
    if (!turns.length) return;
    const now = nowMs();
    turns.forEach(async (t) => {
      try {
        if (!t?.date || !t?.time) return;
        const start = timeToDate(t.date, t.time).getTime();
        const end = start + getDurationMin(t) * 60_000;
        if (end < now && t.status !== "expired") {
          await updateDoc(doc(db, "turnos", t.id), { status: "expired" });
        }
      } catch { /* noop */ }
    });
  }, [turns]);

  // ===== Calendario / Agenda =====
  const events = useMemo(() => {
    if (!placeId) return [];
    const out = [];
    for (const t of turns) {
      if (t?.status === "expired") continue;
      if (!t?.date || !t?.time) continue;
      const start = timeToDate(t.date, t.time);
      const end = addMinutes(start, getDurationMin(t));
      const avail = Number(t.slotsAvailable ?? t.slots ?? 0);
      out.push({
        id: t.id,
        title: avail > 0 ? "Disponible" : "Ocupado",
        start, end, type: "turn", turn: t
      });
    }
    return out;
  }, [turns, placeId]);
  const handleSelectEvent = (event) => {
  setSelectedEvent(event);
};


  const eventPropGetter = (event) => {
    const t = event.turn;
    const avail = Number(t?.slotsAvailable ?? t?.slots ?? 0);
    const full = avail <= 0;
    return {
      style: {
        backgroundColor: full ? "#e53935" : "#43a047",
        color: "#fff",
        borderRadius: 8,
        border: 0,
        padding: "2px 6px",
      }
    };
  };
  // ===== Cancelar reserva =====
const handleCancelReservation = async (turnId, reservationUid) => {
  try {
    const ref = doc(db, "turnos", turnId);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Turno inexistente");
      const t = snap.data();

      // Filtrar la reserva específica
      const reservations = (t.reservations || []).filter(r => r.uid !== reservationUid);

      // Slots disponibles: sumamos 1 al cancelar
      const slotsAvailable = Number(t.slotsAvailable ?? t.slots ?? 1) + 1;

      tx.update(ref, {
        reservations,
        slotsAvailable
      });
    });

    setToast({ open: true, sev: "success", msg: "Reserva cancelada." });
  } catch (e) {
    setToast({ open: true, sev: "error", msg: e.message || "No se pudo cancelar la reserva." });
  }
};



  const dayAgenda = useMemo(() => {
    const day = selectedDate;
    return turns
      .filter(t => t?.status !== "expired")
      .filter(t => t?.date && isSameDay(timeToDate(t.date, "00:00"), day))
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }, [turns, selectedDate]);

  // ===== UI STATE para generar disponibilidad =====
  const [schedulingMode, setSchedulingMode] = useState("fixed"); // "fixed" | "flex"
  const [depositPercent, setDepositPercent] = useState(0);

  // Rango común
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("20:00");

  // FIXED
  const [fixedSlotDuration, setFixedSlotDuration] = useState(60); // minutos
  const [fixedSlots, setFixedSlots] = useState(1);
  const [fixedServiceId, setFixedServiceId] = useState("");

  // FLEX: servicios con opciones
  const [services, setServices] = useState([]); // [{id,name,options:[{id,durationMinutes,price}], _newDur,_newPrice}]
  const [newServiceName, setNewServiceName] = useState("");

  // Cargar valores iniciales de place -> state
  useEffect(() => {
    if (!place) return;
    setSchedulingMode(place.schedulingMode || (place.flexibleEnabled ? "flex" : "fixed"));
    setServices(place.services || []);
    setDepositPercent(Number(place.depositPercent || 0));
  }, [place?.id]); // eslint-disable-line

  // ===== Helpers generales =====
  const styles = {
    container: { p: 3, minHeight: "100vh", background: "linear-gradient(135deg, #4e54c8, #8f94fb)", color: "#fff" },
    headerBar: { display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 },
    panel: { background: "#fff", color: "#000", borderRadius: 12, padding: 12 },
    agendaCard: { borderRadius: 10, background: "#f7f7ff" }
  };

  const savePlaceConfig = async (patch) => {
    if (!placeId) return;
    await updateDoc(doc(db, "places", placeId), patch);
    setToast({ open: true, sev: "success", msg: "Configuración guardada." });
  };

  // ====== GENERACIÓN DE DISPONIBILIDAD ======
  const ymd = (d) => yyyymmdd(d);
  const loopDates = async (cb) => {
    if (!fromDate || !toDate) return 0;
    const startDate = new Date(`${fromDate}T00:00:00`);
    const endDate = new Date(`${toDate}T00:00:00`);
    let created = 0;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      let cur = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh, sm, 0);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh, em, 0);
      created += await cb(d, cur, end);
    }
    return created;
  };

  // ---- FIXED ----
  const generateFixed = async () => {
    if (!placeId || !fromDate || !toDate || !fixedSlotDuration) return;
    const created = await loopDates(async (_d, cur, end) => {
      let c = 0;
      while (cur < end) {
        const date = ymd(cur);
        const time = `${pad2(cur.getHours())}:${pad2(cur.getMinutes())}`;

        const existsQ = query(collection(db, "turnos"), where("placeId", "==", placeId), where("date", "==", date), where("time", "==", time));
        const existsSnap = await getDocs(existsQ);
        if (existsSnap.empty) {
          await addDoc(collection(db, "turnos"), {
            userId: user.uid,
            userName: user.displayName || user.email || "Usuario",
            placeId,
            placeName: place?.name || "",
            date,
            time,
            dateTime: new Date(`${date}T${time}:00`).toISOString(),
            serviceId: fixedServiceId || null,
            serviceName: (place?.services || []).find(s => s.id === fixedServiceId)?.name || null,
            durationMinutes: Number(fixedSlotDuration),
            slots: Number(fixedSlots || 1),
            slotsAvailable: Number(fixedSlots || 1),
            reservations: [],
            reservationUids: [],
            status: "available",
            createdAt: serverTimestamp(),
            mode: "fixed",
          });
          c++;
        }
        cur = new Date(cur.getTime() + Number(fixedSlotDuration) * 60000);
      }
      return c;
    });
    await savePlaceConfig({ schedulingMode: "fixed", flexibleEnabled: false });
    setToast({ open: true, sev: "success", msg: `Turnos fijos creados: ${created}` });
  };

  // ---- FLEX ----
  const minOptionDuration = useMemo(() => {
    const all = (services || []).flatMap(s => s.options || []);
    if (!all.length) return 30;
    return Math.max(5, Math.min(...all.map(o => Number(o.durationMinutes || 0)).filter(n => n > 0)));
  }, [services]);

  const generateFlex = async () => {
    if (!placeId || !fromDate || !toDate) {
      setToast({ open:true, sev:"warning", msg:"Completá rango y opciones." });
      return;
    }
    if (!services?.length || !services.some(s => (s.options||[]).length > 0)) {
      setToast({ open:true, sev:"warning", msg:"Definí al menos un servicio con opciones." });
      return;
    }

    const step = Number(minOptionDuration || 30);
    const created = await loopDates(async (_d, cur, end) => {
      let c = 0;
      while (cur < end) {
        const date = ymd(cur);
        const time = `${pad2(cur.getHours())}:${pad2(cur.getMinutes())}`;

        const existsQ = query(collection(db, "turnos"), where("placeId", "==", placeId), where("date", "==", date), where("time", "==", time));
        const existsSnap = await getDocs(existsQ);
        if (existsSnap.empty) {
          await addDoc(collection(db, "turnos"), {
            userId: user.uid,
            userName: user.displayName || user.email || "Usuario",
            placeId,
            placeName: place?.name || "",
            date,
            time,
            dateTime: new Date(`${date}T${time}:00`).toISOString(),
            durationMinutes: step, // granularidad mínima
            slots: 1,
            slotsAvailable: 1,
            reservations: [],
            reservationUids: [],
            status: "available",
            createdAt: serverTimestamp(),
            mode: "flex",
          });
          c++;
        }
        cur = new Date(cur.getTime() + step * 60000);
      }
      return c;
    });

    await savePlaceConfig({
      schedulingMode: "flex",
      flexibleEnabled: true,
      depositPercent: Number(depositPercent || 0),
      services
    });
    setToast({ open: true, sev: "success", msg: `Turnos flexibles creados: ${created}` });
  };

  // ====== CRUD de servicios/opciones (modo flex) =========
  const addService = () => {
    if (!newServiceName.trim()) return;
    const id = `svc_${Math.random().toString(36).slice(2,10)}`;
    setServices(prev => [...prev, { id, name: newServiceName.trim(), options: [] }]);
    setNewServiceName("");
  };
  const removeService = (id) => setServices(prev => prev.filter(s => s.id !== id));
  const addOptionToService = (idx, dur, price) => {
    if (!dur || !price) return;
    const opt = { id: `opt_${Math.random().toString(36).slice(2,10)}`, durationMinutes: Number(dur), price: Number(price) };
    setServices(prev => prev.map((s,i)=> i===idx ? {...s, options: [...(s.options||[]), opt], _newDur:"", _newPrice:""} : s));
  };
  const removeOptionFromService = (idx, optId) => {
    setServices(prev => prev.map((s,i)=> i===idx ? {...s, options: (s.options||[]).filter(o=>o.id!==optId)} : s));
  };
  const saveFlexConfig = async () => {
    await savePlaceConfig({ schedulingMode: "flex", flexibleEnabled: true, services, depositPercent: Number(depositPercent || 0) });
  };
  const saveFixedConfig = async () => {
    await savePlaceConfig({ schedulingMode: "fixed", flexibleEnabled: false });
  };

  // ====== Borrar turnos ======
  const [delFrom, setDelFrom] = useState("");
  const [delTo, setDelTo] = useState("");
  const deleteAllTurns = async () => {
    if (!placeId) return;
    if (!window.confirm("¿Borrar TODOS los turnos de este lugar?")) return;
    const qAll = query(collection(db, "turnos"), where("placeId", "==", placeId));
    const snap = await getDocs(qAll);
    let deleted = 0;
    for (const d of snap.docs) {
      await deleteDoc(doc(db, "turnos", d.id));
      deleted++;
    }
    setToast({ open: true, sev: "success", msg: `Turnos borrados: ${deleted}` });
  };
  const deleteTurnsByPeriod = async () => {
    if (!placeId) return;
    if (!delFrom || !delTo) { setToast({ open:true, sev:"warning", msg:"Elegí rango de fechas."}); return; }
    const qAll = query(collection(db, "turnos"), where("placeId", "==", placeId));
    const snap = await getDocs(qAll);
    let deleted = 0;
    for (const d of snap.docs) {
      const t = d.data();
      if (t?.date && t.date >= delFrom && t.date <= delTo) {
        await deleteDoc(doc(db, "turnos", d.id));
        deleted++;
      }
    }
    setToast({ open: true, sev: "success", msg: `Turnos borrados en rango: ${deleted}` });
  };

  // ====== Reserva manual en diálogo ======
  const openTurnDialog = (turn) => {
    setDialogTurn(turn);
    setManualName("");
    setManualServiceId("");
    setManualOptionId("");
  };

  const manualService = useMemo(
    () => (place?.services || []).find(s => s.id === manualServiceId) || null,
    [manualServiceId, place?.services]
  );
  const manualOptions = manualService ? (manualService.options || []) : [];

  const handleAddManualReservation = async () => {
    try {
      if (!dialogTurn) return;
      const name = manualName.trim();
      if (!name) {
        setToast({ open: true, sev: "warning", msg: "Ingresá un nombre." });
        return;
      }

      await runTransaction(db, async (tx) => {
        const ref = doc(db, "turnos", dialogTurn.id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Turno inexistente");
        const t = snap.data();

        const placeRef = doc(db, "places", t.placeId);
        const pSnap = await tx.get(placeRef);
        const pData = pSnap.exists() ? pSnap.data() : {};
        const schedulingModeTx = pData.schedulingMode || (pData.flexibleEnabled ? "flex" : "fixed");
        const depositPercentTx = Number(pData.depositPercent || 0);

        const avail = Number(t.slotsAvailable ?? t.slots ?? 0);
        if (avail <= 0) throw new Error("No hay cupos disponibles");

        // Hora/fecha base del bloque actual
        const baseDate = t.date;
        const [hh, mm] = (t.time || "00:00").split(":").map(Number);
        const baseStart = new Date(`${baseDate}T${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:00`);
        const baseDur = Number(t.durationMinutes || 60);

        let serviceId = manualServiceId || t.serviceId || null;
        let serviceName = (place?.services || []).find(s=>s.id===manualServiceId)?.name || t.serviceName || null;
        let need = baseDur;       // minutos a reservar
        let price = 0;

        if (schedulingModeTx === "flex") {
          // Requiere servicio/opción
          if (!manualServiceId || !manualOptionId) {
            throw new Error("Elegí servicio y duración.");
          }
          const svc = (pData.services || []).find(s => s.id === manualServiceId);
          const opt = (svc?.options || []).find(o => o.id === manualOptionId);
          if (!svc || !opt) throw new Error("Opción inválida.");

          serviceId = svc.id;
          serviceName = svc.name;
          need = Number(opt.durationMinutes);
          price = Number(opt.price);

          // Paso (granularidad) = mínima opción del lugar
          const allOpts = (pData.services || []).flatMap(s => s.options || []);
          const step = Math.max(5, Math.min(...allOpts.map(o => Number(o.durationMinutes || 0)).filter(n => n > 0)) || Number(t.durationMinutes || 30));

          if (need <= 0) throw new Error("Duración inválida.");

          if (need === baseDur) {
            // Caso simple: ocupa SOLO este bloque
            const reservations = Array.isArray(t.reservations) ? [...t.reservations] : [];
            reservations.push({
              uid: `manual-${Date.now()}`,
              name,
              serviceId,
              serviceName,
              durationMinutes: need,
              price,
              depositPercent: depositPercentTx,
              depositDue: Math.round(price * (depositPercentTx/100)),
              manual: true,
            });
            tx.update(ref, {
              reservations,
              slotsAvailable: avail - 1,
            });

          } else if (need < baseDur) {
            // SPLIT: reservar una parte y publicar remanente como nuevo bloque
            const reservations = Array.isArray(t.reservations) ? [...t.reservations] : [];
            reservations.push({
              uid: `manual-${Date.now()}`,
              name,
              serviceId,
              serviceName,
              durationMinutes: need,
              price,
              depositPercent: depositPercentTx,
              depositDue: Math.round(price * (depositPercentTx/100)),
              manual: true,
            });

            tx.update(ref, {
              reservations,
              slotsAvailable: avail - 1,
            });

            const newStart = new Date(baseStart.getTime() + need * 60000);
            const hh2 = String(newStart.getHours()).padStart(2,"0");
            const mm2 = String(newStart.getMinutes()).padStart(2,"0");
            const remainderDuration = baseDur - need;

            const clashQ = query(
              collection(db, "turnos"),
              where("placeId", "==", t.placeId),
              where("date", "==", baseDate),
              where("time", "==", `${hh2}:${mm2}`)
            );
            const clashSnap = await getDocs(clashQ);
            if (clashSnap.empty) {
              throw { __createRemainder: {
                placeId: t.placeId,
                placeName: t.placeName || place?.name || "—",
                date: baseDate,
                time: `${hh2}:${mm2}`,
                dateTime: new Date(`${baseDate}T${hh2}:${mm2}:00`).toISOString(),
                durationMinutes: remainderDuration,
                slots: 1,
                slotsAvailable: 1,
                reservations: [],
                reservationUids: [],
                status: "available",
                createdAt: serverTimestamp(),
                mode: t.mode || "flex",
              }};
            }

          } else {
            // MERGE: necesitamos k bloques contiguos empezando en este
            const k = Math.ceil(need / step);
            const neededTimes = [];
            for (let i = 0; i < k; i++) {
              const dt = new Date(baseStart.getTime() + i * step * 60000);
              neededTimes.push(`${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`);
            }

            const qDay = query(collection(db, "turnos"), where("placeId", "==", t.placeId), where("date", "==", baseDate));
            const daySnap = await getDocs(qDay);
            const byTime = {};
            daySnap.docs.forEach(d => { const td = d.data(); byTime[td.time] = { id: d.id, ...td }; });

            const blockDocs = neededTimes.map(tm => byTime[tm]).filter(Boolean);
            if (blockDocs.length < neededTimes.length) throw new Error("No hay disponibilidad contigua suficiente.");

            const snaps = await Promise.all(blockDocs.map(b => tx.get(doc(db, "turnos", b.id))));
            const fresh = snaps.map(s => ({ id: s.id, ...s.data() }));
            for (const b of fresh) {
              const a = Number(b.slotsAvailable ?? b.slots ?? 0);
              if (a <= 0 || b.status === "expired") throw new Error("No hay disponibilidad contigua suficiente.");
            }

            const first = fresh[0];
            const firstRef = doc(db, "turnos", first.id);
            const reservations = Array.isArray(first.reservations) ? [...first.reservations] : [];
            reservations.push({
              uid: `manual-${Date.now()}`,
              name,
              serviceId,
              serviceName,
              durationMinutes: need,
              price,
              depositPercent: depositPercentTx,
              depositDue: Math.round(price * (depositPercentTx/100)),
              manual: true,
            });

            tx.update(firstRef, {
              durationMinutes: need,
              slotsAvailable: Number(first.slotsAvailable ?? first.slots ?? 0) - 1,
              reservationUids: [...(first.reservationUids || []), `manual-${Date.now()}`],
              reservations,
              placeName: first.placeName || place?.name || "—",
            });

            for (let i = 1; i < fresh.length; i++) {
              tx.delete(doc(db, "turnos", fresh[i].id));
            }
          }

        } else {
          // MODO FIXED: reserva el bloque completo
          const reservations = Array.isArray(t.reservations) ? [...t.reservations] : [];
          reservations.push({
            uid: `manual-${Date.now()}`,
            name,
            serviceId,
            serviceName,
            durationMinutes: baseDur,
            price: 0,
            depositPercent: depositPercentTx,
            depositDue: 0,
            manual: true,
          });
          tx.update(ref, {
            reservations,
            slotsAvailable: avail - 1,
          });
        }
      });

      // creación de remanente si corresponde
    } catch (e) {
      if (e && e.__createRemainder) {
        try {
          await addDoc(collection(db, "turnos"), e.__createRemainder);
          setToast({ open: true, sev: "success", msg: "Reserva manual agregada." });
          setDialogTurn(null);
          return;
        } catch (e2) {
          setToast({ open: true, sev: "error", msg: "No se pudo crear el remanente." });
          return;
        }
      }
      setToast({ open: true, sev: "error", msg: e.message || "No se pudo agregar la reserva." });
      return;
    }

    setToast({ open: true, sev: "success", msg: "Reserva manual agregada." });
    setDialogTurn(null);
  };
  // ====== /Reserva manual ======

  if (!place) {
    return (
      <Box sx={{ p: 3, color: "#fff" }}>
        <Typography>Cargando…</Typography>
      </Box>
    );
  }

  return (
    <Box sx={styles.container}>
      <Box sx={styles.headerBar}>
        <Box>
          <Typography variant="h4">Panel del Lugar</Typography>
          <Typography variant="subtitle1" sx={{ opacity: 0.9 }}>{place?.name || "—"}</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="contained"
            color="warning"
            sx={{ fontWeight: 700 }}
            onClick={() => navigate("/place-profile")}
          >
            Editar perfil
          </Button>
          <Button variant="contained" color="secondary" onClick={async()=>{ await signOut(auth); navigate("/"); }}>
            Cerrar sesión
          </Button>
        </Box>
      </Box>

      {/* Calendario + Agenda */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Box sx={styles.panel}>
            <Typography variant="subtitle2" sx={{ mb: 1, opacity: 0.8 }}>
              Verde: Disponible — Rojo: Ocupado
            </Typography>
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              defaultView={Views.WEEK}
              views={[Views.WEEK, Views.DAY, Views.MONTH]}
              step={60}
              timeslots={1}
              onSelectEvent={(ev)=> openTurnDialog(ev.turn)}
              onSelectSlot={({ start }) => setSelectedDate(start)}
              onNavigate={(d) => setSelectedDate(d)}
              eventPropGetter={eventPropGetter}
              style={{ height: 640, borderRadius: 8, background: "#fff" }}
            />
          </Box>
        </Grid>

        <Grid item xs={12} md={4}>
          <Box sx={styles.panel}>
            <Typography variant="h6">Agenda del {yyyymmdd(selectedDate)}</Typography>
            <Divider sx={{ my: 1 }} />
            {dayAgenda.length === 0 ? (
              <Typography color="text.secondary">No hay turnos este día.</Typography>
            ) : (
              <Stack spacing={1.2}>
                {dayAgenda.map((t) => {
                  const avail = Number(t.slotsAvailable ?? t.slots ?? 0);
                  const full = avail <= 0;
                  return (
                    <Card key={t.id} variant="outlined" sx={styles.agendaCard}>
                      <CardContent sx={{ pb: 1.5 }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                              {t.time} {t.serviceName ? `· ${t.serviceName}` : ""}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {full ? "Ocupado" : "Disponible"} · {getDurationMin(t)} min · Cupos: {avail}
                            </Typography>
                          </Box>
                          <Button size="small" variant="contained" onClick={()=>openTurnDialog(t)}>Ver</Button>
                        </Box>

                        <Box sx={{ mt: 1 }}>
                          {(t.reservations || []).map((r, idx) => (
                            <Chip key={idx} label={`${r.name}${r.serviceName ? ` · ${r.serviceName}` : ""}`} size="small" sx={{ mr: .5, mb: .5 }} />
                          ))}
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </Box>
        </Grid>
      </Grid>

      {/* Panel inferior */}
      <Box sx={{ mt: 2, ...styles.panel }}>
        <Tabs value={adminTab} onChange={(_, v) => setAdminTab(v)}>
          <Tab label="Configurar & Generar" />
          <Tab label="Servicios (modo flexible)" />
          <Tab label="Borrar turnos" />
        </Tabs>

        {/* CONFIGURAR & GENERAR */}
        {adminTab === 0 && (
          <Box sx={{ mt: 2 }}>
            {/* Elegir modo */}
            <Typography variant="subtitle1" sx={{ mb: 1 }}>Modo de agenda</Typography>
            <RadioGroup
              row
              value={schedulingMode}
              onChange={(e) => setSchedulingMode(e.target.value)}
            >
              <FormControlLabel value="fixed" control={<Radio />} label="Turnos fijos" />
              <FormControlLabel value="flex" control={<Radio />} label="Turnos flexibles" />
            </RadioGroup>

            {/* Rango común */}
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={3}>
                <TextField label="Desde (fecha)" type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} InputLabelProps={{shrink:true}} fullWidth />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField label="Hasta (fecha)" type="date" value={toDate} onChange={e=>setToDate(e.target.value)} InputLabelProps={{shrink:true}} fullWidth />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField label="Inicio" type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} InputLabelProps={{shrink:true}} fullWidth />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField label="Fin" type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} InputLabelProps={{shrink:true}} fullWidth />
              </Grid>
            </Grid>

            {/* FIXED config */}
            {schedulingMode === "fixed" && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" sx={{ mb: 1 }}>Turnos fijos</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <TextField label="Duración de cada turno (min)" type="number" value={fixedSlotDuration} onChange={e=>setFixedSlotDuration(Number(e.target.value||60))} fullWidth />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField label="Cupos por turno" type="number" value={fixedSlots} onChange={e=>setFixedSlots(Number(e.target.value||1))} fullWidth />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      select
                      label="Servicio base (opcional)"
                      value={fixedServiceId}
                      onChange={(e)=>setFixedServiceId(e.target.value)}
                      fullWidth
                    >
                      <MenuItem value="">(Sin servicio)</MenuItem>
                      {(place?.services || []).map(s => (
                        <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                </Grid>

                <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
                  <Button variant="contained" onClick={async ()=>{ await saveFixedConfig(); await generateFixed(); }}>
                    Generar turnos fijos
                  </Button>
                </Box>
              </>
            )}

            {/* FLEX config resumida */}
            {schedulingMode === "flex" && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" sx={{ mb: 1 }}>Turnos flexibles</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <TextField
                      label="Seña requerida (%)"
                      type="number"
                      value={depositPercent}
                      onChange={(e)=>setDepositPercent(Number(e.target.value||0))}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={8}>
                    <Typography variant="body2" sx={{ mt: 1.5 }}>
                      Granularidad mínima calculada por las opciones: <strong>{minOptionDuration} min</strong>
                    </Typography>
                  </Grid>
                </Grid>
                <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
                  Tip: definí servicios y opciones (duración + precio) en la pestaña “Servicios (modo flexible)”.
                </Typography>

                <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
                  <Button variant="contained" onClick={async ()=>{ await saveFlexConfig(); await generateFlex(); }}>
                    Generar turnos flexibles
                  </Button>
                </Box>
              </>
            )}
          </Box>
        )}

        {/* SERVICIOS (modo flex) */}
        {adminTab === 1 && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Seña requerida (%)"
                  type="number"
                  value={depositPercent}
                  onChange={(e)=>setDepositPercent(Number(e.target.value||0))}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={6} sx={{ display: "flex", alignItems: "center" }}>
                <Typography variant="body2">
                  Granularidad mínima actual: <strong>{minOptionDuration} min</strong>
                </Typography>
              </Grid>
            </Grid>

            {/* Alta de servicio */}
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} md={6}>
                <TextField label="Nombre del servicio" value={newServiceName} onChange={e=>setNewServiceName(e.target.value)} fullWidth />
              </Grid>
              <Grid item xs={12} md={3}>
                <Button variant="contained" sx={{ height: "100%" }} onClick={addService}>Agregar servicio</Button>
              </Grid>
              <Grid item xs={12} md={3}>
                <Button variant="outlined" sx={{ height: "100%" }} onClick={saveFlexConfig}>Guardar</Button>
              </Grid>
            </Grid>

            {/* Lista de servicios con opciones (duración+precio) */}
            <Stack spacing={2}>
              {services.length === 0 && <Typography color="text.secondary">Aún no hay servicios.</Typography>}
              {services.map((svc, idx) => (
                <Box key={svc.id} sx={{ border: "1px solid #eee", borderRadius: 2, p: 2 }}>
                  <Box sx={{ display:"flex", justifyContent:"space-between", alignItems:"center", mb: 1 }}>
                    <Typography variant="subtitle1">{svc.name}</Typography>
                    <Button color="error" onClick={()=>removeService(svc.id)}>Eliminar servicio</Button>
                  </Box>

                  {/* Agregar opción */}
                  <Grid container spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Grid item xs={12} md={3}>
                      <TextField
                        label="Duración (min)"
                        type="number"
                        size="small"
                        value={svc._newDur || ""}
                        onChange={(e)=>{
                          const v = e.target.value;
                          setServices(prev => prev.map((s,i)=> i===idx ? {...s, _newDur: v} : s));
                        }}
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <TextField
                        label="Precio ($)"
                        type="number"
                        size="small"
                        value={svc._newPrice || ""}
                        onChange={(e)=>{
                          const v = e.target.value;
                          setServices(prev => prev.map((s,i)=> i===idx ? {...s, _newPrice: v} : s));
                        }}
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Button
                        variant="outlined"
                        onClick={()=> addOptionToService(idx, Number(svc._newDur), Number(svc._newPrice))}
                      >
                        Agregar opción
                      </Button>
                    </Grid>
                  </Grid>

                  {/* Opciones existentes */}
                  <Stack spacing={0.5}>
                    {(svc.options || []).map((o) => (
                      <Box key={o.id} sx={{ display:"flex", gap: 2, alignItems:"center" }}>
                        <Chip label={`${o.durationMinutes} min`} size="small" />
                        <Chip label={`$${o.price}`} size="small" color="success" />
                        <Button size="small" color="error" onClick={()=>removeOptionFromService(idx, o.id)}>
                          Eliminar opción
                        </Button>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>

            <Button sx={{ mt: 2 }} variant="contained" onClick={saveFlexConfig}>
              Guardar cambios
            </Button>
          </Box>
        )}

        {/* BORRAR TURNOS */}
        {adminTab === 2 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Borrar turnos publicados
            </Typography>

            <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
              <Button color="error" variant="contained" onClick={deleteAllTurns}>
                Borrar todos
              </Button>
            </Stack>

            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={3}>
                <TextField
                  label="Desde (fecha)"
                  type="date"
                  value={delFrom}
                  onChange={(e)=>setDelFrom(e.target.value)}
                  InputLabelProps={{shrink:true}}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Hasta (fecha)"
                  type="date"
                  value={delTo}
                  onChange={(e)=>setDelTo(e.target.value)}
                  InputLabelProps={{shrink:true}}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <Button variant="outlined" color="error" onClick={deleteTurnsByPeriod}>
                  Borrar por período
                </Button>
              </Grid>
            </Grid>
          </Box>
        )}
      </Box>

      {/* Diálogo: Turno + reserva manual */}
      <Dialog open={!!dialogTurn} onClose={() => setDialogTurn(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Turno</DialogTitle>
        <DialogContent dividers>
          {dialogTurn && (
            <>
              <Typography><strong>Fecha:</strong> {dialogTurn.date}</Typography>
              <Typography><strong>Hora:</strong> {dialogTurn.time}</Typography>
              <Typography><strong>Duración:</strong> {getDurationMin(dialogTurn)} min</Typography>
              <Typography><strong>Cupos disp.:</strong> {dialogTurn.slotsAvailable ?? dialogTurn.slots}</Typography>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle1" sx={{ mb: 1 }}>Reservas</Typography>
{(dialogTurn.reservations || []).length === 0 ? (
  <Typography color="text.secondary">Sin reservas.</Typography>
) : (
  <Stack spacing={1}>
    {dialogTurn.reservations.map((r, i) => (
      <Box
        key={i}
        sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <Typography>
          {r.name}{r.serviceName ? ` · ${r.serviceName}` : ""}
          {r.durationMinutes ? ` · ${r.durationMinutes} min` : ""}
        </Typography>

        {/* Botón para cancelar esta reserva */}
        <Button
          size="small"
          color="error"
          variant="outlined"
          onClick={async () => {
            await handleCancelReservation(dialogTurn.id, r.uid);
            // Opcional: actualizar el diálogo localmente
            setDialogTurn((prev) => ({
              ...prev,
              reservations: (prev.reservations || []).filter(res => res.uid !== r.uid),
              slotsAvailable: (prev.slotsAvailable ?? prev.slots ?? 1) + 1,
            }));
          }}
        >
          Cancelar
        </Button>
      </Box>
    ))}
  </Stack>
)}


              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle1">Agregar reserva manual</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
                <TextField
                  label="Nombre"
                  size="small"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
                {/* Servicio */}
                <TextField
                  select
                  size="small"
                  label="Servicio"
                  value={manualServiceId}
                  onChange={(e)=>{ setManualServiceId(e.target.value); setManualOptionId(""); }}
                  sx={{ minWidth: 220 }}
                >
                  <MenuItem value="">(Sin servicio)</MenuItem>
                  {(place?.services || []).map(s => (
                    <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                  ))}
                </TextField>
                

                {/* Duración (solo en modo flex) */}
                { (place?.schedulingMode === "flex")
                  ? (
                    <TextField
                      select
                      size="small"
                      label="Duración (opción)"
                      value={manualOptionId}
                      onChange={(e)=> setManualOptionId(e.target.value)}
                      sx={{ minWidth: 200 }}
                    >
                      <MenuItem value="">(Elegir)</MenuItem>
                      {manualOptions.map(o => (
                        <MenuItem key={o.id} value={o.id}>
                          {o.durationMinutes} min — ${o.price}
                        </MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <TextField
                      size="small"
                      label="Duración (fija)"
                      value={getDurationMin(dialogTurn)}
                      disabled
                    />
                  )
                }

                <Button variant="contained" onClick={handleAddManualReservation}>
                  Agregar
                </Button>
                
              </Stack>
            </>
          )}
        </DialogContent>
        <DialogActions>
  <Button
    color="error"
    onClick={async () => {
      // Si querés cancelar solo la primera reserva como ejemplo:
      if ((dialogTurn.reservations || []).length === 0) return;
      const reservation = dialogTurn.reservations[0]; // o mapear según la que el usuario elija
      await handleCancelReservation(dialogTurn.id, reservation.uid);
      setDialogTurn(null);
    }}
  >
    Cancelar todas las reservas
  </Button>

  <Button onClick={() => setDialogTurn(null)}>Cerrar</Button>
</DialogActions>
      </Dialog>

      {/* Toasts */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast.sev} variant="filled" onClose={() => setToast((t) => ({ ...t, open: false }))}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

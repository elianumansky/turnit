import React, { useEffect, useMemo, useState } from "react";
import {
  collection, query, where, onSnapshot, doc, getDocs, getDoc,
  updateDoc, runTransaction, addDoc, serverTimestamp
} from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  Box, Typography, Button, Grid, Card, CardContent, Divider, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Stack, IconButton, Tooltip,
  Snackbar, Alert, Tabs, Tab, MenuItem
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";

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

// SOLO nombre (sin email)
function reservationLabel(r, namesByUid) {
  if (typeof r === "string") return namesByUid[r] || "Ocupado";
  if (r && typeof r === "object") return r.name || namesByUid[r.uid] || "Ocupado";
  return "Ocupado";
}

export default function PlaceDashboard({ user }) {
  const navigate = useNavigate();

  // place
  const [placeId, setPlaceId] = useState(null);
  const [placeName, setPlaceName] = useState("");
  const [services, setServices] = useState([]); // servicios flexibles del place

  // datos
  const [turns, setTurns] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // reservas
  const [dialogTurn, setDialogTurn] = useState(null);
  const [manualName, setManualName] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  // cache nombres
  const [namesByUid, setNamesByUid] = useState({});

  // notifs
  const [toast, setToast] = useState({ open: false, sev: "success", msg: "" });

  // panel inferior
  const [adminTab, setAdminTab] = useState(0);

  // ----- obtener lugar (dueño o staff) -----
  useEffect(() => {
    const fetchPlace = async () => {
      if (!user?.uid) return;
      try {
        // dueño
        const qOwner = query(collection(db, "places"), where("ownerId", "==", user.uid));
        const sOwner = await getDocs(qOwner);
        if (!sOwner.empty) {
          const d = sOwner.docs[0];
          setPlaceId(d.id);
          setPlaceName(d.data().name || "");
          setServices(d.data().services || []);
          return;
        }
        // staff (lo mantenemos para que el staff pueda ver el panel, pero sin la pestaña "Servicios flexibles")
        const qStaff = query(collection(db, "places"), where("staffIds", "array-contains", user.uid));
        const sStaff = await getDocs(qStaff);
        if (!sStaff.empty) {
          const d = sStaff.docs[0];
          setPlaceId(d.id);
          setPlaceName(d.data().name || "");
          setServices(d.data().services || []);
          return;
        }
        setToast({ open: true, sev: "error", msg: "No se encontró un lugar asociado a tu cuenta." });
      } catch (e) {
        setToast({ open: true, sev: "error", msg: "Error cargando tu lugar." });
      }
    };
    fetchPlace();
  }, [user]);

  // ----- subs -----
  useEffect(() => {
    if (!placeId) return;

    const qT = query(collection(db, "turnos"), where("placeId", "==", placeId));
    const unsubT = onSnapshot(qT, (snap) => setTurns(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    return () => { unsubT(); };
  }, [placeId]);

  // ----- expirar turnos pasados (best-effort) -----
  useEffect(() => {
    if (!turns.length) return;
    const now = nowMs();
    // Recorremos y marcamos status=expired para los que ya pasaron
    turns.forEach(async (t) => {
      try {
        if (!t?.date || !t?.time) return;
        const start = timeToDate(t.date, t.time).getTime();
        const durationMin = Number(t.durationMinutes || 60);
        const end = start + durationMin * 60_000;
        if (end < now && t.status !== "expired") {
          await updateDoc(doc(db, "turnos", t.id), { status: "expired" });
        }
      } catch { /* noop */ }
    });
  }, [turns]);

  // ----- cache nombres -----
  useEffect(() => {
    const uids = new Set();
    for (const t of turns) {
      if (Array.isArray(t.reservations)) {
        for (const r of t.reservations) {
          if (typeof r === "string") uids.add(r);
          else if (r?.uid) uids.add(r.uid);
        }
      }
    }
    const missing = [...uids].filter((uid) => !namesByUid[uid]);
    if (missing.length === 0) return;
    (async () => {
      const updates = {};
      for (const uid of missing) {
        try {
          const uref = doc(db, "users", uid);
          const usnap = await getDoc(uref);
          updates[uid] = usnap.exists()
            ? (usnap.data().name || usnap.data().fullName || "Ocupado")
            : "Ocupado";
        } catch {
          updates[uid] = "Ocupado";
        }
      }
      setNamesByUid((p) => ({ ...p, ...updates }));
    })();
  }, [turns]);

  // ----- eventos calendario -----
  const events = useMemo(() => {
    if (!placeId) return [];
    const out = [];
    for (const t of turns) {
      if (t?.status === "expired") continue; // no mostrar vencidos
      if (!t?.date || !t?.time) continue;

      const start = timeToDate(t.date, t.time);
      const durationMin = Number(t.durationMinutes || 60);
      const end = addMinutes(start, durationMin);

      const avail = Number(t.slotsAvailable ?? t.slots ?? 0);
      let title = "Disponible";
      if (avail <= 0) {
        const first = (t.reservations || [])[0];
        title = reservationLabel(first, namesByUid); // SOLO nombre o "Ocupado"
      }

      out.push({ id: t.id, title, start, end, type: "turn", turn: t });
    }
    return out;
  }, [turns, placeId, namesByUid]);

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

  const dayAgenda = useMemo(() => {
    const day = selectedDate;
    return turns
      .filter(t => t?.status !== "expired")
      .filter(t => t?.date && isSameDay(timeToDate(t.date, "00:00"), day))
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }, [turns, selectedDate]);

  const onSelectEvent = (ev) => {
    setSelectedDate(ev.start);
    setDialogTurn(ev.turn);
  };

  // ----- acciones reserva -----
  const handleDeleteSlot = async (turn) => {
    try {
      const ref = doc(db, "turnos", turn.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const t = snap.data();
        if ((t.reservations || []).length > 0 && Number(t.slots) <= 1) {
          throw new Error("No podés eliminar el último cupo porque hay reservas.");
        }
        const newTotal = Math.max(0, Number(t.slots ?? 0) - 1);
        const newAvail = Math.max(0, Math.min(newTotal, Number(t.slotsAvailable ?? 0) - 1));
        if (newTotal === 0) {
          // En lugar de borrar, si querés conservar el historial, podés marcar expired
          await tx.update(ref, { slots: 0, slotsAvailable: 0, status: "expired" });
        } else {
          tx.update(ref, { slots: newTotal, slotsAvailable: newAvail });
        }
      });
      setToast({ open: true, sev: "success", msg: "Cupo eliminado." });
    } catch (e) {
      setToast({ open: true, sev: "error", msg: e.message || "No se pudo eliminar el cupo." });
    }
  };

  const handleCancelReservation = async (turn, reservation) => {
    try {
      const ref = doc(db, "turnos", turn.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Turno inexistente");
        const t = snap.data();
        const uid = typeof reservation === "string" ? reservation : (reservation?.uid || "");
        const oldRes = Array.isArray(t.reservations) ? t.reservations : [];
        const oldUids = Array.isArray(t.reservationUids) ? t.reservationUids : [];
        const before = oldRes.length;
        const reservations = oldRes.filter(r => (typeof r === "string" ? r : r?.uid) !== uid);
        const removed = before - reservations.length;
        if (removed <= 0) return;
        const reservationUids = uid ? oldUids.filter(u => u !== uid) : oldUids;
        tx.update(ref, {
          reservations,
          reservationUids,
          slotsAvailable: (Number(t.slotsAvailable ?? 0)) + removed
        });
      });
      setToast({ open: true, sev: "success", msg: "Reserva cancelada." });
    } catch (e) {
      setToast({ open: true, sev: "error", msg: e.message || "No se pudo cancelar." });
    }
  };

  const handleAddManualReservation = async () => {
    try {
      const name = manualName.trim();
      if (!dialogTurn || !name) return;
      const ref = doc(db, "turnos", dialogTurn.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Turno inexistente");
        const t = snap.data();
        const avail = Number(t.slotsAvailable ?? 0);
        if (avail <= 0) throw new Error("No hay cupos disponibles");
        const reservations = Array.isArray(t.reservations) ? [...t.reservations] : [];
        reservations.push({ uid: `manual-${Date.now()}`, name }); // guarda NOMBRE
        tx.update(ref, { reservations, slotsAvailable: avail - 1 });
      });
      setManualName("");
      setToast({ open: true, sev: "success", msg: "Reserva manual agregada." });
    } catch (e) {
      setToast({ open: true, sev: "error", msg: e.message || "No se pudo agregar la reserva." });
    }
  };

  const handleAddClientByEmail = async () => {
    try {
      const email = clientEmail.trim().toLowerCase();
      if (!dialogTurn || !email) return;
      const q = query(collection(db, "users"), where("email", "==", email));
      const snap = await getDocs(q);
      if (snap.empty) throw new Error("No se encontró un usuario con ese email.");
      const u = { id: snap.docs[0].id, ...snap.docs[0].data() };
      const uid = u.userId || snap.docs[0].id;

      const ref = doc(db, "turnos", dialogTurn.id);
      await runTransaction(db, async (tx) => {
        const tsnap = await tx.get(ref);
        if (!tsnap.exists()) throw new Error("Turno inexistente");
        const t = tsnap.data();
        const avail = Number(t.slotsAvailable ?? 0);
        if (avail <= 0) throw new Error("No hay cupos disponibles");
        const oldRes = Array.isArray(t.reservations) ? t.reservations : [];
        const oldUids = Array.isArray(t.reservationUids) ? t.reservationUids : [];
        const already = oldRes.some(r => (typeof r === "string" ? r : r?.uid) === uid) || oldUids.includes(uid);
        if (already) throw new Error("Ese usuario ya reservó este turno.");
        const reservations = [...oldRes, { uid, name: u.name || u.fullName || "Ocupado" }]; // SOLO nombre
        const reservationUids = oldUids.includes(uid) ? oldUids : [...oldUids, uid];
        tx.update(ref, { reservations, reservationUids, slotsAvailable: avail - 1 });
      });

      setClientEmail("");
      setToast({ open: true, sev: "success", msg: "Reserva agregada al cliente." });
    } catch (e) {
      setToast({ open: true, sev: "error", msg: e.message || "No se pudo agregar la reserva." });
    }
  };

  // ----- Turnos fijos -----
  const [recFrom, setRecFrom] = useState("");
  const [recTo, setRecTo] = useState("");
  const [recStart, setRecStart] = useState("10:00");
  const [recEnd, setRecEnd] = useState("20:00");
  const [recInterval, setRecInterval] = useState(60);
  const [recSlots, setRecSlots] = useState(1);
  const [recDays, setRecDays] = useState({ 1: true, 2: true, 3: true, 4: true, 5: true, 0: false, 6: false });
  const [recServiceId, setRecServiceId] = useState(""); // opcional: generar fijos con tipo
  const selectedService = services.find(s => s.id === recServiceId) || null;

  const generateFixedTurns = async () => {
    if (!placeId || !recFrom || !recTo) return;
    const startDate = new Date(`${recFrom}T00:00:00`);
    const endDate = new Date(`${recTo}T00:00:00`);
    let created = 0;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (!recDays[dow]) continue;

      const [sh, sm] = recStart.split(":").map(Number);
      const [eh, em] = recEnd.split(":").map(Number);
      let cur = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh, sm, 0);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh, em, 0);
      while (cur < end) {
        const date = yyyymmdd(cur);
        const time = `${pad2(cur.getHours())}:${pad2(cur.getMinutes())}`;

        // no hay bloques/capacidad: generación simple
        const exists = turns.some(t => t.date === date && t.time === time);
        if (!exists) {
          const durationMinutes = Number(selectedService?.durationMinutes || recInterval || 60);
          await addDoc(collection(db, "turnos"), {
            userId: user.uid,
            userName: user.displayName || user.email || "Usuario",
            placeId,
            placeName,
            date,
            time,
            dateTime: new Date(`${date}T${time}:00`).toISOString(),
            serviceId: recServiceId || null,
            serviceName: selectedService?.name || null,
            durationMinutes, // clave para expirar y mostrar en calendario
            slots: Number(recSlots),
            slotsAvailable: Number(recSlots),
            reservations: [],
            reservationUids: [],
            status: "available",
            createdAt: serverTimestamp(),
          });
          created++;
        }

        cur = new Date(cur.getTime() + recInterval * 60000);
      }
    }
    setToast({ open: true, sev: "success", msg: `Turnos creados: ${created}` });
  };

  // ----- Turno manual (nuevo tab) -----
  const [manDate, setManDate] = useState("");
  const [manTime, setManTime] = useState("10:00");
  const [manServiceId, setManServiceId] = useState("");
  const [manCustomDuration, setManCustomDuration] = useState("");
  const [manSlots, setManSlots] = useState(1);
  const canCreateManual = manDate && manTime && Number(manSlots) > 0;

  const createManualTurn = async () => {
    if (!placeId || !canCreateManual) return;
    const svc = services.find(s => s.id === manServiceId) || null;
    const durationMinutes = Number(manCustomDuration || svc?.durationMinutes || 60);
    const date = manDate;
    const time = manTime;

    await addDoc(collection(db, "turnos"), {
      userId: user.uid,
      userName: user.displayName || user.email || "Usuario",
      placeId,
      placeName,
      date,
      time,
      dateTime: new Date(`${date}T${time}:00`).toISOString(),
      serviceId: manServiceId || null,
      serviceName: svc?.name || null,
      durationMinutes,
      slots: Number(manSlots),
      slotsAvailable: Number(manSlots),
      reservations: [],
      reservationUids: [],
      status: "available",
      createdAt: serverTimestamp(),
      createdBy: "manual"
    });

    setManDate(""); setManTime("10:00"); setManServiceId(""); setManCustomDuration(""); setManSlots(1);
    setToast({ open: true, sev: "success", msg: "Turno manual creado." });
  };

  // ----- Servicios flexibles (CRUD simple en places) -----
  const [svcName, setSvcName] = useState("");
  const [svcDuration, setSvcDuration] = useState("");
  const addService = () => {
    if (!svcName.trim() || Number(svcDuration) <= 0) return;
    const id = `svc_${Math.random().toString(36).slice(2, 10)}`;
    setServices(prev => [...prev, { id, name: svcName.trim(), durationMinutes: Number(svcDuration) }]);
    setSvcName(""); setSvcDuration("");
  };
  const removeService = (id) => setServices(prev => prev.filter(s => s.id !== id));
  const saveServices = async () => {
    if (!placeId) return;
    const pref = doc(db, "places", placeId);
    await updateDoc(pref, { services, flexibleEnabled: true });
    setToast({ open: true, sev: "success", msg: "Servicios guardados." });
  };

  const styles = {
    container: { p: 3, minHeight: "100vh", background: "linear-gradient(135deg, #4e54c8, #8f94fb)", color: "#fff" },
    headerBar: { display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 },
    panel: { background: "#fff", color: "#000", borderRadius: 12, padding: 12 },
    agendaCard: { borderRadius: 10, background: "#f7f7ff" },
    chip: { mr: 0.5, mt: 0.5 }
  };

  return (
    <Box sx={styles.container}>
      <Box sx={styles.headerBar}>
        <Box>
          <Typography variant="h4">Panel del Lugar</Typography>
          <Typography variant="subtitle1" sx={{ opacity: 0.9 }}>{placeName || "—"}</Typography>
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

      <Grid container spacing={2}>
        {/* Calendario */}
        <Grid item xs={12} md={8}>
          <Box sx={styles.panel}>
            <Typography variant="subtitle2" sx={{ mb: 1, opacity: 0.8 }}>
              Verde: Disponible — Rojo: Completo
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
              selectable
              onSelectEvent={onSelectEvent}
              onSelectSlot={({ start }) => setSelectedDate(start)}
              onNavigate={(d) => setSelectedDate(d)}
              eventPropGetter={eventPropGetter}
              style={{ height: 640, borderRadius: 8, background: "#fff" }}
            />
          </Box>
        </Grid>

        {/* Agenda del día */}
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
                  const booked = Array.isArray(t.reservations) ? t.reservations.length : 0;
                  const full = avail <= 0;
                  const title = full
                    ? reservationLabel((t.reservations || [])[0], namesByUid) // nombre
                    : "Disponible";
                  const dur = Number(t.durationMinutes || 60);
                  return (
                    <Card key={t.id} variant="outlined" sx={styles.agendaCard}>
                      <CardContent sx={{ pb: 1.5 }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                              {t.time} {t.serviceName ? `· ${t.serviceName}` : ""}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {title} · {full ? `Reservas: ${booked}` : `Disponibles: ${avail}`} · {dur} min
                            </Typography>
                          </Box>
                          <Button size="small" variant="contained" onClick={() => setDialogTurn(t)}>Ver</Button>
                        </Box>

                        <Box sx={{ mt: 1 }}>
                          {(t.reservations || []).map((r, idx) => (
                            <Chip key={idx} label={reservationLabel(r, namesByUid)} size="small" sx={styles.chip} />
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

      {/* Panel inferior: Turnos fijos / Turno manual / Servicios flexibles */}
      <Box sx={{ mt: 2, ...styles.panel }}>
        <Tabs value={adminTab} onChange={(_, v) => setAdminTab(v)}>
          <Tab label="Turnos fijos" />
          <Tab label="Agregar turno manual" />
          <Tab label="Servicios flexibles" />
        </Tabs>

        {/* Turnos fijos */}
        {adminTab === 0 && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={2}>
                <TextField label="Desde" type="date" value={recFrom} onChange={e=>setRecFrom(e.target.value)} InputLabelProps={{shrink:true}} fullWidth />
              </Grid>
              <Grid item xs={12} md={2}>
                <TextField label="Hasta" type="date" value={recTo} onChange={e=>setRecTo(e.target.value)} InputLabelProps={{shrink:true}} fullWidth />
              </Grid>
              <Grid item xs={12} md={2}>
                <TextField label="Inicio" type="time" value={recStart} onChange={e=>setRecStart(e.target.value)} InputLabelProps={{shrink:true}} fullWidth />
              </Grid>
              <Grid item xs={12} md={2}>
                <TextField label="Fin" type="time" value={recEnd} onChange={e=>setRecEnd(e.target.value)} InputLabelProps={{shrink:true}} fullWidth />
              </Grid>
              <Grid item xs={12} md={2}>
                <TextField label="Cada (min)" type="number" value={recInterval} onChange={e=>setRecInterval(Number(e.target.value||60))} fullWidth />
              </Grid>
              <Grid item xs={12} md={2}>
                <TextField label="Cupos" type="number" value={recSlots} onChange={e=>setRecSlots(Number(e.target.value||1))} fullWidth />
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  select
                  label="Tipo de servicio (opcional)"
                  value={recServiceId}
                  onChange={(e)=>setRecServiceId(e.target.value)}
                  fullWidth
                >
                  <MenuItem value="">(Sin tipo)</MenuItem>
                  {services.map(s => (
                    <MenuItem key={s.id} value={s.id}>{s.name} ({s.durationMinutes} min)</MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>

            <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
              {["D","L","M","Mí","J","V","S"].map((lbl, i) => {
                const map = {0: "D",1: "L",2:"M",3:"Mí",4:"J",5:"V",6:"S"};
                const dow = Object.keys(map).find(k => map[k]===lbl)*1;
                const active = !!recDays[dow];
                return (
                  <Chip
                    key={lbl}
                    label={lbl}
                    color={active ? "primary" : "default"}
                    onClick={()=>setRecDays(d => ({...d, [dow]: !d[dow]}))}
                  />
                );
              })}
            </Box>

            <Button sx={{ mt: 2 }} variant="contained" onClick={generateFixedTurns}>
              Generar turnos
            </Button>
          </Box>
        )}

        {/* Agregar turno manual */}
        {adminTab === 1 && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <TextField label="Fecha" type="date" value={manDate} onChange={e=>setManDate(e.target.value)} InputLabelProps={{shrink:true}} fullWidth />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField label="Hora" type="time" value={manTime} onChange={e=>setManTime(e.target.value)} InputLabelProps={{shrink:true}} fullWidth />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  select
                  label="Tipo de servicio"
                  value={manServiceId}
                  onChange={e=>setManServiceId(e.target.value)}
                  fullWidth
                >
                  <MenuItem value="">(Sin tipo)</MenuItem>
                  {services.map(s => (
                    <MenuItem key={s.id} value={s.id}>{s.name} ({s.durationMinutes} min)</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField label="Duración custom (min)" type="number" value={manCustomDuration} onChange={e=>setManCustomDuration(e.target.value)} fullWidth />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField label="Cupos" type="number" value={manSlots} onChange={e=>setManSlots(Number(e.target.value||1))} fullWidth />
              </Grid>
            </Grid>

            <Button sx={{ mt: 2 }} variant="contained" disabled={!canCreateManual} onClick={createManualTurn}>
              Crear turno manual
            </Button>
          </Box>
        )}

        {/* Servicios flexibles */}
        {adminTab === 2 && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField label="Nombre del servicio" value={svcName} onChange={e=>setSvcName(e.target.value)} fullWidth />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField label="Duración (min)" type="number" value={svcDuration} onChange={e=>setSvcDuration(e.target.value)} fullWidth />
              </Grid>
              <Grid item xs={12} md={3}>
                <Button variant="contained" sx={{ height: "100%" }} onClick={addService}>Agregar</Button>
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            {services.length === 0 ? (
              <Typography color="text.secondary">Aún no hay servicios.</Typography>
            ) : (
              <Stack spacing={1}>
                {services.map(s => (
                  <Stack key={s.id} direction="row" spacing={2} alignItems="center">
                    <Typography sx={{ minWidth: 240 }}>{s.name}</Typography>
                    <Typography>{s.durationMinutes} min</Typography>
                    <IconButton onClick={() => removeService(s.id)} aria-label="Eliminar">
                      <DeleteOutlineIcon />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            )}

            <Button sx={{ mt: 2 }} variant="contained" onClick={saveServices}>Guardar cambios</Button>
          </Box>
        )}
      </Box>

      {/* Diálogo del turno */}
      <Dialog open={!!dialogTurn} onClose={() => setDialogTurn(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Turno</DialogTitle>
        <DialogContent dividers>
          {dialogTurn && (
            <>
              <Typography><strong>Fecha:</strong> {dialogTurn.date}</Typography>
              <Typography><strong>Hora:</strong> {dialogTurn.time}</Typography>
              {dialogTurn.serviceName && <Typography><strong>Servicio:</strong> {dialogTurn.serviceName}</Typography>}
              <Typography><strong>Duración:</strong> {Number(dialogTurn.durationMinutes || 60)} min</Typography>
              <Typography><strong>Cupos totales:</strong> {dialogTurn.slots}</Typography>
              <Typography><strong>Cupos disponibles:</strong> {dialogTurn.slotsAvailable ?? dialogTurn.slots}</Typography>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle1" sx={{ mb: 1 }}>Reservas</Typography>
              {(dialogTurn.reservations || []).length === 0 ? (
                <Typography color="text.secondary">Sin reservas.</Typography>
              ) : (
                <Stack spacing={1}>
                  {dialogTurn.reservations.map((r, i) => {
                    const label = reservationLabel(r, namesByUid); // nombre
                    return (
                      <Box key={i} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Typography>{label}</Typography>
                        <IconButton
                          aria-label="cancelar"
                          color="error"
                          size="small"
                          onClick={async () => {
                            await handleCancelReservation(dialogTurn, r);
                            const refreshed = turns.find(t => t.id === dialogTurn.id);
                            if (refreshed) setDialogTurn(refreshed);
                          }}
                        >
                          <PersonRemoveIcon />
                        </IconButton>
                      </Box>
                    );
                  })}
                </Stack>
              )}

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle1">Agregar reserva manual</Typography>
              <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                <TextField label="Nombre" size="small" value={manualName} onChange={(e) => setManualName(e.target.value)} />
                <Button variant="contained" onClick={async () => {
                  await handleAddManualReservation();
                  const refreshed = turns.find(t => t.id === dialogTurn.id);
                  if (refreshed) setDialogTurn(refreshed);
                }}>
                  Agregar
                </Button>
              </Box>

              <Typography variant="subtitle1" sx={{ mt: 2 }}>Agregar por email (cliente existente)</Typography>
              <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                <TextField label="Email del cliente" size="small" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                <Button variant="outlined" onClick={async () => {
                  await handleAddClientByEmail();
                  const refreshed = turns.find(t => t.id === dialogTurn.id);
                  if (refreshed) setDialogTurn(refreshed);
                }}>
                  Agregar
                </Button>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          {dialogTurn && (
            <Tooltip title="Quitar 1 cupo (si queda en 0, marca el turno como expirado)">
              <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={async () => {
                await handleDeleteSlot(dialogTurn);
                const refreshed = turns.find(t => t.id === dialogTurn.id);
                if (!refreshed) setDialogTurn(null); else setDialogTurn(refreshed);
              }}>
                Eliminar cupo
              </Button>
            </Tooltip>
          )}
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

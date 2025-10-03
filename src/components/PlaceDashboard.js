import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, query, where, onSnapshot, doc, getDocs, getDoc,
  updateDoc, runTransaction, addDoc, serverTimestamp, deleteDoc, orderBy, startAt, endAt
} from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  Box, Typography, Button, Grid, Card, CardContent, Divider, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Stack, Snackbar, Alert,
  Tabs, Tab, MenuItem, Switch, FormControlLabel, IconButton, Tooltip
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import AddIcon from "@mui/icons-material/Add";
import Autocomplete from "@mui/material/Autocomplete";

// Calendario
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import es from "date-fns/locale/es";
import "react-big-calendar/lib/css/react-big-calendar.css";


const locales = { es };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

const pad2 = (n) => String(n).padStart(2, "0");
const timeToDate = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00`);
const yyyymmdd = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

export function useCooldown(delay = 2500) { 
  const isCooling = useRef(false);

  const run = async (fn) => {
    if (isCooling.current) return; 
    isCooling.current = true;
    try {
      await fn();
    } finally {
      setTimeout(() => {
        isCooling.current = false;
      }, delay);
    }
  };

  return run;
}
function reservationLabel(r) {
  if (typeof r === "string") return "Ocupado";
  if (r && typeof r === "object") return r.name || "Ocupado";
  return "Ocupado";
}


export default function PlaceDashboard({ user }) {
  const navigate = useNavigate();
  const runWithCooldown = useCooldown(2500); // 2.5 segundos
  // Place
  const [placeId, setPlaceId] = useState(null);
  const [place, setPlace] = useState(null);
  const [placeName, setPlaceName] = useState("");

  // Datos
  const [turns, setTurns] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Dialog turno
  const [dialogTurn, setDialogTurn] = useState(null);

  // Reserva manual (nombre libre)
  const [manualName, setManualName] = useState("");

  // Autocomplete de usuario existente
  const [clientQuery, setClientQuery] = useState("");
  const [clientOptions, setClientOptions] = useState([]); // {uid, label, email}
  const [clientSelected, setClientSelected] = useState(null);
  const debounceRef = useRef(null);

  // Reserva manual (servicio/duración)
  const [manualServiceId, setManualServiceId] = useState("");
  const [manualOptionId, setManualOptionId] = useState("");
  const [manualDuration, setManualDuration] = useState("");

  // Notifs
  const [toast, setToast] = useState({ open: false, sev: "success", msg: "" });

  // Panel inferior
  const [adminTab, setAdminTab] = useState(0);

  // Config general
  const [schedulingMode, setSchedulingMode] = useState("fixed");
  const [depositPercent, setDepositPercent] = useState(0);

  // Servicios
  const [services, setServices] = useState([]);
  const [svcName, setSvcName] = useState("");
  const [optDuration, setOptDuration] = useState("");
  const [optPrice, setOptPrice] = useState("");
  const [svcToEdit, setSvcToEdit] = useState(null);

  // Fijos
  const [recFrom, setRecFrom] = useState("");
  const [recTo, setRecTo] = useState("");
  const [recStart, setRecStart] = useState("10:00");
  const [recEnd, setRecEnd] = useState("20:00");
  const [recInterval, setRecInterval] = useState(60);
  const [recSlots, setRecSlots] = useState(1);
  const [recDays, setRecDays] = useState({ 1:true, 2:true, 3:true, 4:true, 5:true, 0:false, 6:false });

  // Flex
  const [flexFrom, setFlexFrom] = useState("");
  const [flexTo, setFlexTo] = useState("");
  const [flexStart, setFlexStart] = useState("10:00");
  const [flexEnd, setFlexEnd] = useState("20:00");
  const [flexDays, setFlexDays] = useState({ 1:true, 2:true, 3:true, 4:true, 5:true, 0:false, 6:false });

  // Borrado
  const [delFrom, setDelFrom] = useState("");
  const [delTo, setDelTo] = useState("");

  // ---- Obtener lugar del dueño ----
  useEffect(() => {
    const fetchPlace = async () => {
      if (!user?.uid) return;
      try {
        const qOwner = query(collection(db, "places"), where("ownerId", "==", user.uid));
        const sOwner = await getDocs(qOwner);
        if (!sOwner.empty) {
          const d = sOwner.docs[0];
          const p = { id: d.id, ...d.data() };
          setPlaceId(d.id);
          setPlace(p);
          setPlaceName(p.name || "");
          setSchedulingMode(p.schedulingMode || (p.flexibleEnabled ? "flex" : "fixed"));
          setDepositPercent(Number(p.depositPercent || 0));
          setServices(p.services || []);
          return;
        }
        setToast({ open: true, sev: "error", msg: "No se encontró un lugar asociado a tu cuenta." });
      } catch (e) {
        setToast({ open: true, sev: "error", msg: "Error cargando tu lugar." });
      }
    };
    fetchPlace();
  }, [user]);

  // ---- Subscripción turnos ----
  useEffect(() => {
    if (!placeId) return;
    const qT = query(collection(db, "turnos"), where("placeId", "==", placeId));
    const unsubT = onSnapshot(qT, async (snap) => {
      const now = new Date();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Marcar completados
      for (const t of list) {
        if (!t?.date || !t?.time || t.status === "canceled" || t.status === "completed") continue;
        const start = timeToDate(t.date, t.time);
        const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
        if (end < now) {
          try { await updateDoc(doc(db, "turnos", t.id), { status: "completed" }); } catch {}
        }
      }

      // Orden
      list.sort((a,b) => (a.date + " " + (a.time||"")).localeCompare(b.date + " " + (b.time||"")));

      setTurns(list);
    });

    return () => { unsubT(); };
  }, [placeId]);

  // ---- Sincronizar el turno abierto en diálogo cuando cambia turns (FIX de UI) ----
  useEffect(() => {
    if (!dialogTurn) return;
    const updated = turns.find(t => t.id === dialogTurn.id);
    if (updated) setDialogTurn(updated);
  }, [turns, dialogTurn?.id]); // rehidrata el turno en el modal

  // Eventos calendario
  const events = useMemo(() => {
    return turns
      .filter(t => t?.date && t?.time && t.status !== "canceled")
      .map(t => {
        const start = timeToDate(t.date, t.time);
        const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
        const avail = Number(t.slotsAvailable ?? t.slots ?? 0);
        const title = avail > 0 ? "Disponible" : (reservationLabel((t.reservations || [])[0]));
        return { id: t.id, title, start, end, type: "turn", turn: t };
      });
  }, [turns]);

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

  const onSelectEvent = (ev) => {
    setSelectedDate(ev.start);
    setDialogTurn(ev.turn);
  };

  const dayAgenda = useMemo(() => {
    const dayStr = yyyymmdd(selectedDate);
    return turns
      .filter(t => t?.date === dayStr)
      .sort((a,b) => (a.time||"").localeCompare(b.time||""));
  }, [turns, selectedDate]);

  // Guardar configuración
  const saveGeneral = async () => {
    if (!placeId) return;
    try {
      await updateDoc(doc(db, "places", placeId), {
        schedulingMode,
        depositPercent: Number(depositPercent || 0),
        services
      });
      setPlace(p => p ? ({ ...p, schedulingMode, depositPercent: Number(depositPercent || 0), services }) : p);
      setToast({ open: true, sev: "success", msg: "Configuración guardada." });
    } catch {
      setToast({ open: true, sev: "error", msg: "No se pudo guardar." });
    }
  };

  // CRUD Servicios (igual que antes)
  const addService = () => {
    const name = (svcName || "").trim();
    if (!name) return;
    const id = `svc_${Date.now()}`;
    setServices(prev => [...prev, { id, name, options: [] }]);
    setSvcName("");
  };
  const addOptionToService = () => {
    if (!svcToEdit) return;
    const dur = Number(optDuration);
    const price = Number(optPrice);
    if (!dur || dur <= 0) return;
    const id = `opt_${Date.now()}`;
    setServices(prev => prev.map(s => s.id === svcToEdit
      ? { ...s, options: [ ...(s.options || []), { id, durationMinutes: dur, price }] }
      : s
    ));
    setOptDuration(""); setOptPrice("");
  };
  const deleteService = (sid) => {
    setServices(prev => prev.filter(s => s.id !== sid));
    if (svcToEdit === sid) setSvcToEdit(null);
  };
  const deleteOption = (sid, oid) => {
    setServices(prev => prev.map(s => s.id === sid
      ? { ...s, options: (s.options || []).filter(o => o.id !== oid) }
      : s
    ));
  };

  // Generar fijos
  const generateFixedTurns = async () => {
    if (!placeId || !recFrom || !recTo) return;
    try {
      let created = 0;
      const startDate = new Date(`${recFrom}T00:00:00`);
      const endDate = new Date(`${recTo}T00:00:00`);
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

          const existsQ = query(
            collection(db, "turnos"),
            where("placeId", "==", placeId),
            where("date", "==", date),
            where("time", "==", time)
          );
          const existSnap = await getDocs(existsQ);
          if (existSnap.empty) {
            await addDoc(collection(db, "turnos"), {
              placeId,
              placeName,
              date,
              time,
              dateTime: new Date(`${date}T${time}:00`).toISOString(),
              durationMinutes: Number(recInterval || 60),
              slots: Number(recSlots || 1),
              slotsAvailable: Number(recSlots || 1),
              reservations: [],
              reservationUids: [],
              status: "available",
              createdAt: serverTimestamp(),
              mode: "fixed"
            });
            created++;
          }
          cur = new Date(cur.getTime() + Number(recInterval || 60) * 60000);
        }
      }
      setToast({ open: true, sev: "success", msg: `Turnos fijos creados: ${created}` });
    } catch (e) {
      setToast({ open: true, sev: "error", msg: "No se pudieron generar los turnos." });
    }
  };

  const minStepFromServices = () => {
    const all = (services || []).flatMap(s => s.options || []).map(o => Number(o.durationMinutes || 0)).filter(n => n > 0);
    return all.length ? Math.min(...all) : 30;
  };

  const generateFlexTurns = async () => {
    if (!placeId || !flexFrom || !flexTo) return;
    const step = minStepFromServices();
    try {
      let created = 0;
      const startDate = new Date(`${flexFrom}T00:00:00`);
      const endDate = new Date(`${flexTo}T00:00:00`);
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (!flexDays[dow]) continue;

        const [sh, sm] = flexStart.split(":").map(Number);
        const [eh, em] = flexEnd.split(":").map(Number);
        let cur = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh, sm, 0);
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh, em, 0);
        while (cur < end) {
          const date = yyyymmdd(cur);
          const time = `${pad2(cur.getHours())}:${pad2(cur.getMinutes())}`;

          const existsQ = query(
            collection(db, "turnos"),
            where("placeId", "==", placeId),
            where("date", "==", date),
            where("time", "==", time)
          );
          const existSnap = await getDocs(existsQ);
          if (existSnap.empty) {
            await addDoc(collection(db, "turnos"), {
              placeId,
              placeName,
              date,
              time,
              dateTime: new Date(`${date}T${time}:00`).toISOString(),
              durationMinutes: step,
              slots: 1,
              slotsAvailable: 1,
              reservations: [],
              reservationUids: [],
              status: "available",
              createdAt: serverTimestamp(),
              mode: "flex"
            });
            created++;
          }
          cur = new Date(cur.getTime() + step * 60000);
        }
      }
      setToast({ open: true, sev: "success", msg: `Disponibilidad flexible creada: ${created} bloques` });
    } catch {
      setToast({ open: true, sev: "error", msg: "No se pudo generar la disponibilidad flexible." });
    }
  };

  // Publicar manual
  const [manDate, setManDate] = useState("");
  const [manTime, setManTime] = useState("");
  const [manServiceId, setManServiceId] = useState("");
  const [manOptionId, setManOptionId] = useState("");
  const [manDuration, setManDuration] = useState("");
  const [manSlots, setManSlots] = useState(1);

  const publishManualSlot = async () => {
    if (!placeId || !manDate || !manTime) return;
    try {
      let duration = Number(manDuration || 0);
      let mode = schedulingMode;
      if (schedulingMode === "flex") {
        const svc = (services || []).find(s => s.id === manServiceId);
        const opt = (svc?.options || []).find(o => o.id === manOptionId);
        const step = minStepFromServices();
        if (opt) duration = Number(opt.durationMinutes || step);
        if (!duration || duration <= 0) duration = step;
        duration = step; // publicar base
      } else {
        if (!duration || duration <= 0) duration = recInterval || 60;
      }

      const existsQ = query(
        collection(db, "turnos"),
        where("placeId", "==", placeId),
        where("date", "==", manDate),
        where("time", "==", manTime)
      );
      const existSnap = await getDocs(existsQ);
      if (!existSnap.empty) {
        setToast({ open: true, sev: "warning", msg: "Ya existe un turno en ese horario." });
        return;
      }

      await addDoc(collection(db, "turnos"), {
        placeId,
        placeName,
        date: manDate,
        time: manTime,
        dateTime: new Date(`${manDate}T${manTime}:00`).toISOString(),
        durationMinutes: Number(duration),
        slots: Number(manSlots || 1),
        slotsAvailable: Number(manSlots || 1),
        reservations: [],
        reservationUids: [],
        status: "available",
        createdAt: serverTimestamp(),
        mode
      });

      setManDate(""); setManTime(""); setManServiceId(""); setManOptionId(""); setManDuration(""); setManSlots(1);
      setToast({ open: true, sev: "success", msg: "Turno publicado." });
    } catch {
      setToast({ open: true, sev: "error", msg: "No se pudo publicar el turno." });
    }
  };

  // Borrar turnos
  const deleteAllTurns = async () => {
    if (!placeId) return;
    try {
      const qT = query(collection(db, "turnos"), where("placeId", "==", placeId));
      const snap = await getDocs(qT);
      for (const d of snap.docs) await deleteDoc(doc(db, "turnos", d.id));
      setToast({ open: true, sev: "success", msg: "Turnos eliminados." });
    } catch {
      setToast({ open: true, sev: "error", msg: "No se pudieron eliminar turnos." });
    }
  };

  const deleteTurnsByPeriod = async () => {
    if (!placeId || !delFrom || !delTo) return;
    try {
      const qT = query(collection(db, "turnos"), where("placeId", "==", placeId));
      const snap = await getDocs(qT);
      const from = new Date(`${delFrom}T00:00:00`);
      const to = new Date(`${delTo}T23:59:59`);
      const inRange = snap.docs.filter(d => {
        const t = d.data();
        if (!t?.date || !t?.time) return false;
        const dt = new Date(`${t.date}T${t.time}:00`);
        return dt >= from && dt <= to;
      });
      for (const d of inRange) await deleteDoc(doc(db, "turnos", d.id));
      setToast({ open: true, sev: "success", msg: "Turnos del período eliminados." });
    } catch {
      setToast({ open: true, sev: "error", msg: "No se pudieron eliminar turnos del período." });
    }
  };

  // Eliminar 1 slot
  const handleDeleteSlot = async (turn) => {
    try {
      const ref = doc(db, "turnos", turn.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const t = snap.data();
        if ((t.reservations || []).length > 0 && Number(t.slots) <= 1) {
          throw new Error("No podés eliminar el último slot porque hay reservas.");
        }
        const newTotal = Math.max(0, Number(t.slots ?? 0) - 1);
        const newAvail = Math.max(0, Math.min(newTotal, Number(t.slotsAvailable ?? 0) - 1));
        if (newTotal === 0) { await deleteDoc(ref); }
        else { tx.update(ref, { slots: newTotal, slotsAvailable: newAvail }); }
      });

      // Optimistic: si el diálogo muestra este turno, refrescar su copia
      if (dialogTurn?.id === turn.id) {
        const tNow = turns.find(t => t.id === turn.id);
        if (tNow) {
          const newCopy = { ...tNow, slots: Math.max(0, (tNow.slots || 0) - 1), slotsAvailable: Math.max(0, (tNow.slotsAvailable || 0) - 1) };
          setDialogTurn(newCopy);
        }
      }

      setToast({ open: true, sev: "success", msg: "Slot eliminado." });
    } catch (e) {
      setToast({ open: true, sev: "error", msg: e.message || "No se pudo eliminar el slot." });
    }
  };

  // Cancelar reserva
  const handleCancelReservation = async (turn, reservation) => {
    try {
      const result = await runTransaction(db, async (tx) => {
        const ref = doc(db, "turnos", turn.id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Turno inexistente");
        const t = snap.data();

        const placeRef = doc(db, "places", t.placeId);
        const pSnap = await tx.get(placeRef);
        const pData = pSnap.exists() ? pSnap.data() : {};

        const uid = typeof reservation === "string" ? reservation : (reservation?.uid || "");
        const oldRes = Array.isArray(t.reservations) ? t.reservations : [];
        const oldUids = Array.isArray(t.reservationUids) ? t.reservationUids : [];
        const reservations = oldRes.filter(r => (typeof r === "string" ? r : r?.uid) !== uid);
        const reservationUids = uid ? oldUids.filter(u => u !== uid) : oldUids;

        const newAvail = Number(t.slotsAvailable ?? t.slots ?? 0) + 1;

        const isFlex = (t.mode === "flex");
        const allOpts = (pData.services || []).flatMap(s => s.options || []);
        const step = Math.max(
          5,
          Math.min(...allOpts.map(o => Number(o.durationMinutes || 0)).filter(n => n > 0))
          || Number(t.durationMinutes || 30)
        );

        const needReconstruct =
          isFlex &&
          reservations.length === 0 &&
          Number(t.durationMinutes || step) > step;

        tx.update(ref, {
          reservations,
          reservationUids,
          slotsAvailable: newAvail,
          status: t.status === "completed" ? "completed" : "available"
        });

        if (needReconstruct) {
          const baseDate = t.date;
          const [hh, mm] = (t.time || "00:00").split(":").map(Number);
          const baseStartMs = new Date(`${baseDate}T${pad2(hh)}:${pad2(mm)}:00`).getTime();
          const dur = Number(t.durationMinutes || step);
          const extra = dur - step;
          const kMore = Math.ceil(extra / step);

          tx.update(ref, { durationMinutes: step });

          return {
            recreate: {
              placeId: t.placeId,
              placeName: t.placeName || "—",
              baseDate,
              baseStartMs,
              step,
              kMore,
              mode: "flex",
              turnId: turn.id
            }
          };
        }
        return { recreate: null, turnId: turn.id };
      });

      // Optimistic: reflejar de inmediato en el diálogo
      if (result?.turnId && dialogTurn?.id === result.turnId) {
        const tNow = turns.find(t => t.id === result.turnId);
        if (tNow) {
          const newRes = (tNow.reservations || []).filter(r => {
            const uid = typeof r === "string" ? r : r?.uid;
            return uid !== (typeof result.uid === "string" ? result.uid : result?.uid);
          });
          const newCopy = {
            ...tNow,
            reservations: newRes,
            slotsAvailable: (tNow.slotsAvailable || 0) + 1,
            durationMinutes: Math.min(tNow.durationMinutes || 60, tNow.durationMinutes || 60) // será rehidratado por snapshot
          };
          setDialogTurn(newCopy);
        }
      }

      // reconstrucción fuera de la tx
      if (result?.recreate) {
        const { placeId, placeName, baseDate, baseStartMs, step, kMore, mode } = result.recreate;
        for (let i = 1; i <= kMore; i++) {
          const start = new Date(baseStartMs + i * step * 60000);
          const hh2 = pad2(start.getHours());
          const mm2 = pad2(start.getMinutes());
          const timeStr = `${hh2}:${mm2}`;

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

      setToast({ open: true, sev: "success", msg: "Reserva cancelada." });
    } catch (e) {
      setToast({ open: true, sev: "error", msg: e.message || "No se pudo cancelar." });
    }
  };
  const handleCancelAllReservations = async (turn) => {
  try {
    if (!window.confirm("¿Seguro que querés cancelar todas las reservas de este turno?")) return;

    const turnRef = doc(db, "turnos", turn.id); // usar la colección correcta
    await updateDoc(turnRef, { 
      reservations: [],
      reservationUids: [],
      slotsAvailable: Number(turn.slots || 0), // restaurar la disponibilidad
      status: "available"
    });

    setToast({ open: true, sev: "success", msg: "Se cancelaron todas las reservas." });
  } catch (err) {
    console.error(err);
    setToast({ open: true, sev: "error", msg: "No se pudieron cancelar las reservas." });
  }
};



  // Agregar reserva manual (nombre libre)
  const handleAddManualReservation = async () => {
    try {
      const name = (manualName || "").trim();
      if (!dialogTurn || !name) return;

      let durationMinutes = Number(manualDuration || 0);
      let price = 0;
      let serviceName = null;

      if (manualServiceId) {
        const svc = (services || []).find(s => s.id === manualServiceId);
        serviceName = svc?.name || null;
        const opt = (svc?.options || []).find(o => o.id === manualOptionId);
        if (opt) {
          durationMinutes = Number(opt.durationMinutes || durationMinutes || 60);
          price = Number(opt.price || 0);
        }
      }
      if (!durationMinutes || durationMinutes <= 0) {
        durationMinutes = Number(dialogTurn.durationMinutes || 60);
      }

      const ref = doc(db, "turnos", dialogTurn.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Turno inexistente");
        const t = snap.data();

        const avail = Number(t.slotsAvailable ?? 0);
        if (avail <= 0) throw new Error("No hay cupos disponibles");

        const reservations = Array.isArray(t.reservations) ? [...t.reservations] : [];
        reservations.push({
          uid: `manual-${Date.now()}`,
          name,
          serviceId: manualServiceId || null,
          serviceName,
          optionId: manualOptionId || null,
          durationMinutes,
          price
        });

        tx.update(ref, {
          reservations,
          slotsAvailable: avail - 1,
          durationMinutes: Math.max(Number(t.durationMinutes || 60), durationMinutes)
        });
      });

      setManualName("");
      setManualServiceId("");
      setManualOptionId("");
      setManualDuration("");
      setToast({ open: true, sev: "success", msg: "Reserva manual agregada." });
    } catch (e) {
      setToast({ open: true, sev: "error", msg: e.message || "No se pudo agregar la reserva." });
    }
  };

  // ---- Autocomplete: buscar usuarios por emailLower (prefijo) ----
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const term = (clientQuery || "").trim().toLowerCase();
      if (!term) { setClientOptions([]); return; }
      try {
        // Necesita campo emailLower en users
        const qU = query(
          collection(db, "users"),
          orderBy("emailLower"),
          startAt(term),
          endAt(term + "\uf8ff")
        );
        const sU = await getDocs(qU);
        const opts = sU.docs.slice(0, 8).map(d => {
          const u = d.data();
          return {
            uid: u.userId || d.id,
            email: u.email || "",
            name: u.name || u.fullName || u.displayName || u.email || "",
            label: `${(u.name || u.fullName || u.displayName || u.email || "").toString()} — ${(u.email || "").toString()}`
          };
        });
        setClientOptions(opts);
      } catch {
        setClientOptions([]);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [clientQuery]);

  const handleAddClientByEmail = async () => {
    try {
      if (!dialogTurn) return;

      let uid = null;
      let name = null;
      if (clientSelected?.uid) {
        uid = clientSelected.uid;
        name = clientSelected.name || clientSelected.email;
      } else {
        const term = (clientQuery || "").trim().toLowerCase();
        if (!term) throw new Error("Ingresá un email");
        const qExact = query(collection(db, "users"), where("emailLower", "==", term));
        const sExact = await getDocs(qExact);
        if (sExact.empty) throw new Error("No se encontró un usuario con ese email.");
        const u = { id: sExact.docs[0].id, ...sExact.docs[0].data() };
        uid = u.userId || sExact.docs[0].id;
        name = u.name || u.fullName || u.displayName || u.email || term;
      }

      const ref = doc(db, "turnos", dialogTurn.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Turno inexistente");
        const t = snap.data();

        const avail = Number(t.slotsAvailable ?? 0);
        if (avail <= 0) throw new Error("No hay cupos disponibles");

        const oldRes = Array.isArray(t.reservations) ? t.reservations : [];
        const oldUids = Array.isArray(t.reservationUids) ? t.reservationUids : [];
        const already = oldRes.some(r => (typeof r === "string" ? r : r?.uid) === uid) || oldUids.includes(uid);
        if (already) throw new Error("Ese usuario ya reservó este turno.");

        const reservations = [...oldRes, { uid, name }];
        const reservationUids = oldUids.includes(uid) ? oldUids : [...oldUids, uid];
        tx.update(ref, { reservations, reservationUids, slotsAvailable: avail - 1 });
      });

      setClientSelected(null);
      setClientQuery("");
      setToast({ open: true, sev: "success", msg: "Reserva agregada al cliente." });
    } catch (e) {
      setToast({ open: true, sev: "error", msg: e.message || "No se pudo agregar la reserva." });
    }
  };

  // UI
  const styles = {
    container: { p: 3, minHeight: "100vh", background: "linear-gradient(135deg, #4e54c8, #8f94fb)", color: "#fff" },
    headerBar: { display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 },
    panel: { background: "#fff", color: "#000", borderRadius: 12, padding: 12 },
    agendaCard: { borderRadius: 10, background: "#f7f7ff" },
    chip: { mr: 0.5, mt: 0.5 }
  };

  if (!place) return <Box sx={{ p: 3 }}>Cargando…</Box>;

  return (
    <Box sx={styles.container}>
      <Box sx={styles.headerBar}>
        <Box>
          <Typography variant="h4">Panel del Lugar</Typography>
          <Typography variant="subtitle1" sx={{ opacity: 0.9 }}>{placeName || "—"}</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" color="warning" sx={{ fontWeight: 700 }} onClick={() => navigate("/place-profile")}>
            Editar perfil
          </Button>
          <Button variant="contained" color="secondary" onClick={async()=>{ await signOut(auth); navigate("/"); }}>
            Cerrar sesión
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Box sx={styles.panel}>
            <Typography variant="subtitle2" sx={{ mb: 1, opacity: 0.8 }}>
              Verde: Disponible — Rojo: Ocupado/Completo
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
              onSelectEvent={(e)=>{ onSelectEvent(e); }}
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
                  const booked = Array.isArray(t.reservations) ? t.reservations.length : 0;
                  const full = avail <= 0;
                  const title = full ? reservationLabel((t.reservations || [])[0]) : "Disponible";
                  return (
                    <Card key={t.id} variant="outlined" sx={styles.agendaCard}>
                      <CardContent sx={{ pb: 1.5 }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t.time}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {title} · {full ? `Reservas: ${booked}` : `Disponibles: ${avail}`} · {t.mode || "fixed"} · {t.durationMinutes || 60} min
                            </Typography>
                          </Box>
                          <Button size="small" variant="contained" onClick={() => setDialogTurn(t)}>Ver</Button>
                        </Box>
                        <Box sx={{ mt: 1 }}>
                          {(t.reservations || []).map((r, idx) => (
                            <Chip key={idx} label={reservationLabel(r)} size="small" sx={styles.chip} />
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

      <Box sx={{ mt: 2, ...styles.panel }}>
        <Tabs value={adminTab} onChange={(_, v) => setAdminTab(v)}>
          <Tab label="Configuración" />
          <Tab label="Turnos fijos" />
          <Tab label="Turnos flexibles" />
          <Tab label="Publicar manual" />
          <Tab label="Borrar turnos" />
        </Tabs>

        {adminTab === 0 && (
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={schedulingMode === "flex"}
                  onChange={(e) => setSchedulingMode(e.target.checked ? "flex" : "fixed")}
                />
              }
              label={schedulingMode === "flex" ? "Modo flexible" : "Modo fijo"}
            />
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Seña (%)"
                  type="number"
                  value={depositPercent}
                  onChange={(e)=> setDepositPercent(Number(e.target.value || 0))}
                  fullWidth
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            <Typography variant="h6">Servicios</Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
              <TextField label="Nombre del servicio" value={svcName} onChange={(e)=> setSvcName(e.target.value)} />
              <Button variant="contained" startIcon={<AddIcon />} onClick={addService}>Agregar servicio</Button>
            </Box>

            <Stack spacing={2} sx={{ mt: 2 }}>
              {services.length === 0 && <Typography color="text.secondary">Aún no hay servicios.</Typography>}
              {services.map(s => (
                <Box key={s.id} sx={{ border: "1px solid #eee", borderRadius: 2, p: 2 }}>
                  <Box sx={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{s.name}</Typography>
                    <Box>
                      <Button size="small" onClick={()=> setSvcToEdit(s.id)}>Editar</Button>
                      <Button size="small" color="error" onClick={()=> deleteService(s.id)}>Eliminar</Button>
                    </Box>
                  </Box>

                  {svcToEdit === s.id && (
                    <Box sx={{ mt: 1, display:"flex", gap:1, flexWrap:"wrap" }}>
                      <TextField label="Duración (min)" value={optDuration} onChange={(e)=> setOptDuration(e.target.value)} type="number" />
                      <TextField label="Precio" value={optPrice} onChange={(e)=> setOptPrice(e.target.value)} type="number" />
                      <Button variant="contained" onClick={addOptionToService}>Agregar opción</Button>
                    </Box>
                  )}

                  <Box sx={{ mt: 1, display:"flex", gap:1, flexWrap:"wrap" }}>
                    {(s.options || []).map(o => (
                      <Chip
                        key={o.id}
                        label={`${o.durationMinutes} min · $${o.price}`}
                        onDelete={()=> deleteOption(s.id, o.id)}
                        variant="outlined"
                        sx={{ mr:1, mt:1 }}
                      />
                    ))}
                  </Box>
                </Box>
              ))}
            </Stack>

            <Box sx={{ mt: 2 }}>
              <Button variant="contained" onClick={saveGeneral}>Guardar configuración</Button>
            </Box>
          </Box>
        )}

        {adminTab === 1 && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField label="Desde (YYYY-MM-DD)" value={recFrom} onChange={(e)=> setRecFrom(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Hasta (YYYY-MM-DD)" value={recTo} onChange={(e)=> setRecTo(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={2}><TextField label="Inicio" value={recStart} onChange={(e)=> setRecStart(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={2}><TextField label="Fin" value={recEnd} onChange={(e)=> setRecEnd(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={1}><TextField label="Cada (min)" type="number" value={recInterval} onChange={(e)=> setRecInterval(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={1}><TextField label="Cupos" type="number" value={recSlots} onChange={(e)=> setRecSlots(e.target.value)} fullWidth /></Grid>
            </Grid>
            <Box sx={{ mt: 1 }}>
              {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map((d,idx)=>(
                <FormControlLabel
                  key={idx}
                  control={<Switch checked={!!recDays[idx]} onChange={(e)=> setRecDays(prev=>({...prev, [idx]: e.target.checked}))} />}
                  label={d} sx={{ mr:1 }}
                />
              ))}
            </Box>
            <Button variant="contained" onClick={generateFixedTurns} sx={{ mt:1 }}>Generar turnos fijos</Button>
          </Box>
        )}

        {adminTab === 2 && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField label="Desde (YYYY-MM-DD)" value={flexFrom} onChange={(e)=> setFlexFrom(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Hasta (YYYY-MM-DD)" value={flexTo} onChange={(e)=> setFlexTo(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={2}><TextField label="Inicio" value={flexStart} onChange={(e)=> setFlexStart(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={2}><TextField label="Fin" value={flexEnd} onChange={(e)=> setFlexEnd(e.target.value)} fullWidth /></Grid>
            </Grid>
            <Box sx={{ mt: 1 }}>
              {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map((d,idx)=>(
                <FormControlLabel
                  key={idx}
                  control={<Switch checked={!!flexDays[idx]} onChange={(e)=> setFlexDays(prev=>({...prev, [idx]: e.target.checked}))} />}
                  label={d} sx={{ mr:1 }}
                />
              ))}
            </Box>
            <Button variant="contained" onClick={generateFlexTurns} sx={{ mt:1 }}>Generar disponibilidad flexible</Button>
          </Box>
        )}

        {adminTab === 3 && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField label="Fecha (YYYY-MM-DD)" value={manDate} onChange={(e)=> setManDate(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={2}><TextField label="Hora (HH:mm)" value={manTime} onChange={(e)=> setManTime(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={2}><TextField label="Duración (min)" value={manDuration} onChange={(e)=> setManDuration(e.target.value)} type="number" fullWidth /></Grid>
              <Grid item xs={12} md={2}><TextField label="Cupos" value={manSlots} onChange={(e)=> setManSlots(e.target.value)} type="number" fullWidth /></Grid>
              <Grid item xs={12} md={3}>
                <TextField select label="Servicio (opcional)" value={manServiceId} onChange={(e)=> setManServiceId(e.target.value)} fullWidth>
                  <MenuItem value="">(ninguno)</MenuItem>
                  {(services||[]).map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </TextField>
              </Grid>
              {manServiceId && (
                <Grid item xs={12} md={3}>
                  <TextField select label="Opción (opcional)" value={manOptionId} onChange={(e)=> setManOptionId(e.target.value)} fullWidth>
                    <MenuItem value="">(ninguna)</MenuItem>
                    {(services.find(s=>s.id===manServiceId)?.options||[]).map(o =>
                      <MenuItem key={o.id} value={o.id}>{o.durationMinutes} min · ${o.price}</MenuItem>
                    )}
                  </TextField>
                </Grid>
              )}
            </Grid>
            <Button variant="contained" onClick={publishManualSlot} sx={{ mt:1 }}>Publicar</Button>
          </Box>
        )}

        {adminTab === 4 && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField label="Desde (YYYY-MM-DD)" value={delFrom} onChange={(e)=> setDelFrom(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Hasta (YYYY-MM-DD)" value={delTo} onChange={(e)=> setDelTo(e.target.value)} fullWidth /></Grid>
            </Grid>
            <Box sx={{ display:"flex", gap:1, mt:1, flexWrap:"wrap" }}>
              <Button variant="outlined" color="error" startIcon={<DeleteForeverIcon />} onClick={deleteAllTurns}>Borrar todos</Button>
              <Button variant="contained" color="error" startIcon={<DeleteOutlineIcon />} onClick={deleteTurnsByPeriod}>Borrar por período</Button>
            </Box>
          </Box>
        )}
      </Box>

      {/* Modal Turno */}
      <Dialog open={!!dialogTurn} onClose={()=> setDialogTurn(null)} fullWidth maxWidth="md">
        <DialogTitle>Turno {dialogTurn?.time} — {dialogTurn?.date}</DialogTitle>
        <DialogContent dividers>
          {dialogTurn && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {dialogTurn.mode || "fixed"} · {dialogTurn.durationMinutes || 60} min · Disponibles: {Number(dialogTurn.slotsAvailable ?? dialogTurn.slots ?? 0)}
              </Typography>

              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Reservas</Typography>
              <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 2 }}>
                {(dialogTurn.reservations || []).length === 0 && <Chip label="Sin reservas" />}
                {(dialogTurn.reservations || []).map((r, idx) => (
                  <Box key={idx} sx={{ display:"flex", alignItems:"center", gap:1 }}>
                    <Chip label={reservationLabel(r)} />
                    <Tooltip title="Quitar">
                      <IconButton size="small" onClick={() => runWithCooldown(() => handleCancelReservation(dialogTurn, r))}>
                        <PersonRemoveIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
              </Stack>

              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" sx={{ mt:1 }}>Agregar reserva manual (nombre)</Typography>
              <Box sx={{ display:"flex", gap:1, mt:1, flexWrap:"wrap" }}>
                <TextField label="Nombre" value={manualName} onChange={(e)=> setManualName(e.target.value)} />
                <TextField
                  select label="Servicio (opcional)" value={manualServiceId} onChange={(e)=> { setManualServiceId(e.target.value); setManualOptionId(""); }}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">(ninguno)</MenuItem>
                  {(services||[]).map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </TextField>
                {manualServiceId && (
                  <TextField
                    select label="Opción (opcional)" value={manualOptionId} onChange={(e)=> setManualOptionId(e.target.value)}
                    sx={{ minWidth: 220 }}
                  >
                    <MenuItem value="">(ninguna)</MenuItem>
                    {(services.find(s=>s.id===manualServiceId)?.options||[]).map(o =>
                      <MenuItem key={o.id} value={o.id}>{o.durationMinutes} min · ${o.price}</MenuItem>
                    )}
                  </TextField>
                )}
                <TextField label="Duración (min, si querés forzar)" value={manualDuration} onChange={(e)=> setManualDuration(e.target.value)} type="number" />
                <Button variant="contained"onClick={() => runWithCooldown(handleAddManualReservation)}>Agregar</Button>
              </Box>

              <Typography variant="subtitle1" sx={{ mt:2 }}>Agregar reserva a usuario existente</Typography>
              <Box sx={{ display:"flex", gap:1, mt:1, flexWrap:"wrap", alignItems:"center" }}>
                <Autocomplete
                  sx={{ minWidth: 360 }}
                  options={clientOptions}
                  autoHighlight
                  getOptionLabel={(opt)=> opt?.label || ""}
                  filterOptions={(x)=> x} // no filtrar en cliente
                  value={clientSelected}
                  onChange={(_, val)=> setClientSelected(val)}
                  inputValue={clientQuery}
                  onInputChange={(_, val)=> { setClientSelected(null); setClientQuery(val); }}
                  renderInput={(params) => <TextField {...params} label="Buscar por email o nombre" placeholder="ej: juan@..." />}
                />
                <Button variant="contained" onClick={() => runWithCooldown(handleAddClientByEmail)}>Agregar</Button>
              </Box>

              <Divider sx={{ my: 2 }} />
              <Typography variant="caption" color="text.secondary">
                Tip: el diálogo se actualiza en vivo con cambios. Si otro admin edita a la vez, se sincroniza automáticamente.
              </Typography>
            </>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button
      variant="outlined"
      color="error"
      startIcon={<DeleteForeverIcon />}
      onClick={() => runWithCooldown(() => handleCancelAllReservations(dialogTurn))}
    >
      Cancelar todas las reservas
    </Button>

  

          <Button onClick={()=> setDialogTurn(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3200} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.sev} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
}

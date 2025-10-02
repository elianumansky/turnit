// src/components/PlaceDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection, query, where, onSnapshot, doc, getDocs, getDoc,
  updateDoc, runTransaction, addDoc, serverTimestamp, deleteDoc
} from "firebase/firestore";
import { db } from "../firebase";
import {
  Box, Typography, Button, Grid, Card, CardContent, Divider, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Stack, IconButton, Tooltip,
  Snackbar, Alert, Tabs, Tab, MenuItem, Switch, FormControlLabel
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { getAuth, signOut as fbSignOut } from "firebase/auth";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import AddIcon from "@mui/icons-material/Add";

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

function reservationLabel(r) {
  if (typeof r === "string") return "Ocupado";
  if (r && typeof r === "object") return r.name || "Ocupado";
  return "Ocupado";
}

export default function PlaceDashboard({ user }) {
  const navigate = useNavigate();

  // Place
  const [placeId, setPlaceId] = useState(null);
  const [place, setPlace] = useState(null);
  const [placeName, setPlaceName] = useState("");

  // Datos
  const [turns, setTurns] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Dialog turno
  const [dialogTurn, setDialogTurn] = useState(null);
  const [manualName, setManualName] = useState("");
  const [clientEmailLocal, setClientEmailLocal] = useState("");

  // Reserva manual (servicio/duración)
  const [manualServiceId, setManualServiceId] = useState("");
  const [manualOptionId, setManualOptionId] = useState("");
  const [manualDuration, setManualDuration] = useState("");

  // Notifs
  const [toast, setToast] = useState({ open: false, sev: "success", msg: "" });

  // Panel inferior
  const [adminTab, setAdminTab] = useState(0); // 0: Configuración, 1: Fijos, 2: Flex, 3: Publicar manual, 4: Borrar

  // Estados generales de configuración
  const [schedulingMode, setSchedulingMode] = useState("fixed"); // "fixed" | "flex"
  const [depositPercent, setDepositPercent] = useState(0);

  // Servicios (con opciones)
  const [services, setServices] = useState([]);
  const [svcName, setSvcName] = useState("");
  const [optDuration, setOptDuration] = useState("");
  const [optPrice, setOptPrice] = useState("");
  const [svcToEdit, setSvcToEdit] = useState(null);

  // Turnos fijos (generación)
  const [recFrom, setRecFrom] = useState("");
  const [recTo, setRecTo] = useState("");
  const [recStart, setRecStart] = useState("10:00");
  const [recEnd, setRecEnd] = useState("20:00");
  const [recInterval, setRecInterval] = useState(60);
  const [recSlots, setRecSlots] = useState(1);
  const [recDays, setRecDays] = useState({ 1:true, 2:true, 3:true, 4:true, 5:true, 0:false, 6:false });

  // Turnos flexibles (generación base por step)
  const [flexFrom, setFlexFrom] = useState("");
  const [flexTo, setFlexTo] = useState("");
  const [flexStart, setFlexStart] = useState("10:00");
  const [flexEnd, setFlexEnd] = useState("20:00");
  const [flexDays, setFlexDays] = useState({ 1:true, 2:true, 3:true, 4:true, 5:true, 0:false, 6:false });

  // Publicar turno manual
  const [manDate, setManDate] = useState("");
  const [manTime, setManTime] = useState("");
  const [manServiceId, setManServiceId] = useState("");
  const [manOptionId, setManOptionId] = useState("");
  const [manDuration, setManDuration] = useState("");
  const [manSlots, setManSlots] = useState(1);

  // Borrado por período
  const [delFrom, setDelFrom] = useState("");
  const [delTo, setDelTo] = useState("");

  // ---------------- Obtener lugar (dueño) ----------------
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

  // ---------------- Subscripción turnos ----------------
  useEffect(() => {
    if (!placeId) return;
    const qT = query(collection(db, "turnos"), where("placeId", "==", placeId));
    const unsubT = onSnapshot(qT, async (snap) => {
      const now = new Date();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // marcar completados (no cancelar)
      for (const t of list) {
        if (!t?.date || !t?.time || t.status === "canceled" || t.status === "completed") continue;
        const start = timeToDate(t.date, t.time);
        const end = new Date(start.getTime() + Number(t.durationMinutes || 60) * 60000);
        if (end < now) {
          try { await updateDoc(doc(db, "turnos", t.id), { status: "completed" }); } catch {}
        }
      }

      setTurns(
        list.sort((a, b) => {
          const sa = a.date + " " + (a.time || "00:00");
          const sb = b.date + " " + (b.time || "00:00");
          return sa.localeCompare(sb);
        })
      );
    });

    return () => { unsubT(); };
  }, [placeId]);

  // ---------------- Eventos calendario ----------------
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
    // limpiar selects al abrir
    setManualServiceId("");
    setManualOptionId("");
    setManualDuration("");
    setManualName("");
    setClientEmailLocal("");
  };

  const dayAgenda = useMemo(() => {
    const dayStr = yyyymmdd(selectedDate);
    return turns
      .filter(t => t?.date === dayStr)
      .sort((a,b) => (a.time||"").localeCompare(b.time||""));
  }, [turns, selectedDate]);

  // ---------------- Guardar configuración general ----------------
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

  // ---------------- Servicios (CRUD local) ----------------
  const addService = () => {
    const name = svcName.trim();
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
    setOptDuration("");
    setOptPrice("");
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

  // ---------------- Utilidades ----------------
  const minStepFromServices = () => {
    const all = (services || []).flatMap(s => s.options || []).map(o => Number(o.durationMinutes || 0)).filter(n => n > 0);
    return all.length ? Math.min(...all) : 30;
  };

  // ---------------- Generar turnos fijos ----------------
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
    } catch {
      setToast({ open: true, sev: "error", msg: "No se pudieron generar los turnos." });
    }
  };

  // ---------------- Generar disponibilidad flexible ----------------
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

  // ---------------- Publicar turno manual ----------------
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
        // disponibilidad base conviene en step
        duration = step;
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

  // ---------------- Borrar turnos ----------------
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

  // ---------------- Acciones sobre turno ----------------
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
      setToast({ open: true, sev: "success", msg: "Slot eliminado." });
    } catch (e) {
      setToast({ open: true, sev: "error", msg: e.message || "No se pudo eliminar el slot." });
    }
  };

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

        // Escribir cancelación
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

          // Encoger bloque principal
          tx.update(ref, { durationMinutes: step });

          return {
            recreate: {
              placeId: t.placeId,
              placeName: t.placeName || "—",
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

          // evitar duplicados concurrentes
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

  // Agregar reserva manual (por nombre)
  const handleAddManualReservation = async () => {
    try {
      const name = manualName.trim();
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

  // Agregar reserva por email (usuario existente) — con servicio/opción/duración
  const handleAddClientByEmail = async () => {
    try {
      const email = (clientEmailLocal || "").trim().toLowerCase();
      if (!dialogTurn || !email) return;

      const qU = query(collection(db, "users"), where("email", "==", email));
      const sU = await getDocs(qU);
      if (sU.empty) throw new Error("No se encontró un usuario con ese email.");
      const u = { id: sU.docs[0].id, ...sU.docs[0].data() };
      const uid = u.userId || sU.docs[0].id;

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

        const oldRes = Array.isArray(t.reservations) ? t.reservations : [];
        const oldUids = Array.isArray(t.reservationUids) ? t.reservationUids : [];
        const already = oldRes.some(r => (typeof r === "string" ? r : r?.uid) === uid) || oldUids.includes(uid);
        if (already) throw new Error("Ese usuario ya reservó este turno.");

        const reservations = [
          ...oldRes,
          {
            uid,
            name: u.name || u.fullName || u.displayName || email,
            serviceId: manualServiceId || null,
            serviceName,
            optionId: manualOptionId || null,
            durationMinutes,
            price
          }
        ];
        const reservationUids = oldUids.includes(uid) ? oldUids : [...oldUids, uid];

        tx.update(ref, {
          reservations,
          reservationUids,
          slotsAvailable: avail - 1,
          durationMinutes: Math.max(Number(t.durationMinutes || 60), durationMinutes)
        });
      });

      setClientEmailLocal("");
      setManualServiceId("");
      setManualOptionId("");
      setManualDuration("");
      setToast({ open: true, sev: "success", msg: "Reserva agregada al cliente." });
    } catch (e) {
      setToast({ open: true, sev: "error", msg: e.message || "No se pudo agregar la reserva." });
    }
  };

  // ---------------- UI ----------------
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
          <Button
            variant="contained"
            color="secondary"
            onClick={async () => {
              try { await fbSignOut(getAuth()); navigate("/"); } catch (e) { console.error(e); }
            }}
          >
            Cerrar sesión
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2}>
        {/* Calendario */}
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

      {/* Panel inferior */}
      <Box sx={{ mt: 2, ...styles.panel }}>
        <Tabs value={adminTab} onChange={(_, v) => setAdminTab(v)}>
          <Tab label="Configuración" />
          <Tab label="Turnos fijos" />
          <Tab label="Turnos flexibles" />
          <Tab label="Publicar manual" />
          <Tab label="Borrar turnos" />
        </Tabs>

        {/* Configuración */}
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
                  <Box sx={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{s.name}</Typography>
                    <Box>
                      <Tooltip title="Eliminar servicio"><IconButton onClick={()=> deleteService(s.id)}><DeleteForeverIcon /></IconButton></Tooltip>
                    </Box>
                  </Box>

                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2">Opciones</Typography>
                  <Stack direction="row" gap={1} sx={{ flexWrap:"wrap", mt: 1 }}>
                    {(s.options || []).map(o => (
                      <Chip
                        key={o.id}
                        label={`${o.durationMinutes} min — $${o.price || 0}`}
                        onDelete={()=> deleteOption(s.id, o.id)}
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </Stack>

                  <Box sx={{ display:"flex", gap:1, mt:1, flexWrap:"wrap" }}>
                    <TextField
                      select label="Editar" value={svcToEdit || ""}
                      onChange={(e)=> setSvcToEdit(e.target.value)}
                      size="small"
                      sx={{ minWidth: 200 }}
                    >
                      <MenuItem value="">(Elegir servicio)</MenuItem>
                      {services.map(ss => <MenuItem key={ss.id} value={ss.id}>{ss.name}</MenuItem>)}
                    </TextField>
                    <TextField
                      size="small" type="number" label="Duración (min)" value={optDuration}
                      onChange={(e)=> setOptDuration(e.target.value)} sx={{ width: 160 }}
                    />
                    <TextField
                      size="small" type="number" label="Precio" value={optPrice}
                      onChange={(e)=> setOptPrice(e.target.value)} sx={{ width: 160 }}
                    />
                    <Button variant="outlined" onClick={addOptionToService}>Agregar opción</Button>
                    <Button variant="contained" onClick={saveGeneral}>Guardar configuración</Button>
                  </Box>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* Turnos fijos */}
        {adminTab === 1 && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField label="Desde" type="date" value={recFrom} onChange={(e)=> setRecFrom(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Hasta" type="date" value={recTo} onChange={(e)=> setRecTo(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Inicio" type="time" value={recStart} onChange={(e)=> setRecStart(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Fin" type="time" value={recEnd} onChange={(e)=> setRecEnd(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Intervalo (min)" type="number" value={recInterval} onChange={(e)=> setRecInterval(Number(e.target.value || 60))} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Cupos por slot" type="number" value={recSlots} onChange={(e)=> setRecSlots(Number(e.target.value || 1))} fullWidth /></Grid>
            </Grid>

            <Box sx={{ mt: 1, display:"flex", gap:1, flexWrap:"wrap" }}>
              {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map((d, idx) => {
                const realIdx = idx === 0 ? 0 : idx; // 0..6
                return (
                  <Chip
                    key={d}
                    label={d}
                    color={recDays[realIdx] ? "success" : "default"}
                    onClick={()=> setRecDays(prev => ({ ...prev, [realIdx]: !prev[realIdx] }))}
                  />
                );
              })}
            </Box>

            <Box sx={{ mt: 2 }}>
              <Button variant="contained" onClick={generateFixedTurns}>Generar turnos fijos</Button>
            </Box>
          </Box>
        )}

        {/* Turnos flexibles */}
        {adminTab === 2 && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField label="Desde" type="date" value={flexFrom} onChange={(e)=> setFlexFrom(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Hasta" type="date" value={flexTo} onChange={(e)=> setFlexTo(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Inicio" type="time" value={flexStart} onChange={(e)=> setFlexStart(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Fin" type="time" value={flexEnd} onChange={(e)=> setFlexEnd(e.target.value)} fullWidth /></Grid>
            </Grid>

            <Box sx={{ mt: 1, display:"flex", gap:1, flexWrap:"wrap" }}>
              {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map((d, idx) => {
                const realIdx = idx === 0 ? 0 : idx;
                return (
                  <Chip
                    key={d}
                    label={d}
                    color={flexDays[realIdx] ? "success" : "default"}
                    onClick={()=> setFlexDays(prev => ({ ...prev, [realIdx]: !prev[realIdx] }))}
                  />
                );
              })}
            </Box>

            <Box sx={{ mt: 2 }}>
              <Button variant="contained" onClick={generateFlexTurns}>Generar disponibilidad flexible</Button>
            </Box>
          </Box>
        )}

        {/* Publicar manual */}
        {adminTab === 3 && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField label="Fecha" type="date" value={manDate} onChange={(e)=> setManDate(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Hora" type="time" value={manTime} onChange={(e)=> setManTime(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}>
                <TextField select label="Servicio (flex opcional)" value={manServiceId} onChange={(e)=> { setManServiceId(e.target.value); setManOptionId(""); }} fullWidth>
                  <MenuItem value="">(Sin servicio)</MenuItem>
                  {(services || []).map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField select label="Opción (flex)" value={manOptionId} onChange={(e)=> setManOptionId(e.target.value)} fullWidth disabled={!manServiceId}>
                  <MenuItem value="">(Elegir)</MenuItem>
                  {(services.find(s=>s.id===manServiceId)?.options || []).map(o => (
                    <MenuItem key={o.id} value={o.id}>{o.durationMinutes} min — ${o.price || 0}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={3}><TextField label="Duración (min)" type="number" value={manDuration} onChange={(e)=> setManDuration(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Cupos" type="number" value={manSlots} onChange={(e)=> setManSlots(Number(e.target.value || 1))} fullWidth /></Grid>
            </Grid>
            <Box sx={{ mt: 2 }}>
              <Button variant="contained" onClick={publishManualSlot}>Publicar</Button>
            </Box>
          </Box>
        )}

        {/* Borrar turnos */}
        {adminTab === 4 && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display:"flex", gap:1, flexWrap:"wrap" }}>
              <Button variant="contained" color="error" onClick={deleteAllTurns} startIcon={<DeleteOutlineIcon />}>
                Borrar TODOS los turnos
              </Button>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField label="Desde" type="date" value={delFrom} onChange={(e)=> setDelFrom(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><TextField label="Hasta" type="date" value={delTo} onChange={(e)=> setDelTo(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={3}><Button variant="outlined" color="error" onClick={deleteTurnsByPeriod}>Borrar por período</Button></Grid>
            </Grid>
          </Box>
        )}
      </Box>

      {/* Dialog Turno */}
      <Dialog open={!!dialogTurn} onClose={()=> setDialogTurn(null)} maxWidth="md" fullWidth>
        <DialogTitle>Turno — {dialogTurn?.date} {dialogTurn?.time}</DialogTitle>
        <DialogContent dividers>
          {dialogTurn && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Modo: {dialogTurn.mode || "fixed"} · Duración: {dialogTurn.durationMinutes || 60} min · Cupos disp.: {dialogTurn.slotsAvailable ?? dialogTurn.slots ?? 0}
              </Typography>

              {/* Reservas actuales */}
              <Typography variant="subtitle1" sx={{ mt: 1 }}>Reservas</Typography>
              <Box sx={{ mt: 1 }}>
                {(dialogTurn.reservations || []).length === 0 ? (
                  <Typography color="text.secondary">Sin reservas.</Typography>
                ) : (
                  <Stack spacing={1}>
                    {(dialogTurn.reservations || []).map((r, idx) => (
                      <Box key={idx} sx={{ display:"flex", alignItems:"center", gap:1, flexWrap:"wrap" }}>
                        <Chip label={reservationLabel(r)} />
                        <Tooltip title="Quitar reserva">
                          <IconButton onClick={()=> handleCancelReservation(dialogTurn, r)}>
                            <PersonRemoveIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Agregar por nombre */}
              <Typography variant="subtitle1">Agregar reserva (nombre)</Typography>
              <Box sx={{ display:"flex", gap:1, flexWrap:"wrap", mt:1 }}>
                <TextField size="small" label="Nombre" value={manualName} onChange={(e)=> setManualName(e.target.value)} />
                <TextField
                  select size="small" label="Servicio (opcional)"
                  value={manualServiceId}
                  onChange={(e)=> { setManualServiceId(e.target.value); setManualOptionId(""); }}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">(Sin servicio)</MenuItem>
                  {(services || []).map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </TextField>
                <TextField
                  select size="small" label="Opción/Duración"
                  value={manualOptionId}
                  onChange={(e)=> setManualOptionId(e.target.value)}
                  sx={{ minWidth: 200 }}
                  disabled={!manualServiceId}
                >
                  <MenuItem value="">(Elegir)</MenuItem>
                  {(services.find(s=>s.id===manualServiceId)?.options || []).map(o => (
                    <MenuItem key={o.id} value={o.id}>{o.durationMinutes} min — ${o.price || 0}</MenuItem>
                  ))}
                </TextField>
                <TextField size="small" type="number" label="Duración (min) si no elegís opción" value={manualDuration} onChange={(e)=> setManualDuration(e.target.value)} sx={{ width: 240 }} />
                <Button variant="contained" onClick={handleAddManualReservation}>Agregar</Button>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Agregar por email (usuario existente) */}
              <Typography variant="subtitle1">Agregar reserva (email de usuario)</Typography>
              <Box sx={{ display:"flex", gap:1, flexWrap:"wrap", mt:1 }}>
                <TextField size="small" label="Email del cliente" value={clientEmailLocal} onChange={(e)=> setClientEmailLocal(e.target.value)} sx={{ minWidth: 260 }} />
                <TextField
                  select size="small" label="Servicio (opcional)"
                  value={manualServiceId}
                  onChange={(e)=> { setManualServiceId(e.target.value); setManualOptionId(""); }}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">(Sin servicio)</MenuItem>
                  {(services || []).map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </TextField>
                <TextField
                  select size="small" label="Opción/Duración"
                  value={manualOptionId}
                  onChange={(e)=> setManualOptionId(e.target.value)}
                  sx={{ minWidth: 200 }}
                  disabled={!manualServiceId}
                >
                  <MenuItem value="">(Elegir)</MenuItem>
                  {(services.find(s=>s.id===manualServiceId)?.options || []).map(o => (
                    <MenuItem key={o.id} value={o.id}>{o.durationMinutes} min — ${o.price || 0}</MenuItem>
                  ))}
                </TextField>
                <TextField size="small" type="number" label="Duración (min) si no elegís opción" value={manualDuration} onChange={(e)=> setManualDuration(e.target.value)} sx={{ width: 240 }} />
                <Button variant="contained" onClick={handleAddClientByEmail}>Agregar</Button>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setDialogTurn(null)}>Cerrar</Button>
          <Tooltip title="Eliminar un cupo del slot">
            <IconButton color="error" onClick={()=> dialogTurn && handleDeleteSlot(dialogTurn)}><DeleteOutlineIcon /></IconButton>
          </Tooltip>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar open={toast.open} autoHideDuration={3200} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.sev} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
}

import React, { useEffect, useState } from "react";
import {
  Typography, Box, Button, Grid, Card, CardContent, TextField
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";
import { collection, query, where, onSnapshot, updateDoc, deleteDoc, doc, getDocs, addDoc, arrayUnion } from "firebase/firestore";

import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = { "en-US": require("date-fns/locale/en-US") };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

export default function PlaceDashboard({ user }) {
  const [publishedTurns, setPublishedTurns] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [placeId, setPlaceId] = useState(null);
  const [placeName, setPlaceName] = useState("");
  const [selectedTurn, setSelectedTurn] = useState(null);
  const [manualUid, setManualUid] = useState("");
  const navigate = useNavigate();

  const pad2 = (n) => (n < 10 ? "0" + n : n);
  const yyyymmdd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const HHmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const timeToDate = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00`);

  useEffect(() => {
    const fetchPlace = async () => {
      if (!user?.uid) return;
      try {
        const q = query(collection(db, "places"), where("ownerId", "==", user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const firstPlace = snap.docs[0];
          setPlaceId(firstPlace.id);
          setPlaceName(firstPlace.data().name || "");
        } else {
          setPlaceId(null);
          setPlaceName("");
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchPlace();
  }, [user]);

  useEffect(() => {
    if (!placeId) return;
    const q = query(collection(db, "turnos"), where("placeId", "==", placeId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const turnsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPublishedTurns(turnsData);
    });
    return () => unsubscribe();
  }, [placeId]);

  useEffect(() => {
    if (!placeId) return;
    const q = query(collection(db, "blocks"), where("placeId", "==", placeId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const blockData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBlocks(blockData);
    });
    return () => unsubscribe();
  }, [placeId]);

  const handleLogout = async () => { await signOut(auth); navigate("/"); };

  const handleDeleteSlot = async (turn) => {
    const turnoRef = doc(db, "turnos", turn.id);
    if ((turn.slotsAvailable || turn.slots) > 1) {
      await updateDoc(turnoRef, { slotsAvailable: (turn.slotsAvailable || turn.slots) - 1 });
    } else {
      await deleteDoc(turnoRef);
    }
  };

  const handleCancelReservation = async (turno, userUid) => {
    const turnoRef = doc(db, "turnos", turno.id);
    await updateDoc(turnoRef, {
      slotsAvailable: (turno.slotsAvailable || turno.slots) + 1,
      reservations: (turno.reservations || []).filter(r => (r.uid || r) !== userUid),
    });
  };

  const generateFixedTurns = async () => {
    if (!placeId) return;
    const startDate = new Date();
    const endDate = new Date(); endDate.setDate(endDate.getDate() + 7);
    let created = 0;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = yyyymmdd(d);
      for (let h = 9; h <= 17; h++) {
        const t = HHmm(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0));
        const key = `${dateStr}|${t}`;
        const exists = publishedTurns.find(turn => `${turn.date}|${turn.time}` === key);
        if (!exists) {
          await addDoc(collection(db, "turnos"), { placeId, date: dateStr, time: t, slots: 1, slotsAvailable: 1, reservations: [] });
          created++;
        }
      }
    }
    alert(`Turnos fijos generados: ${created}`);
  };

  const blockRange = async () => {
    if (!placeId) return;
    const start = prompt("Inicio bloqueo (YYYY-MM-DD HH:mm)");
    const end = prompt("Fin bloqueo (YYYY-MM-DD HH:mm)");
    if (!start || !end) return;
    await addDoc(collection(db, "blocks"), { placeId, startTime: start, endTime: end });
  };

  // Reservar manualmente un usuario
  const handleManualReserve = async () => {
    if (!manualUid || !selectedTurn) return alert("Ingrese UID del usuario");
    try {
      const turnoRef = doc(db, "turnos", selectedTurn.id);
      await updateDoc(turnoRef, {
        reservations: arrayUnion({ uid: manualUid, name: manualUid, userEmail: "" }),
        slotsAvailable: (selectedTurn.slotsAvailable || selectedTurn.slots) - 1,
      });
      alert(`Usuario ${manualUid} reservado exitosamente.`);
      setSelectedTurn(null);
      setManualUid("");
    } catch (err) { console.error(err); alert("Error al reservar manualmente."); }
  };

  const events = [];
  publishedTurns.forEach(turn => {
    const start = timeToDate(turn.date, turn.time);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const avail = turn.slotsAvailable || turn.slots;
    const res = turn.reservations || [];
    let title = avail > 0 ? `${turn.time} — Disponible (${avail} disp.)` : `${turn.time} — Ocupado (${res.length})`;
    events.push({ id: turn.id, title, start, end, type: "turn", turn });
  });
  blocks.forEach(b => {
    const start = new Date(b.startTime);
    const end = new Date(b.endTime);
    events.push({ id: `block-${b.id}`, title: `Bloqueado ${b.startTime}-${b.endTime}`, start, end, type: "block", block: b });
  });

  const styles = {
    container: { p: 3, minHeight: "100vh", background: "linear-gradient(135deg, #4e54c8, #8f94fb)", color: "#fff" },
    card: { background: "#6c63ff", color: "#fff" },
    buttonPrimary: { mr: 2, backgroundColor: "#fff", color: "#6c63ff", "&:hover": { backgroundColor: "#eee" } },
    buttonSecondary: { backgroundColor: "#ff6cec", "&:hover": { backgroundColor: "#ff4ed9" } },
  };

  return (
    <Box sx={styles.container}>
      <Typography variant="h4">Dashboard del Lugar</Typography>
      <Typography sx={{ mt: 2 }}>¡Bienvenido, {user.email}!</Typography>
      <Typography variant="h6" sx={{ mt: 1 }}>Lugar: {placeName || "—"}</Typography>

      <Box sx={{ mt: 3, mb: 3 }}>
        <Button variant="contained" sx={styles.buttonPrimary} onClick={() => navigate("/publish-turn", { state: { placeId, placeName } })} disabled={!placeId}>Publicar Turnos</Button>
        <Button variant="contained" sx={styles.buttonSecondary} onClick={handleLogout}>Cerrar Sesión</Button>
        <Button variant="contained" sx={{ ml: 2 }} onClick={generateFixedTurns}>Generar Turnos Fijos</Button>
        <Button variant="contained" sx={{ ml: 2 }} onClick={blockRange}>Bloquear Horario</Button>
      </Box>

      <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>Calendario</Typography>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 500, backgroundColor: "white", color: "black", borderRadius: "8px", padding: "10px" }}
        onSelectEvent={(event) => { if(event.type === "turn") setSelectedTurn(event.turn); else if(event.type === "block") alert(`Bloqueo de ${event.block.startTime} a ${event.block.endTime}`); }}
      />

      {selectedTurn && (
        <Box sx={{ mt: 3, p:2, border: "2px solid #fff", borderRadius: "8px", backgroundColor: "#6c63ff" }}>
          <Typography variant="h6">Editar Turno: {selectedTurn.date} {selectedTurn.time}</Typography>
          <Typography>Slots disponibles: {selectedTurn.slotsAvailable || selectedTurn.slots}</Typography>
          <TextField placeholder="UID del usuario" value={manualUid} onChange={e => setManualUid(e.target.value)} sx={{ mr:2 }} size="small"/>
          <Button variant="contained" onClick={handleManualReserve}>Reservar Usuario</Button>
          <Button variant="outlined" color="error" sx={{ ml:2 }} onClick={() => setSelectedTurn(null)}>Cerrar</Button>
        </Box>
      )}

      <Typography variant="h5" sx={{ mt: 4 }}>Tus Turnos Publicados</Typography>
      {publishedTurns.length === 0 ? <Typography>No has publicado ningún turno todavía.</Typography> :
        <Grid container spacing={2}>
          {publishedTurns.map(turn => (
            <Grid item xs={12} sm={6} md={4} key={turn.id}>
              <Card sx={styles.card} onClick={() => setSelectedTurn(turn)}>
                <CardContent>
                  <Typography variant="h6">Fecha: {turn.date}</Typography>
                  <Typography>Hora: {turn.time}</Typography>
                  <Typography>Slots disponibles: {turn.slotsAvailable || turn.slots}</Typography>
                  {turn.reservations && turn.reservations.length > 0 &&
                    <>
                      <Typography variant="subtitle2" sx={{ mt:1 }}>Usuarios Reservados:</Typography>
                      {turn.reservations.map(r => (
                        <Box key={r.uid || r} sx={{ display:"flex", justifyContent:"space-between", alignItems:"center", mt:0.5 }}>
                          <Typography variant="body2">{r.name || r}</Typography>
                          <Button variant="outlined" color="error" size="small" onClick={() => handleCancelReservation(turn, r.uid || r)}>Cancelar Reserva</Button>
                        </Box>
                      ))}
                    </>
                  }
                  <Button variant="contained" color="secondary" sx={{ mt:1 }} onClick={() => handleDeleteSlot(turn)}>Eliminar Slot</Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      }
    </Box>
  );
}

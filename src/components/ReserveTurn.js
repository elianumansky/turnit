import React, { useState } from "react";
import {
  collection, query, where, getDocs, doc, updateDoc, arrayUnion, getDoc
} from "firebase/firestore";
import { db, auth } from "../firebase";

/**
 * Reserva de usuario en un turno ya publicado (placeId + date + time):
 * - Escribe en reservations objetos { uid, name, userEmail } y decrementa slotsAvailable.
 * - Resuelve name con prioridad: users/{uid}.name -> displayName -> email -> uid.
 */
export default function ReserveTurn({ lugarId }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const resolveUserIdentity = async () => {
    const u = auth.currentUser;
    if (!u) return { name: "uid-desconocido", email: "" };

    let firestoreName = "";
    try {
      // Ajusta "users" si tu colección de perfiles tiene otro nombre
      const userDoc = await getDoc(doc(db, "users", u.uid));
      if (userDoc.exists()) {
        const data = userDoc.data() || {};
        firestoreName = (data.name || data.fullName || "").trim();
      }
    } catch (e) {
      console.warn("[ReserveTurn] No se pudo leer users/{uid}:", e);
    }

    const displayName = (u.displayName || "").trim();
    const email = (u.email || "").trim();

    // Orden fuerte: perfil -> displayName -> email -> uid
    const name = firestoreName || displayName || email || u.uid;

    // Log útil si necesitás diagnosticar
    console.log("[ReserveTurn] resolveUserIdentity =>", {
      firestoreName, displayName, email, chosenName: name, uid: u.uid
    });

    return { name, email };
  };

  const handleReserve = async () => {
    if (!auth.currentUser) {
      alert("Debes estar logueado para reservar un turno.");
      return;
    }
    if (!lugarId || !date || !time) {
      alert("Completá lugar, fecha y hora.");
      return;
    }

    try {
      // Buscar el turno publicado que coincida
      const q = query(
        collection(db, "turnos"),
        where("placeId", "==", lugarId),
        where("date", "==", date),
        where("time", "==", time)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        alert("No se encontró un turno publicado con esa fecha y hora.");
        return;
      }

      // Asumimos unicidad date+time por lugar
      const turnoDoc = snap.docs[0];
      const turnoRef = doc(db, "turnos", turnoDoc.id);
      const turno = turnoDoc.data();

      const avail = Number(turno.slotsAvailable ?? turno.slots ?? 0);
      if (avail <= 0) {
        alert("No hay cupos disponibles para ese turno.");
        return;
      }

      // Identidad del usuario (nombre + email)
      const { name, email } = await resolveUserIdentity();

      // Guardar reserva como OBJETO (no string) y decrementar cupos
      await updateDoc(turnoRef, {
        reservations: arrayUnion({ uid: auth.currentUser.uid, name, userEmail: email }),
        slotsAvailable: avail - 1
      });

      alert("¡Reserva realizada con éxito!");
      setDate("");
      setTime("");
    } catch (error) {
      console.error("Error reservando turno:", error);
      alert("No se pudo reservar el turno. Revisa la consola.");
    }
  };

  return (
    <div>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      <input type="time" value={time} onChange={e => setTime(e.target.value)} />
      <button onClick={handleReserve}>Reservar Turno</button>
    </div>
  );
}
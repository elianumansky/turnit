import React, { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db, auth } from "../firebase";

export default function ReserveTurn({ lugarId }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const handleReserve = async () => {
    if (!auth.currentUser) {
      alert("Debes estar logueado para reservar un turno.");
      return;
    }

    try {
      await addDoc(collection(db, "turnos"), {
        userId: auth.currentUser.uid,
        placeId: lugarId,
        date,
        time
      });
      alert("Turno reservado con éxito!");
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

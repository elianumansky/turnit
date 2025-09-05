import React, { useState, useEffect } from "react";
import { collection, getDocs, doc, updateDoc, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { Typography, Button, Card, CardContent } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function ReserveTurn({ user }) {
  const [availableTurns, setAvailableTurns] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Traer todos los turnos disponibles
  useEffect(() => {
    const fetchAvailableTurns = async () => {
      try {
        const q = query(collection(db, "turnos"), where("slotsAvailable", ">", 0));
        const snapshot = await getDocs(q);
        setAvailableTurns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Error al cargar turnos:", err);
        setError("No se pudieron cargar los turnos disponibles");
      }
    };

    fetchAvailableTurns();
  }, []);

  const handleReserve = async (turno) => {
    setError("");
    try {
      const turnoRef = doc(db, "turnos", turno.id);

      await updateDoc(turnoRef, {
        slotsAvailable: turno.slotsAvailable - 1,
        reservations: turno.reservations
          ? [...turno.reservations, user.uid]
          : [user.uid],
      });

      alert("Turno reservado con éxito!");
      navigate("/dashboard");
    } catch (err) {
      console.error("Error al reservar turno:", err);
      setError("Ocurrió un error al reservar el turno");
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
      <Typography variant="h4" gutterBottom>Turnos Disponibles</Typography>

      {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}

      {availableTurns.length === 0 ? (
        <Typography>No hay turnos disponibles</Typography>
      ) : (
        availableTurns.map(turno => (
          <Card key={turno.id} sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6">{turno.placeName}</Typography>
              <Typography>Fecha: {turno.date}</Typography>
              <Typography>Hora: {turno.time}</Typography>
              <Typography>Turnos disponibles: {turno.slotsAvailable}</Typography>
              <Button
                variant="contained"
                color="primary"
                sx={{ mt: 1 }}
                onClick={() => handleReserve(turno)}
              >
                Reservar
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

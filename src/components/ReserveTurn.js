import React, { useState } from "react";
import { collection, getDocs, query, where, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Typography, Button, TextField } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function ReserveTurn({ user }) {
  const [placeName, setPlaceName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const checkAvailability = async () => {
    const q = query(
      collection(db, "turnos"),
      where("placeName", "==", placeName),
      where("date", "==", date),
      where("time", "==", time)
    );
    const snapshot = await getDocs(q);
    return snapshot.empty;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!placeName || !date || !time) {
      setError("Todos los campos son obligatorios");
      return;
    }
    const available = await checkAvailability();
    if (!available) {
      setError("Este turno ya está reservado");
      return;
    }

    try {
      await addDoc(collection(db, "turnos"), {
        userId: user.uid,
        placeName,
        date,
        time,
      });
      navigate("/dashboard");
    } catch (err) {
      console.error("Error al guardar el turno:", err);
      setError("Ocurrió un error al reservar el turno. Intenta nuevamente.");
    }
  };

  const styles = {
    container: {
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      background: "linear-gradient(135deg, #4e54c8, #8f94fb)",
      color: "#fff",
      textAlign: "center",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      padding: "20px",
    },
    title: {
      fontSize: "2rem",
      fontWeight: "bold",
      marginBottom: "20px",
    },
    form: {
      background: "#fff",
      padding: "20px",
      borderRadius: "10px",
      width: "100%",
      maxWidth: "350px",
      color: "#333",
      display: "flex",
      flexDirection: "column",
      gap: "15px",
    },
    input: {
      padding: "10px",
      borderRadius: "6px",
      border: "1px solid #ccc",
      fontSize: "1rem",
    },
    button: {
      padding: "12px",
      borderRadius: "8px",
      border: "none",
      backgroundColor: "#4e54c8",
      color: "#fff",
      fontSize: "1rem",
      fontWeight: "bold",
      cursor: "pointer",
      transition: "all 0.3s ease",
    },
    error: {
      color: "red",
      fontSize: "0.9rem",
    },
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Reservar Turno</h1>
      <form style={styles.form} onSubmit={handleSubmit}>
        <TextField
          label="Lugar"
          fullWidth
          margin="normal"
          value={placeName}
          onChange={(e) => setPlaceName(e.target.value)}
          required
        />
        <TextField
          label="Fecha"
          type="date"
          fullWidth
          margin="normal"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          required
        />
        <TextField
          label="Hora"
          type="time"
          fullWidth
          margin="normal"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          InputLabelProps={{ shrink: true }}
          required
        />
        {error && <Typography style={styles.error}>{error}</Typography>}
        <Button
          variant="contained"
          type="submit"
          fullWidth
          style={{ ...styles.button, marginTop: "1rem" }}
        >
          Reservar
        </Button>
      </form>
    </div>
  );
}
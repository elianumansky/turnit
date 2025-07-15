import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  Container,
  Typography,
  Button,
  TextField,
  MenuItem,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function ReserveTurn({ user }) {
  const [places, setPlaces] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // Cargar locales de Firestore
    const fetchPlaces = async () => {
      const snapshot = await getDocs(collection(db, "places"));
      const placesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setPlaces(placesData);
    };
    fetchPlaces();
  }, []);

  const checkAvailability = async () => {
    const q = query(
      collection(db, "turnos"),
      where("placeId", "==", selectedPlace),
      where("date", "==", date),
      where("time", "==", time)
    );
    const snapshot = await getDocs(q);
    return snapshot.empty;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!selectedPlace || !date || !time) {
      setError("Todos los campos son obligatorios");
      return;
    }
    const available = await checkAvailability();
    if (!available) {
      setError("Este turno ya está reservado");
      return;
    }

    const placeName = places.find((p) => p.id === selectedPlace)?.name || "";

    await addDoc(collection(db, "turnos"), {
      userId: user.uid,
      placeId: selectedPlace,
      placeName,
      date,
      time,
    });

    navigate("/dashboard");
  };

  return (
    <Container maxWidth="sm" style={{ marginTop: "2rem" }}>
      <Typography variant="h5" gutterBottom>Reservar Turno</Typography>
      <form onSubmit={handleSubmit}>
        <TextField
          select
          label="Lugar"
          fullWidth
          margin="normal"
          value={selectedPlace}
          onChange={(e) => setSelectedPlace(e.target.value)}
          required
        >
          {places.map((place) => (
            <MenuItem key={place.id} value={place.id}>
              {place.name}
            </MenuItem>
          ))}
        </TextField>
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
        {error && <Typography color="error">{error}</Typography>}
        <Button variant="contained" type="submit" fullWidth style={{ marginTop: "1rem" }}>
          Reservar
        </Button>
      </form>
    </Container>
  );
}
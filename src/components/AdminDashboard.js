import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { signOut } from "firebase/auth";
import {
  Container,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  TextField,
  MenuItem,
} from "@mui/material";

export default function AdminDashboard() {
  const [turnos, setTurnos] = useState([]);
  const [places, setPlaces] = useState([]);
  const [filterPlace, setFilterPlace] = useState("");
  const [filterDate, setFilterDate] = useState("");

  useEffect(() => {
    const fetchPlaces = async () => {
      const snapshot = await (await import("firebase/firestore")).getDocs(collection(db, "places"));
      const placesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setPlaces(placesData);
    };
    fetchPlaces();
  }, []);

  useEffect(() => {
    let q = collection(db, "turnos");
    if (filterPlace && filterDate) {
      q = query(
        collection(db, "turnos"),
        where("placeId", "==", filterPlace),
        where("date", "==", filterDate)
      );
    } else if (filterPlace) {
      q = query(collection(db, "turnos"), where("placeId", "==", filterPlace));
    } else if (filterDate) {
      q = query(collection(db, "turnos"), where("date", "==", filterDate));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setTurnos(data);
    });

    return () => unsubscribe();
  }, [filterPlace, filterDate]);

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <Container maxWidth="md" style={{ marginTop: "2rem" }}>
      <Typography variant="h4" gutterBottom>Panel de Administración</Typography>
      <Button variant="outlined" color="error" onClick={handleLogout} style={{ marginBottom: "1rem" }}>
        Cerrar sesión
      </Button>

      <TextField
        select
        label="Filtrar por Lugar"
        value={filterPlace}
        onChange={(e) => setFilterPlace(e.target.value)}
        fullWidth
        margin="normal"
      >
        <MenuItem value="">Todos</MenuItem>
        {places.map((place) => (
          <MenuItem key={place.id} value={place.id}>{place.name}</MenuItem>
        ))}
      </TextField>

      <TextField
        label="Filtrar por Fecha"
        type="date"
        value={filterDate}
        onChange={(e) => setFilterDate(e.target.value)}
        fullWidth
        margin="normal"
        InputLabelProps={{ shrink: true }}
      />

      <List>
        {turnos.length === 0 && <Typography>No hay turnos reservados.</Typography>}
        {turnos.map((turno) => (
          <ListItem key={turno.id} divider>
  <ListItemText
    primary={`Lugar: ${turno.placeName}`}
    secondary={`Fecha: ${turno.date} Hora: ${turno.time} - Usuario ID: ${turno.userId}`}
  />
</ListItem>

        ))}
      </List>
    </Container>
  );
}
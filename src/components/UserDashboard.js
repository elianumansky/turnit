import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import {
  Container,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate } from "react-router-dom";

export default function UserDashboard({ user }) {
  const [turnos, setTurnos] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, "turnos"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const turnosData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setTurnos(turnosData);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogout = () => {
    signOut(auth);
  };

  const handleCancel = async (id) => {
    await deleteDoc(doc(db, "turnos", id));
  };

  return (
    <Container maxWidth="md" style={{ marginTop: "2rem" }}>
      <Typography variant="h4" gutterBottom>
        Bienvenido, {user.displayName || user.email}
      </Typography>
      <Button variant="outlined" color="error" onClick={handleLogout} style={{ marginBottom: "1rem" }}>
        Cerrar sesión
      </Button>
      <Button variant="contained" onClick={() => navigate("/reserve")} style={{ marginBottom: "1rem", marginLeft: "1rem" }}>
        Reservar Turno
      </Button>
      <Typography variant="h5" gutterBottom>
        Tus Turnos
      </Typography>
      <List>
        {turnos.length === 0 && <Typography>No tienes turnos reservados.</Typography>}
        {turnos.map((turno) => (
          <ListItem key={turno.id} divider>
            <ListItemText
 primary={`Lugar: ${turno.placeName}`}
secondary={`Fecha: ${turno.date} Hora: ${turno.time}`}
/>
            <ListItemSecondaryAction>
              <IconButton edge="end" color="error" onClick={() => handleCancel(turno.id)}>
                <DeleteIcon />
              </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        ))}
      </List>
    </Container>
  );
}
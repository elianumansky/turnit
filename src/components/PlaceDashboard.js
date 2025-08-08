import React, { useEffect, useState } from "react";
import { Typography, Box, Button, List, ListItem, ListItemText, ListItemSecondaryAction, IconButton } from "@mui/material";
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import DeleteIcon from "@mui/icons-material/Delete";

export default function PlaceDashboard({ user }) {
  const [publishedTurns, setPublishedTurns] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      const q = query(collection(db, "availableTurns"), where("placeId", "==", user.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const turnsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPublishedTurns(turnsData);
      });
      return () => unsubscribe();
    }
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  const handleDeleteTurn = async (turnId) => {
    try {
      await deleteDoc(doc(db, "availableTurns", turnId));
      alert("Turno eliminado con éxito.");
    } catch (error) {
      console.error("Error al eliminar el turno:", error);
      alert("Hubo un error al eliminar el turno.");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4">
        Dashboard del Lugar
      </Typography>
      <Typography sx={{ mt: 2 }}>
        ¡Bienvenido, {user.email}!
      </Typography>
      <Button 
        variant="contained" 
        sx={{ mt: 3, mr: 2 }} 
        onClick={() => navigate('/publish-turn')}
      >
        Publicar Turnos
      </Button>
      <Button 
        onClick={handleLogout} 
        variant="contained" 
        color="secondary"
        sx={{ mt: 3 }}
      >
        Cerrar Sesión
      </Button>
      
      <Typography variant="h5" sx={{ mt: 4 }}>
        Tus Turnos Publicados
      </Typography>
      <List>
        {publishedTurns.length === 0 ? (
          <Typography>No has publicado ningún turno todavía.</Typography>
        ) : (
          publishedTurns.map((turn) => (
            <ListItem key={turn.id} divider>
              <ListItemText
                primary={`Fecha: ${turn.date} - Hora: ${turn.time}`}
                secondary={`Slots disponibles: ${turn.slotsAvailable}`}
              />
              <ListItemSecondaryAction>
                <IconButton edge="end" color="error" onClick={() => handleDeleteTurn(turn.id)}>
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))
        )}
      </List>
    </Box>
  );
}
import React, { useEffect, useState } from "react";
import {
  Typography,
  Box,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Grid,
  Card,
  CardContent,
} from "@mui/material";
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import DeleteIcon from "@mui/icons-material/Delete";

export default function PlaceDashboard({ user }) {
  const [publishedTurns, setPublishedTurns] = useState([]);
  const [placeId, setPlaceId] = useState(null);
  const navigate = useNavigate();

  // Obtener placeId del usuario logueado
  useEffect(() => {
    const fetchPlaceId = async () => {
      if (!user) return;

      try {
        const placeRef = doc(db, "places", user.uid);
        const placeSnap = await getDoc(placeRef);
        if (placeSnap.exists()) {
          const data = placeSnap.data();
          setPlaceId(data.placeId);
        } else {
          console.log("No se encontró documento del lugar");
        }
      } catch (err) {
        console.error("Error al obtener placeId:", err);
      }
    };
    fetchPlaceId();
  }, [user]);

  // Obtener turnos publicados del lugar
  useEffect(() => {
    if (!placeId) return;

    const q = query(collection(db, "turnos"), where("placeId", "==", placeId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const turnsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setPublishedTurns(turnsData);
    });

    return () => unsubscribe();
  }, [placeId]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (err) {
      console.error("Error al cerrar sesión:", err);
    }
  };

  const handleDeleteTurn = async (turnId) => {
    try {
      await deleteDoc(doc(db, "turnos", turnId));
      alert("Turno eliminado con éxito.");
    } catch (err) {
      console.error(err);
      alert("Error al eliminar turno.");
    }
  };

  const handleCancelReservation = async (turno, userUid) => {
    try {
      const turnoRef = doc(db, "turnos", turno.id);
      await updateDoc(turnoRef, {
        slotsAvailable: turno.slotsAvailable + 1,
        reservations: turno.reservations.filter(uid => uid !== userUid),
      });
      alert(`Reserva del usuario ${userUid} cancelada y el turno está disponible.`);
    } catch (err) {
      console.error(err);
      alert("Error al cancelar la reserva.");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4">Dashboard del Lugar</Typography>
      <Typography sx={{ mt: 2 }}>¡Bienvenido, {user.email}!</Typography>

      <Button
        variant="contained"
        color="primary"
        sx={{ mt: 3, mr: 2 }}
        onClick={() => navigate("/publish-turn")}
      >
        Publicar Turnos
      </Button>

      <Button
        variant="contained"
        color="secondary"
        sx={{ mt: 3 }}
        onClick={handleLogout}
      >
        Cerrar Sesión
      </Button>

      <Typography variant="h5" sx={{ mt: 4 }}>Tus Turnos Publicados</Typography>
      {publishedTurns.length === 0 ? (
        <Typography>No has publicado ningún turno todavía.</Typography>
      ) : (
        <Grid container spacing={2}>
          {publishedTurns.map((turn) => (
            <Grid item xs={12} sm={6} md={4} key={turn.id}>
              <Card>
                <CardContent>
                  <Typography variant="h6">Fecha: {turn.date}</Typography>
                  <Typography>Hora: {turn.time}</Typography>
                  <Typography>Slots disponibles: {turn.slotsAvailable}</Typography>

                  {/* Lista de usuarios reservados */}
                  {turn.reservations && turn.reservations.length > 0 && (
                    <>
                      <Typography variant="subtitle2" sx={{ mt: 1 }}>Usuarios Reservados:</Typography>
                      {turn.reservations.map(uid => (
                        <Box key={uid} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 0.5 }}>
                          <Typography variant="body2">{uid}</Typography>
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            onClick={() => handleCancelReservation(turn, uid)}
                          >
                            Cancelar Reserva
                          </Button>
                        </Box>
                      ))}
                    </>
                  )}

                  <Button
                    variant="contained"
                    color="error"
                    sx={{ mt: 1 }}
                    onClick={() => handleDeleteTurn(turn.id)}
                  >
                    Eliminar Turno
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}


import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  Typography, Stack, Card, CardContent, Chip, Divider, Button, Alert
} from "@mui/material";
// Si usás Firebase Auth, importá y usa el uid real:
// import { getAuth } from "firebase/auth";

export default function PlaceDetail() {
  const { id } = useParams();
  const [place, setPlace] = useState(null);
  const [turnos, setTurnos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    (async () => {
      const pSnap = await getDoc(doc(db, "places", id));
      if (pSnap.exists()) setPlace({ id: pSnap.id, ...pSnap.data() });
    })();
  }, [id]);

  useEffect(() => {
    (async () => {
      const q = query(collection(db, "turnos"), where("placeId", "==", id));
      const snap = await getDocs(q);
      setTurnos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    })();
  }, [id]);

  const reservar = async (turno) => {
    try {
      // const uid = getAuth().currentUser?.uid || "anon";
      const uid = "usuario-actual";
      await updateDoc(doc(db, "turnos", turno.id), { userId: uid });
      setMsg("¡Turno reservado con éxito!");
      // refresco rápido en memoria
      setTurnos((prev) => prev.map(t => t.id === turno.id ? { ...t, userId: uid } : t));
    } catch (e) {
      console.error(e);
      setMsg("Hubo un error al reservar.");
    }
  };

  if (!place) return <Typography>Buscando lugar…</Typography>;

  return (
    <Stack spacing={2}>
      <Typography variant="h5">{place.name}</Typography>
      <Divider />
      {msg && <Alert severity="info">{msg}</Alert>}
      {loading ? (
        <Typography>Cargando turnos...</Typography>
      ) : (
        <Stack spacing={2}>
          {turnos.length === 0 && <Typography>No hay turnos disponibles.</Typography>}
          {turnos.map((t) => (
            <Card key={t.id} variant="outlined">
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography>{t.date} · {t.time}</Typography>
                  {t.userId ? (
                    <Chip label="Reservado" />
                  ) : (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => reservar(t)}
                    >
                      Reservar
                    </Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

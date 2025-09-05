import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { haversineKm } from "../utils/distance";

// UI (Material UI, adapta si usás otra librería)
import {
  Card, CardContent, CardHeader, CardActions,
  Typography, Chip, Stack, Button, Divider, CircularProgress, Alert
} from "@mui/material";
import { useNavigate } from "react-router-dom";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function PlacesNearby() {
  const [places, setPlaces] = useState([]);
  const [turnosByPlace, setTurnosByPlace] = useState({});
  const [userLoc, setUserLoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [geoError, setGeoError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeoError("Tu navegador no soporta geolocalización.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError("No pudimos obtener tu ubicación. Habilitá el permiso."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const snap = await getDocs(collection(db, "places"));
      const data = snap.docs.map((d) => {
        const x = d.data();
        let lat, lng;
        if (x.location && typeof x.location.latitude === "number") {
          lat = x.location.latitude; lng = x.location.longitude;
        } else {
          lat = x.lat; lng = x.lng;
        }
        return { id: d.id, ...x, lat, lng };
      });
      if (mounted) setPlaces(data);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tCol = collection(db, "turnos");
      const snap = await getDocs(query(tCol, where("date", ">=", todayISO()), orderBy("date", "asc")));
      const grouped = {};
      snap.forEach((doc) => {
        const t = { id: doc.id, ...doc.data() };
        if (!grouped[t.placeId]) grouped[t.placeId] = [];
        grouped[t.placeId].push(t);
      });
      if (!cancelled) {
        setTurnosByPlace(grouped);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const placesSorted = useMemo(() => {
    const list = places.map((p) => {
      let distanceKm = null;
      if (userLoc && typeof p.lat === "number" && typeof p.lng === "number") {
        distanceKm = haversineKm(userLoc.lat, userLoc.lng, p.lat, p.lng);
      }
      return { ...p, distanceKm };
    });
    return list.sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return (a.name || "").localeCompare(b.name || "");
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }, [places, userLoc]);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Lugares cercanos y turnos disponibles
      </Typography>

      {geoError && <Alert severity="warning">{geoError}</Alert>}

      {loading && (
        <Stack direction="row" alignItems="center" spacing={1}>
          <CircularProgress size={20} /> <Typography>Cargando turnos...</Typography>
        </Stack>
      )}

      {!loading && placesSorted.length === 0 && (
        <Alert severity="info">No hay lugares cargados todavía.</Alert>
      )}

      {placesSorted.map((place) => {
        const turnos = turnosByPlace[place.id] || [];
        return (
          <Card key={place.id} variant="outlined">
            <CardHeader
              title={
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                  <Typography variant="h6">{place.name || "Sin nombre"}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {place.distanceKm != null ? (
                      <Chip label={`${place.distanceKm.toFixed(1)} km`} />
                    ) : (
                      <Chip label="Distancia desconocida" variant="outlined" />
                    )}
                  </Stack>
                </Stack>
              }
              subheader={place.address || ""}
            />
            <CardContent>
              {turnos.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No hay turnos próximos publicados para este lugar.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Turnos publicados
                  </Typography>
                  <Divider />
                  <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
                    {turnos.slice(0, 12).map((t) => (
                      <Chip
                        key={t.id}
                        label={`${t.date} · ${t.time}`}
                        variant={t.userId ? "outlined" : "filled"}
                        color={t.userId ? "default" : "primary"}
                        title={t.userId ? "Reservado" : "Disponible"}
                      />
                    ))}
                  </Stack>
                </Stack>
              )}
            </CardContent>
            <CardActions sx={{ justifyContent: "flex-end" }}>
              <Button size="small" variant="text" onClick={() => navigate(`/place/${place.id}`)}>
                Ver más
              </Button>
            </CardActions>
          </Card>
        );
      })}
    </Stack>
  );
}

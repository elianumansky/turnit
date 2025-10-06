import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardMedia,
  Snackbar,
  Alert,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  FormControl,
  InputLabel,
  Stack,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

// Leaflet
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Botón de pago
import PaymentButton from "../components/PaymentButton";

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// función para obtener coordenadas desde Nominatim
const fetchCoordinates = async (address) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        address
      )}`
    );
    const data = await response.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error al obtener coordenadas:", error);
    return null;
  }
};

export default function PlaceProfile({ user }) {
  const navigate = useNavigate();
  const [placeId, setPlaceId] = useState(null);
  const [name, setName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState([]);
  const [address, setAddress] = useState("");
  const [coordinates, setCoordinates] = useState(null);
  const [toast, setToast] = useState({ open: false, msg: "", sev: "success" });

  const categoryOptions = [
    "Peluquería",
    "Barbería",
    "Estética / Spa",
    "Consultorio Médico",
    "Consultorio Odontológico",
    "Kinesiología / Fisioterapia",
    "Veterinaria",
    "Gimnasio",
    "Escuela de Danza / Yoga",
    "Taller Mecánico",
    "Taller de Motos",
    "Estudio Jurídico",
    "Coworking",
    "Clases Particulares",
    "Otros Servicios",
  ];

  useEffect(() => {
    const loadPlace = async () => {
      if (!user?.uid) return;
      let qOwner = query(
        collection(db, "places"),
        where("ownerId", "==", user.uid)
      );
      let snap = await getDocs(qOwner);

      if (snap.empty) {
        let qStaff = query(
          collection(db, "places"),
          where("staffIds", "array-contains", user.uid)
        );
        snap = await getDocs(qStaff);
      }

      if (!snap.empty) {
        const d = snap.docs[0];
        setPlaceId(d.id);
        const p = d.data();
        setName(p.name || "");
        setPhotoUrl(p.photoUrl || "");
        setDescription(p.description || "");
        setCategories(p.categories || []);
        setAddress(p.address || "");
        setCoordinates(p.coordinates || null);
      } else {
        setToast({
          open: true,
          sev: "error",
          msg: "No se encontró un lugar asociado.",
        });
      }
    };
    loadPlace();
  }, [user]);

  const save = async () => {
    try {
      if (!placeId) return;

      let coords = coordinates;
      if (address.trim()) {
        coords = await fetchCoordinates(address.trim());
        setCoordinates(coords);
      }

      await updateDoc(doc(db, "places", placeId), {
        name: name.trim(),
        photoUrl: photoUrl.trim(),
        description: description.trim(),
        categories,
        address: address.trim(),
        coordinates: coords || null,
        updatedAt: new Date(),
      });

      setToast({ open: true, sev: "success", msg: "Perfil actualizado." });
    } catch (e) {
      console.error(e);
      setToast({ open: true, sev: "error", msg: "No se pudo guardar." });
    }
  };

  return (
    <Box
      sx={{
        p: 3,
        minHeight: "100vh",
        background: "linear-gradient(135deg,#4e54c8,#8f94fb)",
        color: "#fff",
      }}
    >
      <Typography variant="h4" sx={{ mb: 2 }}>
        Perfil del Lugar
      </Typography>

      <Box
        sx={{
          background: "#fff",
          color: "#000",
          borderRadius: 12,
          p: 2,
          maxWidth: 720,
        }}
      >
        {photoUrl ? (
          <Card sx={{ mb: 2 }}>
            <CardMedia
              component="img"
              height="220"
              image={photoUrl}
              alt="Foto del lugar"
            />
          </Card>
        ) : null}

        <TextField
          label="Nombre del lugar"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          sx={{ mb: 2 }}
        />
        <TextField
          label="URL de la foto (https://...)"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          fullWidth
          sx={{ mb: 2 }}
        />
        <TextField
          label="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          multiline
          minRows={3}
          sx={{ mb: 2 }}
        />

        {/* Dirección editable */}
        <TextField
          label="Dirección (ciudad, barrio, calle)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          fullWidth
          sx={{ mb: 2 }}
        />

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="category-label">Categorías</InputLabel>
          <Select
            labelId="category-label"
            multiple
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            renderValue={(selected) => selected.join(", ")}
          >
            {categoryOptions.map((cat) => (
              <MenuItem key={cat} value={cat}>
                <Checkbox checked={categories.indexOf(cat) > -1} />
                <ListItemText primary={cat} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <Button variant="contained" onClick={save}>
            Guardar
          </Button>
          <Button variant="outlined" onClick={() => navigate("/place-dashboard")}>
            Volver
          </Button>
        </Box>

        {/* Mapa con Leaflet */}
        {coordinates ? (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Ubicación actual
            </Typography>
            <MapContainer
              center={[coordinates.lat, coordinates.lng]}
              zoom={15}
              style={{ height: "300px", width: "100%", borderRadius: "12px" }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
              <Marker
                position={[coordinates.lat, coordinates.lng]}
                icon={markerIcon}
              >
                <Popup>{name || "Tu lugar"}</Popup>
              </Marker>
            </MapContainer>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ mt: 2 }}>
            Aún no se guardó ubicación para este lugar.
          </Typography>
        )}

        {/* Botón de pago de prueba */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Probar pago de turno
          </Typography>
          <PaymentButton turno={{ precio: 500 }} />
        </Box>
      </Box>

      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={toast.sev}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
        >
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

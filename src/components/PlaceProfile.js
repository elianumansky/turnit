import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection, query, where, getDocs, doc, updateDoc
} from "firebase/firestore";
import {
  Box, Typography, TextField, Button, Card, CardMedia, Snackbar, Alert,
  Select, MenuItem, Checkbox, ListItemText, FormControl, InputLabel
} from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function PlaceProfile({ user }) {
  const navigate = useNavigate();
  const [placeId, setPlaceId] = useState(null);
  const [name, setName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState([]);
  const [toast, setToast] = useState({ open: false, msg: "", sev: "success" });

  // Lista de categorías comunes
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
    "Otros Servicios"
  ];

  useEffect(() => {
    const loadPlace = async () => {
      if (!user?.uid) return;
      // dueño
      let qOwner = query(collection(db, "places"), where("ownerId", "==", user.uid));
      let snap = await getDocs(qOwner);
      if (snap.empty) {
        // staff
        let qStaff = query(collection(db, "places"), where("staffIds", "array-contains", user.uid));
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
      } else {
        setToast({ open: true, sev: "error", msg: "No se encontró un lugar asociado." });
      }
    };
    loadPlace();
  }, [user]);

  const save = async () => {
    try {
      if (!placeId) return;
      await updateDoc(doc(db, "places", placeId), {
        name: name.trim(),
        photoUrl: photoUrl.trim(),
        description: description.trim(),
        categories,
        updatedAt: new Date()
      });
      setToast({ open: true, sev: "success", msg: "Perfil actualizado." });
    } catch (e) {
      setToast({ open: true, sev: "error", msg: "No se pudo guardar." });
    }
  };

  return (
    <Box sx={{ p: 3, minHeight: "100vh", background: "linear-gradient(135deg,#4e54c8,#8f94fb)", color: "#fff" }}>
      <Typography variant="h4" sx={{ mb: 2 }}>Perfil del Lugar</Typography>

      <Box sx={{ background: "#fff", color: "#000", borderRadius: 12, p: 2, maxWidth: 720 }}>
        {photoUrl ? (
          <Card sx={{ mb: 2 }}>
            <CardMedia component="img" height="220" image={photoUrl} alt="Foto del lugar" />
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

        {/* Selector de Categorías */}
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

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" onClick={save}>Guardar</Button>
          <Button variant="outlined" onClick={() => navigate("/place-dashboard")}>Volver</Button>
        </Box>
      </Box>

      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast.sev} variant="filled" onClose={() => setToast((t) => ({ ...t, open: false }))}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

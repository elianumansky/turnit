import React, { useState, useEffect } from "react";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Typography, Box, TextField, Button, IconButton } from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import { Add, Delete } from "@mui/icons-material";

export default function PublishTurn({ user }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [placeId, setPlaceId] = useState(null);
  const [placeName, setPlaceName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState(1);
  const [error, setError] = useState("");

  // Nuevo estado
  const [turnType, setTurnType] = useState(""); // tipo de turno (tenis, pileta, etc.)
  const [options, setOptions] = useState([]);   // array de duraciones y precios

  useEffect(() => {
    const fetchPlace = async () => {
      if (!user?.uid) return;

      if (location.state?.placeId) {
        setPlaceId(location.state.placeId);
        setPlaceName(location.state.placeName || "Mi Lugar");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.placeId) {
            setPlaceId(data.placeId);
            setPlaceName(data.placeName || "Mi Lugar");
          } else setError("No se encontró un lugar asociado al usuario.");
        }
      } catch (err) {
        console.error(err);
        setError("Error al obtener los datos del lugar.");
      }
    };

    fetchPlace();
  }, [user, location.state]);

  const handleAddOption = () => {
    setOptions([...options, { duration: "", price: "" }]);
  };

  const handleRemoveOption = (index) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleOptionChange = (index, field, value) => {
    const newOptions = [...options];
    newOptions[index][field] = value;
    setOptions(newOptions);
  };

  const handlePublish = async (e) => {
    e.preventDefault();
    setError("");

    if (!user?.uid) return setError("Debes iniciar sesión.");
    if (!placeId) return setError("No se pudo obtener el ID del lugar.");
    if (!date || !time) return setError("Completá fecha y hora.");

    try {
      const dateTimeISO = new Date(`${date}T${time}:00`).toISOString();

      await addDoc(collection(db, "turnos"), {
        userId: user.uid,
        userName: user.displayName || user.email || "Usuario",
        placeId,
        placeName,
        date,
        time,
        dateTime: dateTimeISO,
        slots: Math.max(1, Number(slots)),
        slotsAvailable: Math.max(1, Number(slots)),
        reservations: [],
        createdAt: serverTimestamp(),
        type: turnType || null,      // puede quedar vacío
        options: options.length > 0  // si hay opciones las guarda
          ? options.map(opt => ({
              duration: Number(opt.duration),
              price: Number(opt.price),
            }))
          : [],
      });

      navigate("/place-dashboard");
    } catch (err) {
      console.error(err);
      setError("No se pudo publicar el turno.");
    }
  };

  if (!user) return <Typography>Iniciá sesión para publicar turnos.</Typography>;

  return (
    <Box component="form" onSubmit={handlePublish} p={2}>
      <Typography variant="h6">Publicar Turno</Typography>
      <Typography>Lugar: {placeName || "—"}</Typography>

      <TextField
        label="Tipo de turno (opcional)"
        value={turnType}
        onChange={(e) => setTurnType(e.target.value)}
        fullWidth
        sx={{ mt: 2 }}
      />

      <TextField
        label="Fecha"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        InputLabelProps={{ shrink: true }}
        fullWidth
        required
        sx={{ mt: 2 }}
      />
      <TextField
        label="Hora"
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        InputLabelProps={{ shrink: true }}
        fullWidth
        required
        sx={{ mt: 2 }}
      />
      <TextField
        label="Cupos"
        type="number"
        value={slots}
        onChange={(e) => setSlots(e.target.value)}
        inputProps={{ min: 1 }}
        fullWidth
        sx={{ mt: 2 }}
      />

      <Box mt={2}>
        <Typography variant="subtitle1">Opciones de duración y precio (opcional)</Typography>
        {options.map((opt, index) => (
          <Box key={index} display="flex" gap={2} mt={1}>
            <TextField
              label="Duración (min)"
              type="number"
              value={opt.duration}
              onChange={(e) => handleOptionChange(index, "duration", e.target.value)}
            />
            <TextField
              label="Precio ($)"
              type="number"
              value={opt.price}
              onChange={(e) => handleOptionChange(index, "price", e.target.value)}
            />
            <IconButton onClick={() => handleRemoveOption(index)} color="error">
              <Delete />
            </IconButton>
          </Box>
        ))}
        <Button startIcon={<Add />} onClick={handleAddOption} sx={{ mt: 1 }}>
          Agregar opción
        </Button>
      </Box>

      {error && <Typography color="error" mt={2}>{error}</Typography>}
      <Button type="submit" variant="contained" sx={{ mt: 2 }}>Publicar</Button>
    </Box>
  );
}

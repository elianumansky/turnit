import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  TextField, Button, Typography, Box, Select, MenuItem,
  InputLabel, FormControl, Checkbox, ListItemText
} from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function RegisterPlace() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [categories, setCategories] = useState([]);
  const [ownerName, setOwnerName] = useState(""); // opcional: nombre del dueño
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Lista de categorías comunes
  const categoryOptions = [
    "Peluquería","Barbería","Estética / Spa","Consultorio Médico","Consultorio Odontológico",
    "Kinesiología / Fisioterapia","Veterinaria","Gimnasio","Escuela de Danza / Yoga",
    "Taller Mecánico","Taller de Motos","Estudio Jurídico","Coworking","Clases Particulares","Otros Servicios"
  ];

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password || !placeName || !address || categories.length === 0) {
      setError("Completa todos los campos y seleccioná al menos una categoría");
      setLoading(false);
      return;
    }

    try {
      // 1) Crear usuario en Firebase Auth
      const { user } = await createUserWithEmailAndPassword(auth, email, password);

      // 2) (Opcional) setear nombre visible del dueño en Auth
      const cleanOwner = ownerName.trim();
      if (cleanOwner) {
        await updateProfile(user, { displayName: cleanOwner });
      }

      // 3) Crear el documento del lugar en Firestore
      const placesRef = collection(db, "places");
      const newPlaceRef = doc(placesRef); // ID autogenerado
      const placeId = newPlaceRef.id;

      await setDoc(newPlaceRef, {
        placeId,
        ownerId: user.uid,
        name: placeName,
        email: user.email,
        address,
        categories,
        // campos para lo nuevo:
        services: [],             // dueño podrá cargarlos luego
        flexibleEnabled: false,   // podés encenderlo desde el dashboard
        depositPercent: 0,        // configurable en el dashboard
        createdAt: serverTimestamp(),
      });

      // 4) Crear documento en 'users' con rol 'place'
      await setDoc(doc(db, "users", user.uid), {
        userId: user.uid,
        email: user.email,
        name: cleanOwner || "",
        role: "place",
        placeId,
        placeName,
        categories,
        createdAt: serverTimestamp(),
      });

      // 5) Enviar verificación de email y bloquear acceso hasta verificar
      await sendEmailVerification(user);
      await signOut(auth);
      alert("Te enviamos un email de verificación. Verificá tu correo y luego iniciá sesión.");

      navigate("/login");
    } catch (err) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") setError("Correo ya registrado.");
      else if (err.code === "auth/weak-password") setError("La contraseña debe tener al menos 6 caracteres.");
      else if (err.code === "auth/invalid-email") setError("El email no es válido.");
      else setError("Error al registrar el lugar. Revisa los datos.");
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      minHeight: "100vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background: "linear-gradient(135deg, #4e54c8, #8f94fb)",
      p: 3,
    },
    card: {
      background: "#6c63ff",
      p: 4,
      borderRadius: 3,
      width: 360,
      color: "#fff",
      boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
    },
    input: {
      mb: 2,
      "& .MuiInputBase-root": { color: "#fff" },
      "& .MuiInputLabel-root": { color: "#ddd" },
      "& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline": { borderColor: "#bbb" },
      "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#fff" },
    },
    button: {
      mt: 1,
      backgroundColor: "#fff",
      color: "#6c63ff",
      "&:hover": { backgroundColor: "#eee" },
    },
    errorText: { mb: 2, color: "#ff6b81" },
  };

  return (
    <Box sx={styles.container}>
      <Box sx={styles.card}>
        <Typography variant="h5" mb={3} align="center">
          Registrar mi Lugar
        </Typography>
        <form onSubmit={handleRegister}>
          <TextField
            label="Nombre del Lugar"
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
            fullWidth
            required
            sx={styles.input}
          />
          <TextField
            label="Nombre del Dueño (opcional)"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            fullWidth
            sx={styles.input}
          />
          <TextField
            label="Dirección"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            fullWidth
            required
            sx={styles.input}
          />
          <FormControl fullWidth sx={styles.input}>
            <InputLabel id="category-label" sx={{ color: "#ddd" }}>Categorías</InputLabel>
            <Select
              labelId="category-label"
              multiple
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              renderValue={(selected) => selected.join(", ")}
              sx={{ color: "#fff" }}
            >
              {categoryOptions.map((cat) => (
                <MenuItem key={cat} value={cat}>
                  <Checkbox checked={categories.indexOf(cat) > -1} />
                  <ListItemText primary={cat} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            required
            sx={styles.input}
          />
          <TextField
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            required
            sx={styles.input}
          />
          {error && <Typography sx={styles.errorText}>{error}</Typography>}
          <Button type="submit" variant="contained" fullWidth sx={styles.button} disabled={loading}>
            {loading ? "Registrando..." : "Registrar Lugar"}
          </Button>
        </form>
      </Box>
    </Box>
  );
}

import React, { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { TextField, Button, Typography, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";

// Geocodificar dirección con Nominatim (opcional)
async function geocodeAddress(address) {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`,
      { headers: { "User-Agent": "TurnIt-App/1.0 (contacto@turnit.com)" } }
    );
    const data = await resp.json();
    if (!data || !data[0]) throw new Error("No se pudo geocodificar la dirección");
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (err) {
    console.error("Error al geocodificar:", err);
    return null;
  }
}

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password || !name || !address) {
      setError("Por favor completa todos los campos");
      setLoading(false);
      return;
    }

    try {
      // 1) Crear usuario en Auth
      const { user } = await createUserWithEmailAndPassword(auth, email, password);

      // 2) Setear displayName en Auth
      const cleanName = name.trim();
      if (cleanName.length > 0) {
        await updateProfile(auth.currentUser, { displayName: cleanName });
      }

      // 3) Geocodificar dirección (opcional)
      const location = await geocodeAddress(address);

      // 4) Guardar perfil en Firestore
      await setDoc(doc(db, "users", user.uid), {
        userId: user.uid,
        email: user.email,
        name: cleanName,
        role: "user",
        address,
        location,
        points: 0,
        favoritePlaces: [],
        createdAt: serverTimestamp(),
      });

      navigate("/user-dashboard");
    } catch (err) {
      console.error("Error al registrar el usuario:", err);
      if (err.code === "auth/email-already-in-use") {
        setError("El correo electrónico ya está registrado.");
      } else if (err.code === "auth/weak-password") {
        setError("La contraseña debe tener al menos 6 caracteres.");
      } else {
        setError("Error al registrar el usuario. Revisa los datos e intenta nuevamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      background: "linear-gradient(135deg, #4e54c8, #8f94fb)",
      color: "#fff",
      textAlign: "center",
      padding: "20px",
    },
    title: { fontSize: "2rem", fontWeight: "bold", marginBottom: "20px" },
    form: {
      background: "#fff",
      padding: "20px",
      borderRadius: "10px",
      width: "100%",
      maxWidth: "350px",
      color: "#333",
      display: "flex",
      flexDirection: "column",
      gap: "15px",
    },
    error: { color: "red", fontSize: "0.9rem" },
  };

  return (
    <Box style={styles.container}>
      <Typography variant="h5" component="h1" style={styles.title}>
        Registrar Usuario
      </Typography>
      <form onSubmit={handleRegister} style={styles.form}>
        <TextField
          label="Nombre Completo"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <TextField
          label="Dirección"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <Typography style={styles.error}>{error}</Typography>}
        <Button variant="contained" color="primary" type="submit" disabled={loading}>
          {loading ? "Registrando..." : "Registrar"}
        </Button>
      </form>
    </Box>
  );
}

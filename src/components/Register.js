import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { TextField, Button, Typography, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import bcrypt from "bcryptjs";

// Función para convertir dirección en coordenadas con Nominatim
async function geocodeAddress(address) {
  const resp = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`,
    { headers: { "User-Agent": "TurnIt-App/1.0 (tuemail@ejemplo.com)" } }
  );

  const data = await resp.json();
  if (!data || !data[0]) throw new Error("No se pudo geocodificar la dirección");
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
  };
}

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    try {
      // 1) Registrar en Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2) Hashear la contraseña antes de guardarla en Firestore
      const hashedPassword = bcrypt.hashSync(password, 10);

      // 3) Geocodificar dirección
      const location = await geocodeAddress(address);

      // 4) Guardar datos en Firestore
      await setDoc(doc(db, "users", user.uid), {
        userId: user.uid,
        email: user.email,
        password: hashedPassword,   // <--- contraseña segura
        name,
        role: "user",
        address,
        location,
        createdAt: new Date(),
      });

      console.log("Usuario registrado con éxito");
      navigate("/dashboard");
    } catch (error) {
      console.error("Error al registrar el usuario:", error);
      if (error.code === "auth/email-already-in-use") {
        setError("El correo electrónico ya está en uso. Por favor, inicia sesión o usa otro correo.");
      } else {
        setError("Error al registrar el usuario. Por favor, revisa los datos.");
      }
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
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      padding: "20px",
    },
    title: {
      fontSize: "2rem",
      fontWeight: "bold",
      marginBottom: "20px",
    },
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
    error: {
      color: "red",
      fontSize: "0.9rem",
    },
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
        {error && <Typography color="error" style={styles.error}>{error}</Typography>}
        <Button variant="contained" type="submit">
          Registrar
        </Button>
      </form>
    </Box>
  );
}

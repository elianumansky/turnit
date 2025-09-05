import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, collection } from "firebase/firestore";
import { auth, db } from "../firebase";
import { TextField, Button, Typography, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function RegisterPlace() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password || !placeName || !address) {
      setError("Completa todos los campos");
      return;
    }

    try {
      // 1) Crear el usuario en Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2) Crear el documento del lugar en Firestore
      const placesRef = collection(db, "places");
      const newPlaceRef = doc(placesRef);
      const placeId = newPlaceRef.id;

      await setDoc(newPlaceRef, {
        placeId,
        userId: user.uid,
        name: placeName,
        email: user.email,
        address, // dirección manual obligatoria
        createdAt: new Date(),
      });

      alert("Lugar registrado con éxito ✅");
      navigate("/place-dashboard");
    } catch (err) {
      console.error("Error al registrar el lugar:", err);
      setError("Error al registrar el lugar. Revisa los datos e intenta nuevamente.");
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
      maxWidth: "400px",
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
      <Typography variant="h5" style={styles.title}>Registrar mi Lugar</Typography>
      <form onSubmit={handleRegister} style={styles.form}>
        <TextField
          label="Nombre del Lugar"
          value={placeName}
          onChange={(e) => setPlaceName(e.target.value)}
          required
        />
        <TextField
          label="Dirección"
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
        <Button type="submit" variant="contained" color="primary">
          Registrar Lugar
        </Button>
      </form>
    </Box>
  );
}

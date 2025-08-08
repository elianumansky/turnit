import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { TextField, Button, Typography, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function RegisterPlace() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Guarda la información del lugar en la colección 'places' de Firestore
      await setDoc(doc(db, "places", user.uid), {
        name: placeName,
        email: user.email,
        ownerId: user.uid,
      });

      console.log("Lugar registrado con éxito");
      navigate("/place-dashboard"); // Redirecciona al nuevo dashboard del lugar
    } catch (error) {
      console.error("Error al registrar el lugar:", error);
      setError("Error al registrar el lugar. Por favor, revisa los datos.");
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
    input: {
      padding: "10px",
      borderRadius: "6px",
      border: "1px solid #ccc",
      fontSize: "1rem",
    },
    button: {
      padding: "12px",
      borderRadius: "8px",
      border: "none",
      backgroundColor: "#4e54c8",
      color: "#fff",
      fontSize: "1rem",
      fontWeight: "bold",
      cursor: "pointer",
      transition: "all 0.3s ease",
    },
    error: {
      color: "red",
      fontSize: "0.9rem",
    },
  };

  return (
    <Box style={styles.container}>
      <Typography variant="h5" component="h1" style={styles.title}>
        Registrar mi Lugar
      </Typography>
      <form onSubmit={handleRegister} style={styles.form}>
        <TextField
          label="Nombre del Lugar"
          type="text"
          value={placeName}
          onChange={(e) => setPlaceName(e.target.value)}
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
        <Button variant="contained" type="submit" style={styles.button}>
          Registrar
        </Button>
      </form>
    </Box>
  );
}
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { TextField, Button, Typography, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password) {
      setError("Completa todos los campos");
      setLoading(false);
      return;
    }

    try {
      // Iniciar sesión con el mismo auth que usamos en el registro
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("Usuario logueado:", userCredential.user.uid);

      // Redirigir según rol o dashboard
      navigate("/place-dashboard");
    } catch (err) {
      console.error(err);
      if (err.code === "auth/user-not-found") setError("No existe una cuenta con este correo.");
      else if (err.code === "auth/wrong-password") setError("Contraseña incorrecta.");
      else if (err.code === "auth/invalid-email") setError("Correo inválido.");
      else setError("Error al iniciar sesión. Revisa tus datos.");
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
          Iniciar Sesión
        </Typography>
        <form onSubmit={handleLogin}>
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
            {loading ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
      </Box>
    </Box>
  );
}

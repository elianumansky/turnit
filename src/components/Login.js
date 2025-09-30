import React, { useState } from "react";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth, db, googleProvider } from "../firebase";
import { useNavigate } from "react-router-dom";
import { Box, TextField, Button, Typography, Divider } from "@mui/material";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const routeByRole = (userData) => {
    if (userData?.role === "place") {
      navigate("/place-dashboard");
    } else if (userData?.role === "user") {
      navigate("/user-dashboard");
    } else {
      // fallback: si no hay rol, lo mandamos a user dashboard
      navigate("/user-dashboard");
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      // Autenticación con Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Bloquear si el email no está verificado (solo para email/password)
      if (!user.emailVerified) {
        await signOut(auth);
        setError("Debés verificar tu email antes de ingresar. Revisá tu bandeja de entrada.");
        return;
      }

      // Obtener documento del usuario en Firestore
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        setError("Usuario no registrado en Firestore.");
        return;
      }

      const userData = userDoc.data();
      routeByRole(userData);
    } catch (err) {
      console.error("Error al iniciar sesión:", err);
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        setError("Credenciales incorrectas.");
      } else if (err.code === "auth/user-not-found") {
        setError("Usuario no registrado.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Demasiados intentos. Probá más tarde.");
      } else {
        setError("No se pudo iniciar sesión.");
      }
    }
  };

  const handleLoginWithGoogle = async () => {
    setError("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Para Google, emailVerified viene true por defecto
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);

      // Si no existe el doc, lo creamos con rol "user" por defecto
      if (!snap.exists()) {
        await setDoc(userRef, {
          userId: user.uid,
          email: user.email,
          name: user.displayName || "",
          role: "user",
          createdAt: serverTimestamp(),
          // Podés guardar photoURL, phoneNumber, etc.
        });
        routeByRole({ role: "user" });
        return;
      }

      routeByRole(snap.data());
    } catch (err) {
      console.error("Google Sign-In error:", err);
      if (err.code === "auth/popup-closed-by-user") {
        setError("Inicio de sesión cancelado.");
      } else {
        setError("No se pudo iniciar sesión con Google.");
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
    googleBtn: {
      marginTop: 10,
      backgroundColor: "#fff",
      color: "#333",
      border: "1px solid #ddd",
      fontWeight: 700,
    },
  };

  return (
    <Box style={styles.container}>
      <Typography variant="h5" component="h1" style={styles.title}>
        Iniciar Sesión
      </Typography>
      <form onSubmit={handleLogin} style={styles.form}>
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
        <Button variant="contained" type="submit" style={styles.button}>
          Iniciar Sesión
        </Button>

        <Divider sx={{ my: 1 }} />
        <Button variant="outlined" onClick={handleLoginWithGoogle} style={styles.googleBtn}>
          Continuar con Google
        </Button>
      </form>
    </Box>
  );
}

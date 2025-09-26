import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { Box, TextField, Button, Typography } from '@mui/material';
import { doc, getDoc } from 'firebase/firestore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // Autenticación con Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Obtener documento del usuario en Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        setError('Usuario no registrado en Firestore');
        return;
      }

      const userData = userDoc.data();
      console.log('Datos del usuario:', userData);

      // Redirección según rol
      if (userData.role === 'place') {
        navigate('/place-dashboard');
      } else if (userData.role === 'user') {
        navigate('/user-dashboard');
      } else {
        setError('Rol de usuario desconocido');
      }
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
      setError('Credenciales incorrectas o usuario no registrado.');
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
      </form>
    </Box>
  );
}
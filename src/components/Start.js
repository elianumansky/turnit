import React from "react";
import { Link } from "react-router-dom";
import { Typography, Button, Box } from "@mui/material";

export default function Start() {
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
      fontSize: "2.5rem",
      fontWeight: "bold",
      marginBottom: "10px",
    },
    subtitle: {
      fontSize: "1.2rem",
      marginBottom: "30px",
    },
    link: {
      textDecoration: "none",
    },
    buttonGroup: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "15px",
      marginTop: "20px",
    },
    button: {
      padding: "12px 24px",
      borderRadius: "8px",
      backgroundColor: "transparent",
      color: "#fff",
      border: "2px solid #fff",
      fontSize: "1rem",
      fontWeight: "bold",
      transition: "all 0.3s ease",
      "&:hover": {
        backgroundColor: "#fff",
        color: "#4e54c8",
        border: "2px solid transparent",
      },
    },
  };

  return (
    <Box sx={styles.container}>
      <Typography variant="h3" component="h1" sx={styles.title}>
        TurnIt
      </Typography>
      <Typography variant="h6" sx={styles.subtitle}>
        ¡La app de turnos definitiva!
      </Typography>
      <Box sx={styles.buttonGroup}>
        <Button
          component={Link}
          to="/register"
          variant="outlined"
          sx={styles.button}
        >
          Registrarme como Usuario
        </Button>
        <Button
          component={Link}
          to="/login"
          variant="outlined"
          sx={styles.button}
        >
          Iniciar Sesión
        </Button>
        <Button
          component={Link}
          to="/register-place"
          variant="outlined"
          sx={styles.button}
        >
          Registrar mi Lugar
        </Button>
      </Box>
    </Box>
  );
}
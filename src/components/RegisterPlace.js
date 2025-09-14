import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { TextField, Button, Typography, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function RegisterPlace() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password || !placeName || !address) {
      setError("Completa todos los campos");
      setLoading(false);
      return;
    }

    try {
      // 1) Crear usuario en Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2) Crear el documento del lugar en Firestore
      const placesRef = collection(db, "places");
      const newPlaceRef = doc(placesRef); // ID autogenerado
      const placeId = newPlaceRef.id;

      await setDoc(newPlaceRef, {
        placeId,
        ownerId: user.uid,
        name: placeName,
        email: user.email,
        address,
        createdAt: serverTimestamp(),
      });

      // 3) Crear documento en 'users' con rol 'place'
      await setDoc(doc(db, "users", user.uid), {
        userId: user.uid,
        email: user.email,
        role: "place",
        placeId,
        placeName,
        createdAt: serverTimestamp(),
      });

      navigate("/place-dashboard");
    } catch (err) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") setError("Correo ya registrado.");
      else if (err.code === "auth/weak-password") setError("La contraseña debe tener al menos 6 caracteres.");
      else setError("Error al registrar el lugar. Revisa los datos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", p: 3 }}>
      <Box sx={{ background: "#fff", p: 3, borderRadius: 2, width: 350 }}>
        <Typography variant="h5" mb={2}>Registrar mi Lugar</Typography>
        <form onSubmit={handleRegister}>
          <TextField label="Nombre del Lugar" value={placeName} onChange={(e) => setPlaceName(e.target.value)} fullWidth required sx={{ mb: 2 }} />
          <TextField label="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} fullWidth required sx={{ mb: 2 }} />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth required sx={{ mb: 2 }} />
          <TextField label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth required sx={{ mb: 2 }} />
          {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
          <Button type="submit" variant="contained" color="primary" fullWidth disabled={loading}>
            {loading ? "Registrando..." : "Registrar Lugar"}
          </Button>
        </form>
      </Box>
    </Box>
  );
}

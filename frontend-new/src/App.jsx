import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./page/home";
import Register from "./page/register";
import Login from "./page/login";
import Profile from "./page/profile";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
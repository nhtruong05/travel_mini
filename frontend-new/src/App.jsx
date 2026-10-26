import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Home from "./page/home";
import Login from "./page/login";
import Register from "./page/register";
import Profile from "./page/profile";

import BusSearch from "./page/BusSearch";
import BusResults from "./page/BusResults";
import BusSeats from "./page/BusSeats";
import BusCheckout from "./page/BusCheckout";
import BusBookings from "./page/BusBookings";
import BusTicket from "./page/BusTicket";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Các trang cũ */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<Profile />} />

        {/* Các trang đặt vé xe */}
        <Route
          path="/bus"
          element={<Navigate to="/bus/search" replace />}
        />
        <Route path="/bus/search" element={<BusSearch />} />
        <Route path="/bus/results" element={<BusResults />} />
        <Route
          path="/bus/trips/:tripId/seats"
          element={<BusSeats />}
        />
        <Route path="/bus/checkout" element={<BusCheckout />} />
        <Route path="/bus/bookings" element={<BusBookings />} />
        <Route
          path="/bus/bookings/:bookingCode"
          element={<BusTicket />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
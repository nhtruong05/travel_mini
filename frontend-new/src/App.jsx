import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Home from "./page/Home";
import Login from "./page/Login";
import Register from "./page/Register";
import Profile from "./page/Profile";

import BusSearch from "./page/bus/Search";
import BusResults from "./page/bus/Results";
import BusSeats from "./page/bus/Seats";
import BusCheckout from "./page/bus/Checkout";
import BusBookings from "./page/bus/Bookings";
import BusTicket from "./page/bus/Ticket";

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
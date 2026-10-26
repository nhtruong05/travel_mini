
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

import FlightSearch from "./page/FlightSearch";
import FlightResults from "./page/FlightResults";
import FlightCheckout from "./page/FlightCheckout";
import FlightTicket from "./page/FlightTicket";
import FlightBookings from "./page/FlightBookings";

import TrainSearch from "./page/TrainSearch";
import TrainResults from "./page/TrainResults";
import TrainCheckout from "./page/TrainCheckout";
import TrainTicket from "./page/TrainTicket";
import TrainBookings from "./page/TrainBookings";


function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Trang chung */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<Profile />} />

        {/* Đặt vé xe khách */}
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

        {/* Đặt vé máy bay */}
        <Route
          path="/flight"
          element={<Navigate to="/flight/search" replace />}
        />
        <Route path="/flight/search" element={<FlightSearch />} />
        <Route path="/flight/results" element={<FlightResults />} />
        <Route path="/flight/checkout" element={<FlightCheckout />} />
        <Route
          path="/flight/ticket/:bookingCode"
          element={<FlightTicket />}
        />
        <Route path="/flight/bookings" element={<FlightBookings />} />

        {/* Đặt vé tàu hỏa */}
        <Route
          path="/train"
          element={<Navigate to="/train/search" replace />}
        />
        <Route path="/train/search" element={<TrainSearch />} />
        <Route path="/train/results" element={<TrainResults />} />
        <Route path="/train/checkout" element={<TrainCheckout />} />
        <Route
          path="/train/ticket/:bookingCode"
          element={<TrainTicket />}
        />
        <Route path="/train/bookings" element={<TrainBookings />} />

        {/* Route không tồn tại */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

